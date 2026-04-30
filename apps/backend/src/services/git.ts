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

function isGitRepo(dir: string): boolean {
  return fs.existsSync(path.join(dir, '.git'));
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
    if (!isGitRepo(repoPath)) {
      console.warn(`[git] ${repoPath} exists but is not a valid git repo; re-cloning.`);
      fs.rmSync(repoPath, { recursive: true, force: true });
      await simpleGit().clone(authUrl, repoPath);
      return repoPath;
    }

    const git = simpleGit(repoPath);
    // Update remote URL in case token changed
    await git.remote(['set-url', 'origin', authUrl]);
    await git.fetch(['--all', '--prune']).catch((err) => {
      console.warn(`[git] fetch failed for ${repoFullName}:`, err.message);
    });
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

  // If the worktree already exists, prune stale entries and remove it first
  if (fs.existsSync(worktreePath)) {
    console.warn(`[git] worktree ${worktreePath} already exists; pruning and re-creating.`);
    await git.raw(['worktree', 'prune']).catch(() => null);
    await git.raw(['worktree', 'remove', '--force', worktreePath]).catch(() => null);
    if (fs.existsSync(worktreePath)) {
      fs.rmSync(worktreePath, { recursive: true, force: true });
    }
  }

  // If the branch already exists locally, delete it so we can create a fresh one
  const branches = await git.branchLocal().catch(() => null);
  if (branches && branches.all.includes(branch)) {
    console.warn(`[git] branch ${branch} already exists; deleting local branch.`);
    await git.deleteLocalBranch(branch, true).catch(() => null);
  }

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
  await git.raw(['worktree', 'remove', '--force', worktreePath]).catch((err) => {
    console.warn(`[git] worktree remove failed for ${worktreePath}:`, err.message);
  });
  if (sessionId) {
    unregisterWorktree(sessionId);
  }
}

export async function commitChanges(worktreePath: string, message: string): Promise<void> {
  const git = simpleGit(worktreePath);
  const status = await git.status().catch(() => null);
  if (!status || status.isClean()) {
    return; // nothing to commit
  }

  await git.add('.');
  await git.commit(message);
}

export async function pushBranch(worktreePath: string, branch: string): Promise<void> {
  const git = simpleGit(worktreePath);
  await commitChanges(worktreePath, 'AI-generated changes');
  try {
    await git.push(['origin', branch, '--set-upstream']);
  } catch (err: any) {
    throw new Error(`Push failed for ${branch}: ${err.message}`);
  }
}

export async function mergeOriginMainIntoBranch(
  worktreePath: string
): Promise<{ success: boolean; conflicted?: string[] }> {
  const worktreeGit = simpleGit(worktreePath);
  await worktreeGit.fetch(['origin', 'main']);
  try {
    await worktreeGit.merge(['origin/main']);
    return { success: true };
  } catch (err: any) {
    const status = await worktreeGit.status().catch(() => null);
    if (status && status.conflicted.length > 0) {
      return { success: false, conflicted: status.conflicted };
    }
    throw err;
  }
}

export async function mergeBranchIntoMain(repoPath: string, branch: string): Promise<void> {
  const git = simpleGit(repoPath);
  await git.fetch(['origin', 'main']);

  // Stash any unexpected local changes so checkout doesn't fail
  let stashRef: string | undefined;
  const preStatus = await git.status();
  if (preStatus.modified.length || preStatus.created.length || preStatus.deleted.length) {
    const stashResult = await git.stash(['push', '-u', '-m', 'ai-code-studio-auto-stash']).catch(() => null);
    if (stashResult && typeof stashResult === 'string' && stashResult.includes('Saved')) {
      stashRef = 'stash@{0}';
    }
  }

  try {
    // Ensure main exists locally; create tracking branch if needed
    const localBranches = await git.branchLocal();
    if (!localBranches.all.includes('main')) {
      await git.checkout(['-B', 'main', 'origin/main']);
    } else {
      await git.checkout('main');
    }

    await git.pull('origin', 'main');
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
    if (stashRef) {
      await git.stash(['pop']).catch((err) => {
        console.warn(`[git] stash pop failed on ${repoPath}:`, err.message);
      });
    }
  }
}

export async function mergeToMain(repoPath: string, worktreePath: string, branch: string): Promise<void> {
  await pushBranch(worktreePath, branch);

  const result = await mergeOriginMainIntoBranch(worktreePath);
  if (!result.success) {
    await simpleGit(worktreePath).merge(['--abort']).catch(() => null);
    throw new Error(`Merge conflicts in ${result.conflicted?.join(', ')}. Please create a PR and resolve manually.`);
  }

  await pushBranch(worktreePath, branch);
  await mergeBranchIntoMain(repoPath, branch);
}

export async function pushMain(repoPath: string): Promise<void> {
  const git = simpleGit(repoPath);
  try {
    await git.push(['origin', 'main']);
  } catch (err: any) {
    throw new Error(`Push failed for main: ${err.message}`);
  }
}

export async function getDiff(worktreePath: string, file?: string): Promise<string> {
  const git = simpleGit(worktreePath);
  const args = file ? ['HEAD', '--', file] : ['HEAD'];
  return git.diff(args).catch((err) => {
    console.warn(`[git] diff failed in ${worktreePath}:`, err.message);
    return '';
  });
}

export async function getChangedFiles(worktreePath: string): Promise<string[]> {
  const git = simpleGit(worktreePath);
  const status = await git.status().catch((err) => {
    console.warn(`[git] status failed in ${worktreePath}:`, err.message);
    return null;
  });
  if (!status) return [];
  return [
    ...status.modified,
    ...status.created,
    ...status.not_added,
    ...status.deleted,
  ];
}
