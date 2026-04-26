import fs from 'fs';
import path from 'path';
import { Session } from '../types';
import { getDb } from '../db';

const DATA_DIR = path.resolve(__dirname, '../../.data');
const OLD_SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

function migrateFromJson(): void {
  if (!fs.existsSync(OLD_SESSIONS_FILE)) return;
  try {
    const raw = fs.readFileSync(OLD_SESSIONS_FILE, 'utf-8');
    const data = JSON.parse(raw) as any[];
    if (!Array.isArray(data) || data.length === 0) {
      fs.renameSync(OLD_SESSIONS_FILE, `${OLD_SESSIONS_FILE}.migrated`);
      return;
    }
    const insert = getDb().prepare(`
      INSERT OR REPLACE INTO sessions (
        id, userId, repoUrl, repoFullName, repoPath, worktreePath,
        branch, model, modelName, effort, status,
        createdAt, lastActivityAt, stoppedAt, outputBuffer, messages
      ) VALUES (
        $id, $userId, $repoUrl, $repoFullName, $repoPath, $worktreePath,
        $branch, $model, $modelName, $effort, $status,
        $createdAt, $lastActivityAt, $stoppedAt, $outputBuffer, $messages
      )
    `);
    const migrate = getDb().transaction((rows: any[]) => {
      for (const s of rows) {
        insert.run({
          id: s.id,
          userId: s.userId,
          repoUrl: s.repoUrl ?? '',
          repoFullName: s.repoFullName ?? '',
          repoPath: s.repoPath ?? '',
          worktreePath: s.worktreePath ?? '',
          branch: s.branch ?? '',
          model: s.model ?? 'claude',
          modelName: s.modelName ?? null,
          effort: s.effort ?? 'medium',
          status: s.status ?? 'ended',
          createdAt: s.createdAt ?? Date.now(),
          lastActivityAt: s.lastActivityAt ?? Date.now(),
          stoppedAt: s.stoppedAt ?? null,
          outputBuffer: s.outputBuffer ?? '',
          messages: JSON.stringify(s.messages ?? []),
        });
      }
    });
    migrate(data);
    fs.renameSync(OLD_SESSIONS_FILE, `${OLD_SESSIONS_FILE}.migrated`);
    console.log(`[persistence] migrated ${data.length} session(s) from JSON to SQLite`);
  } catch (err) {
    console.error('[persistence] JSON migration failed:', err);
  }
}

export type PersistedSession = Omit<Session, 'pty' | 'watcher' | 'parser' | '_onData' | '_onExit' | '_onFiles'>;

export function loadSessions(): PersistedSession[] {
  migrateFromJson();
  try {
    const rows = getDb().prepare('SELECT * FROM sessions').all() as any[];
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      repoUrl: r.repoUrl,
      repoFullName: r.repoFullName,
      repoPath: r.repoPath,
      worktreePath: r.worktreePath,
      branch: r.branch,
      model: r.model,
      modelName: r.modelName ?? undefined,
      effort: r.effort,
      status: r.status,
      createdAt: r.createdAt,
      lastActivityAt: r.lastActivityAt,
      stoppedAt: r.stoppedAt ?? undefined,
      outputBuffer: r.outputBuffer,
      messages: JSON.parse(r.messages),
    }));
  } catch (err) {
    console.error('[persistence] failed to load sessions:', err);
    return [];
  }
}

export function saveSessions(sessions: Map<string, Session>): void {
  try {
    const insert = getDb().prepare(`
      INSERT OR REPLACE INTO sessions (
        id, userId, repoUrl, repoFullName, repoPath, worktreePath,
        branch, model, modelName, effort, status,
        createdAt, lastActivityAt, stoppedAt, outputBuffer, messages
      ) VALUES (
        $id, $userId, $repoUrl, $repoFullName, $repoPath, $worktreePath,
        $branch, $model, $modelName, $effort, $status,
        $createdAt, $lastActivityAt, $stoppedAt, $outputBuffer, $messages
      )
    `);
    const save = getDb().transaction((rows: PersistedSession[]) => {
      for (const s of rows) {
        insert.run({
          id: s.id,
          userId: s.userId,
          repoUrl: s.repoUrl,
          repoFullName: s.repoFullName,
          repoPath: s.repoPath,
          worktreePath: s.worktreePath,
          branch: s.branch,
          model: s.model,
          modelName: s.modelName ?? null,
          effort: s.effort,
          status: s.status,
          createdAt: s.createdAt,
          lastActivityAt: s.lastActivityAt,
          stoppedAt: s.stoppedAt ?? null,
          outputBuffer: s.outputBuffer,
          messages: JSON.stringify(s.messages),
        });
      }
    });
    const rows: PersistedSession[] = Array.from(sessions.values()).map((s) => ({
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
    save(rows);
  } catch (err) {
    console.error('[persistence] failed to save sessions:', err);
  }
}

export function deleteSession(id: string): void {
  try {
    getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id);
  } catch (err) {
    console.error('[persistence] failed to delete session:', err);
  }
}
