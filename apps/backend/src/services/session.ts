import * as ptyLib from 'node-pty';
import chokidar from 'chokidar';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';
import { cloneOrFetch, createWorktree, removeWorktree, pushBranch, getChangedFiles, mergeToMain as gitMergeToMain, pushMain } from './git';
import { OutputParser, ParsedChunk } from './parser';
import { Session, SessionSummary, ChatMessage } from '../types';
import { recordUsage } from './usage';
import { loadSessions } from './persistence';

const OUTPUT_BUFFER_MAX = 50_000;
const sessions = new Map<string, Session>();

export function initSessions(): void {
  const persisted = loadSessions();
  for (const s of persisted) {
    sessions.set(s.id, s as Session);
  }
  console.log(`[session] loaded ${persisted.length} persisted session(s)`);
}

export function toSummary(s: Session): SessionSummary {
  return {
    id: s.id,
    branch: s.branch,
    model: s.model,
    modelName: s.modelName,
    effort: s.effort,
    status: s.status,
    repoFullName: s.repoFullName,
    createdAt: s.createdAt,
    lastActivityAt: s.lastActivityAt,
  };
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function listSessions(userId?: string): SessionSummary[] {
  const all = Array.from(sessions.values());
  const filtered = userId ? all.filter((s) => s.userId === userId) : all;
  return filtered.map(toSummary);
}

export function getActiveSessionIds(): Set<string> {
  return new Set(sessions.keys());
}

export async function createSession(
  userId: string,
  repoUrl: string,
  repoFullName: string,
  model: 'claude' | 'kimi' | 'codex',
  effort: 'low' | 'medium' | 'high',
  token: string,
  modelName?: string
): Promise<Session> {
  const id = uuidv4();
  const branch = `ai/${model}-${Date.now()}`;

  const session: Session = {
    id,
    userId,
    repoUrl,
    repoFullName,
    repoPath: '',
    worktreePath: '',
    branch,
    model,
    modelName,
    effort,
    status: 'creating',
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    outputBuffer: '',
    messages: [],
  };

  sessions.set(id, session);

  const repoPath = await cloneOrFetch(repoUrl, repoFullName, token);
  session.repoPath = repoPath;

  const worktreePath = await createWorktree(repoPath, id, branch, token, repoUrl, repoFullName);
  session.worktreePath = worktreePath;
  session.status = 'ready';

  return session;
}

export function addMessage(id: string, message: ChatMessage): boolean {
  const s = sessions.get(id);
  if (!s) return false;
  s.messages.push(message);
  // Keep last 500 messages to avoid unbounded growth
  if (s.messages.length > 500) {
    s.messages = s.messages.slice(-500);
  }
  return true;
}

export function touchSession(id: string): boolean {
  const s = sessions.get(id);
  if (!s) return false;
  s.lastActivityAt = Date.now();
  return true;
}

export function stopSession(id: string): boolean {
  const s = sessions.get(id);
  if (!s || s.status !== 'running') return false;
  s.status = 'stopped';
  s.stoppedAt = Date.now();
  s.pty?.kill();
  s.watcher?.close();
  s.pty = undefined;
  s.watcher = undefined;
  s.parser = undefined;
  return true;
}

export function restartSession(
  id: string,
  onData: (raw: string) => void,
  onParsed: (chunk: ParsedChunk) => void,
  onExit: () => void,
  onFiles: (files: string[]) => void
): Session | undefined {
  const s = sessions.get(id);
  if (!s || s.status !== 'stopped') return undefined;
  s.stoppedAt = undefined;
  s.lastActivityAt = Date.now();
  // Set status early so concurrent joins don't spawn duplicate PTYs
  s.status = 'ready';
  spawnCLI(s, onData, onParsed, onExit);
  watchFiles(s, onFiles);
  return s;
}

export function spawnCLI(
  session: Session,
  onData: (raw: string) => void,
  onParsed: (chunk: ParsedChunk) => void,
  onExit: () => void
): void {
  const cmdName =
    session.model === 'claude' ? 'claude' :
    session.model === 'kimi' ? 'kimi' :
    'codex';
  const args: string[] = [];

  if (session.model === 'claude') {
    if (session.modelName) {
      args.push('--model', session.modelName);
    } else {
      if (session.effort === 'high') args.push('--model', 'claude-opus-4-7');
      else if (session.effort === 'low') args.push('--model', 'claude-haiku-4-5-20251001');
      else args.push('--model', 'claude-sonnet-4-6');
    }
  } else if (session.model === 'codex' && session.modelName) {
    args.push('--model', session.modelName);
  }
  // Kimi uses default_model from ~/.kimi/config.toml — passing --model breaks OAuth login

  // Spawn the user's login shell so it sources nvm/homebrew/etc.
  // Then upgrade the CLI and launch it — the shell's PATH will have everything.
  const shell = process.env.SHELL || '/bin/bash';
  const cmdLine = args.length ? `${cmdName} ${args.join(' ')}` : cmdName;
  const brewUpgrade =
    session.model === 'claude' ? 'brew upgrade claude-code' :
    session.model === 'kimi' ? 'uv tool upgrade kimi-cli' :
    'npm install -g @openai/codex';
  const fullCmd = `${brewUpgrade}; ${cmdLine}`;

  console.log(`[PTY] spawning shell ${shell} → will run: ${fullCmd} in ${session.worktreePath}`);

  const proc = ptyLib.spawn(shell, ['-l', '-i'], {
    name: 'xterm-256color',
    cols: 160,
    rows: 40,
    cwd: session.worktreePath,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      HOME: os.homedir(),
    },
  });

  const parser = new OutputParser(
    session.model,
    onParsed,
    (event) => {
      recordUsage(session.id, session.userId, event.provider, session.modelName, event.rawLine);
    }
  );
  session.parser = parser;

  // Give the shell ~800ms to source its profile, then upgrade + launch the CLI
  setTimeout(() => proc.write(fullCmd + '\r'), 800);

  proc.onData((data: string) => {
    // Keep a rolling buffer for terminal replay on reconnect
    session.outputBuffer = (session.outputBuffer + data).slice(-OUTPUT_BUFFER_MAX);
    onData(data);
    parser.process(data);
  });

  proc.onExit(() => {
    if (session.status === 'stopped' || session.status === 'ended') return;
    session.status = 'ended';
    onExit();
  });

  session.pty = proc;
  session.status = 'running';
}

export function watchFiles(
  session: Session,
  onChange: (files: string[]) => void
): void {
  const watcher = chokidar.watch(session.worktreePath, {
    ignored: /(\.git|node_modules)/,
    persistent: true,
    ignoreInitial: true,
  });

  let debounce: ReturnType<typeof setTimeout>;
  const emit = () => {
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      const files = await getChangedFiles(session.worktreePath);
      onChange(files);
    }, 600);
  };

  watcher.on('change', emit).on('add', emit).on('unlink', emit);
  session.watcher = watcher;
}

export async function endSession(id: string): Promise<void> {
  const s = sessions.get(id);
  if (!s) return;

  s.status = 'ended';
  s.stoppedAt = Date.now();
  s.pty?.kill();
  await s.watcher?.close();

  if (s.repoPath && s.worktreePath) {
    await removeWorktree(s.repoPath, s.worktreePath, s.id).catch(() => null);
  }
}

export function updateSessionConfig(
  id: string,
  updates: Partial<Pick<Session, 'model' | 'modelName' | 'effort'>>
): SessionSummary | undefined {
  const s = sessions.get(id);
  if (!s) return undefined;
  if (updates.model !== undefined) s.model = updates.model;
  if (updates.modelName !== undefined) s.modelName = updates.modelName;
  if (updates.effort !== undefined) s.effort = updates.effort;
  return toSummary(s);
}

export async function pushSession(id: string): Promise<void> {
  const s = sessions.get(id);
  if (!s?.worktreePath) throw new Error('Session not found');
  await pushBranch(s.worktreePath, s.branch);
}

export async function mergeToMainSession(id: string): Promise<void> {
  const s = sessions.get(id);
  if (!s?.repoPath || !s?.worktreePath) throw new Error('Session not found');
  await gitMergeToMain(s.repoPath, s.worktreePath, s.branch);
  await pushMain(s.repoPath);
}
