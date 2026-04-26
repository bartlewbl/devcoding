import simpleGit from 'simple-git';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { registerWorktree, unregisterWorktree } from './worktree-manager';

const BASE = path.join(os.homedir(), '.ai-code-studio');
const REPOS = path.join(BASE, 'repos');
const WORKTREES = path.join(BASE, 'worktrees');

function ensureDirs() {
  [BASE, REPOS, WORKTREES].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

function withToken(url: string, token: string): string {
  return url.replace('https://', `https://oauth2:${token}@`);
}

export async function cloneOrFetch(
  repoUrl: string,
  repoFullName: string,
  token: string
): Promise<string> {
  ensureDirs();
  const repoPath = path.join(REPOS, repoFullName.replace('/', '__'));
  const authUrl = withToken(repoUrl, token);

  if (fs.existsSync(repoPath)) {
    const git = simpleGit(repoPath);
    // Update remote URL in case token changed
    await git.remote(['set-url', 'origin', authUrl]);
    await git.fetch(['--all', '--prune']).catch(() => null);
    return repoPath;
  }

  await simpleGit().clone(authUrl, repoPath);
  return repoPath;
}

export async function createWorktree(
  repoPath: string,
  sessionId: string,
  branch: string,
  token: string,
  repoUrl: string,
  repoFullName: string
): Promise<string> {
  ensureDirs();
  const worktreePath = path.join(WORKTREES, sessionId);
  const git = simpleGit(repoPath);

  await git.remote(['set-url', 'origin', withToken(repoUrl, token)]);
  await git.raw(['worktree', 'add', worktreePath, '-b', branch]);

  registerWorktree({
    sessionId,
    repoPath,
    repoFullName,
    branch,
    worktreePath,
    createdAt: Date.now(),
  });

  return worktreePath;
}

export async function removeWorktree(repoPath: string, worktreePath: string, sessionId?: string): Promise<void> {
  if (!fs.existsSync(worktreePath)) return;
  const git = simpleGit(repoPath);
  await git.raw(['worktree', 'remove', '--force', worktreePath]).catch(() => null);
  if (sessionId) {
    unregisterWorktree(sessionId);
  }
}

export async function commitChanges(worktreePath: string, message: string): Promise<void> {
  const git = simpleGit(worktreePath);
  await git.add('.');
  await git.commit(message).catch(() => null);
}

export async function pushBranch(worktreePath: string, branch: string): Promise<void> {
  const git = simpleGit(worktreePath);
  await commitChanges(worktreePath, 'AI-generated changes');
  await git.push(['origin', branch, '--set-upstream']);
}

export async function mergeToMain(repoPath: string, worktreePath: string, branch: string): Promise<void> {
  await pushBranch(worktreePath, branch);

  const git = simpleGit(repoPath);
  await git.fetch(['origin', 'main']);

  // Stash any unexpected local changes so checkout doesn't fail
  let stashed = false;
  const preStatus = await git.status();
  if (preStatus.modified.length || preStatus.created.length || preStatus.deleted.length) {
    await git.stash(['-u']).catch(() => null);
    stashed = true;
  }

  try {
    await git.checkout('main');
    await git.pull();
    await git.merge([branch]);
  } catch (err: any) {
    const status = await git.status().catch(() => null);
    if (status && status.conflicted.length > 0) {
      await git.merge(['--abort']).catch(() => null);
      throw new Error(`Merge conflicts in ${status.conflicted.join(', ')}. Please create a PR and resolve manually.`);
    }
    await git.merge(['--abort']).catch(() => null);
    throw err;
  } finally {
    if (stashed) {
      await git.stash(['pop']).catch(() => null);
    }
  }
}

export async function pushMain(repoPath: string): Promise<void> {
  const git = simpleGit(repoPath);
  await git.push(['origin', 'main']);
}

export async function getDiff(worktreePath: string, file?: string): Promise<string> {
  const git = simpleGit(worktreePath);
  const args = file ? ['HEAD', '--', file] : ['HEAD'];
  return git.diff(args).catch(() => '');
}

export async function getChangedFiles(worktreePath: string): Promise<string[]> {
  const git = simpleGit(worktreePath);
  const status = await git.status().catch(() => null);
  if (!status) return [];
  return [
    ...status.modified,
    ...status.created,
    ...status.not_added,
    ...status.deleted,
  ];
}
