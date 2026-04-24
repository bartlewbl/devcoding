import * as ptyLib from 'node-pty';
import chokidar from 'chokidar';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';
import { cloneOrFetch, createWorktree, removeWorktree, pushBranch, getChangedFiles } from './git';
import { OutputParser, ParsedChunk } from './parser';
import { Session, SessionSummary } from '../types';

const OUTPUT_BUFFER_MAX = 50_000;
const sessions = new Map<string, Session>();

export function toSummary(s: Session): SessionSummary {
  return {
    id: s.id,
    branch: s.branch,
    model: s.model,
    effort: s.effort,
    status: s.status,
    repoFullName: s.repoFullName,
    createdAt: s.createdAt,
  };
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function listSessions(): SessionSummary[] {
  return Array.from(sessions.values()).map(toSummary);
}

export async function createSession(
  repoUrl: string,
  repoFullName: string,
  model: 'claude' | 'kimi',
  effort: 'low' | 'medium' | 'high',
  token: string
): Promise<Session> {
  const id = uuidv4();
  const branch = `ai/${model}-${Date.now()}`;

  const session: Session = {
    id,
    repoUrl,
    repoFullName,
    repoPath: '',
    worktreePath: '',
    branch,
    model,
    effort,
    status: 'creating',
    createdAt: Date.now(),
    outputBuffer: '',
    parser: new OutputParser(),
  };

  sessions.set(id, session);

  const repoPath = await cloneOrFetch(repoUrl, repoFullName, token);
  session.repoPath = repoPath;

  const worktreePath = await createWorktree(repoPath, id, branch, token, repoUrl);
  session.worktreePath = worktreePath;
  session.status = 'ready';

  return session;
}

export function spawnCLI(
  session: Session,
  onData: (raw: string) => void,
  onParsed: (chunk: ParsedChunk) => void,
  onExit: () => void
): void {
  const cmdName = session.model === 'claude' ? 'claude' : 'kimi';
  const args: string[] = [];

  if (session.model === 'claude') {
    if (session.effort === 'high') args.push('--model', 'claude-opus-4-7');
    else if (session.effort === 'low') args.push('--model', 'claude-haiku-4-5-20251001');
    else args.push('--model', 'claude-sonnet-4-6');
  }

  // Spawn the user's login shell so it sources nvm/homebrew/etc.
  // Then type the CLI command into it — the shell's PATH will have everything.
  const shell = process.env.SHELL || '/bin/zsh';
  const cmdLine = args.length ? `${cmdName} ${args.join(' ')}` : cmdName;

  console.log(`[PTY] spawning shell ${shell} → will run: ${cmdLine} in ${session.worktreePath}`);

  const proc = ptyLib.spawn(shell, ['-l', '-i'], {
    name: 'xterm-256color',
    cols: 220,
    rows: 50,
    cwd: session.worktreePath,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      HOME: os.homedir(),
    },
  });

  // Give the shell ~800ms to source its profile, then launch the CLI
  setTimeout(() => proc.write(cmdLine + '\r'), 800);

  proc.onData((data: string) => {
    // Keep a rolling buffer for terminal replay on reconnect
    session.outputBuffer = (session.outputBuffer + data).slice(-OUTPUT_BUFFER_MAX);
    onData(data);
    session.parser.process(data).forEach(onParsed);
  });

  proc.onExit(() => {
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

  s.pty?.kill();
  await s.watcher?.close();

  if (s.repoPath && s.worktreePath) {
    await removeWorktree(s.repoPath, s.worktreePath).catch(() => null);
  }

  s.status = 'ended';
}

export async function pushSession(id: string): Promise<void> {
  const s = sessions.get(id);
  if (!s?.worktreePath) throw new Error('Session not found');
  await pushBranch(s.worktreePath, s.branch);
}
