import fs from 'fs';
import path from 'path';
import { Session } from '../types';

const DATA_DIR = path.resolve(__dirname, '../../.data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

export type PersistedSession = Omit<Session, 'pty' | 'watcher' | 'parser'>;

export function loadSessions(): PersistedSession[] {
  if (!fs.existsSync(SESSIONS_FILE)) return [];
  try {
    const raw = fs.readFileSync(SESSIONS_FILE, 'utf-8');
    const data = JSON.parse(raw) as PersistedSession[];
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('[persistence] failed to load sessions:', err);
    return [];
  }
}

export function saveSessions(sessions: Map<string, Session>): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const data: PersistedSession[] = Array.from(sessions.values()).map((s) => ({
      id: s.id,
      userId: s.userId,
      repoUrl: s.repoUrl,
      repoFullName: s.repoFullName,
      repoPath: s.repoPath,
      worktreePath: s.worktreePath,
      branch: s.branch,
      model: s.model,
      modelName: s.modelName,
      effort: s.effort,
      status: s.status,
      createdAt: s.createdAt,
      lastActivityAt: s.lastActivityAt,
      stoppedAt: s.stoppedAt,
      outputBuffer: s.outputBuffer,
      messages: s.messages,
    }));
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[persistence] failed to save sessions:', err);
  }
}
