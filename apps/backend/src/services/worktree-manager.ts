import fs from 'fs';
import path from 'path';
import os from 'os';
import simpleGit from 'simple-git';

const BASE = path.join(os.homedir(), '.ai-code-studio');
const WORKTREES = path.join(BASE, 'worktrees');
const REGISTRY_FILE = path.join(BASE, 'worktrees.json');

export interface WorktreeEntry {
  sessionId: string;
  repoPath: string;
  repoFullName: string;
  branch: string;
  worktreePath: string;
  createdAt: number;
  removedAt?: number;
}

export interface WorktreeStatus {
  sessionId: string;
  repoFullName: string;
  branch: string;
  worktreePath: string;
  createdAt: number;
  exists: boolean;
  isOrphaned: boolean;
  sizeBytes?: number;
}

function ensureBase() {
  if (!fs.existsSync(BASE)) fs.mkdirSync(BASE, { recursive: true });
  if (!fs.existsSync(WORKTREES)) fs.mkdirSync(WORKTREES, { recursive: true });
}

function readRegistry(): WorktreeEntry[] {
  if (!fs.existsSync(REGISTRY_FILE)) return [];
  try {
    const raw = fs.readFileSync(REGISTRY_FILE, 'utf-8');
    const data = JSON.parse(raw) as WorktreeEntry[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeRegistry(entries: WorktreeEntry[]) {
  ensureBase();
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(entries, null, 2));
}

export function registerWorktree(entry: WorktreeEntry): void {
  const entries = readRegistry();
  // Remove any existing entry for this sessionId to avoid duplicates
  const filtered = entries.filter((e) => e.sessionId !== entry.sessionId);
  filtered.push(entry);
  writeRegistry(filtered);
}

export function unregisterWorktree(sessionId: string): void {
  const entries = readRegistry();
  const entry = entries.find((e) => e.sessionId === sessionId);
  if (entry) {
    entry.removedAt = Date.now();
  }
  writeRegistry(entries);
}

export function listRegisteredWorktrees(): WorktreeEntry[] {
  return readRegistry().filter((e) => !e.removedAt);
}

export function getWorktreeSize(dir: string): number {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.name === '.git') continue; // skip gitdir reference, it's tiny
      if (entry.isDirectory()) {
        total += getWorktreeSize(full);
      } else {
        total += fs.statSync(full).size;
      }
    }
  } catch {
    // ignore permission errors
  }
  return total;
}

export async function listWorktreeStatuses(activeSessionIds: Set<string>): Promise<WorktreeStatus[]> {
  ensureBase();
  const registered = listRegisteredWorktrees();
  const diskNames = fs.existsSync(WORKTREES) ? fs.readdirSync(WORKTREES) : [];
  const diskSet = new Set(diskNames);

  const statuses: WorktreeStatus[] = [];
  const seen = new Set<string>();

  for (const entry of registered) {
    seen.add(entry.sessionId);
    const exists = diskSet.has(entry.sessionId) && fs.existsSync(entry.worktreePath);
    statuses.push({
      sessionId: entry.sessionId,
      repoFullName: entry.repoFullName,
      branch: entry.branch,
      worktreePath: entry.worktreePath,
      createdAt: entry.createdAt,
      exists,
      isOrphaned: exists && !activeSessionIds.has(entry.sessionId),
      sizeBytes: exists ? getWorktreeSize(entry.worktreePath) : undefined,
    });
  }

  // Catch worktrees on disk that are not in the registry at all
  for (const name of diskNames) {
    if (seen.has(name)) continue;
    const wtPath = path.join(WORKTREES, name);
    if (!fs.existsSync(wtPath)) continue;
    statuses.push({
      sessionId: name,
      repoFullName: 'unknown',
      branch: 'unknown',
      worktreePath: wtPath,
      createdAt: fs.statSync(wtPath).ctimeMs,
      exists: true,
      isOrphaned: true,
      sizeBytes: getWorktreeSize(wtPath),
    });
  }

  return statuses;
}

export async function removeWorktreeFromDisk(repoPath: string, worktreePath: string): Promise<void> {
  if (!fs.existsSync(worktreePath)) return;
  const git = simpleGit(repoPath);
  await git.raw(['worktree', 'remove', '--force', worktreePath]).catch(() => null);
  // Fallback: if git worktree remove didn't work, rm -rf
  if (fs.existsSync(worktreePath)) {
    fs.rmSync(worktreePath, { recursive: true, force: true });
  }
}

export async function cleanupOrphanedWorktrees(activeSessionIds: Set<string>): Promise<{ removed: number; errors: string[] }> {
  const statuses = await listWorktreeStatuses(activeSessionIds);
  const orphaned = statuses.filter((s) => s.isOrphaned && s.exists);
  const errors: string[] = [];
  let removed = 0;

  for (const o of orphaned) {
    try {
      // Try to find the repo path from registry for proper git worktree remove
      const registered = listRegisteredWorktrees();
      const reg = registered.find((e) => e.sessionId === o.sessionId);
      const repoPath = reg?.repoPath;
      if (repoPath && fs.existsSync(repoPath)) {
        await removeWorktreeFromDisk(repoPath, o.worktreePath);
      } else {
        fs.rmSync(o.worktreePath, { recursive: true, force: true });
      }
      unregisterWorktree(o.sessionId);
      removed++;
      console.log(`[worktree-cleanup] removed orphaned worktree: ${o.worktreePath}`);
    } catch (err: any) {
      errors.push(`${o.worktreePath}: ${err.message}`);
    }
  }

  return { removed, errors };
}

export async function cleanupAllWorktrees(): Promise<{ removed: number; errors: string[] }> {
  ensureBase();
  const diskNames = fs.existsSync(WORKTREES) ? fs.readdirSync(WORKTREES) : [];
  const errors: string[] = [];
  let removed = 0;

  for (const name of diskNames) {
    const wtPath = path.join(WORKTREES, name);
    if (!fs.existsSync(wtPath)) continue;
    try {
      fs.rmSync(wtPath, { recursive: true, force: true });
      unregisterWorktree(name);
      removed++;
      console.log(`[worktree-cleanup] removed worktree: ${wtPath}`);
    } catch (err: any) {
      errors.push(`${wtPath}: ${err.message}`);
    }
  }

  return { removed, errors };
}

export async function reconcileWorktreesOnStartup(activeSessionIds: Set<string>): Promise<void> {
  const statuses = await listWorktreeStatuses(activeSessionIds);
  const orphaned = statuses.filter((s) => s.isOrphaned && s.exists);

  if (orphaned.length === 0) {
    console.log('[worktree-manager] no orphaned worktrees found');
    return;
  }

  const totalSize = orphaned.reduce((sum, o) => sum + (o.sizeBytes || 0), 0);
  console.warn(`[worktree-manager] found ${orphaned.length} orphaned worktrees (${formatBytes(totalSize)})`);
  for (const o of orphaned) {
    console.warn(`  - ${o.sessionId}  ${o.repoFullName}  ${o.branch}  ${formatBytes(o.sizeBytes || 0)}`);
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
