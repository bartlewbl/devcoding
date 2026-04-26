import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000; // 14_400_000

const UPDATERS = [
  { name: 'claude-code', cmd: 'brew upgrade claude-code' },
  { name: 'kimi-cli', cmd: 'uv tool upgrade kimi-cli' },
  { name: 'codex', cmd: 'npm install -g @openai/codex' },
];

async function runUpdate(name: string, cmd: string): Promise<void> {
  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout: 120_000 });
    if (stdout.trim()) {
      console.log(`[updater:${name}] ${stdout.trim()}`);
    }
    if (stderr.trim()) {
      console.log(`[updater:${name}] stderr: ${stderr.trim()}`);
    }
    console.log(`[updater] ${name} updated successfully`);
  } catch (err: any) {
    console.error(`[updater] ${name} update failed:`, err.message || err);
  }
}

async function runAllUpdates(): Promise<void> {
  console.log('[updater] running scheduled CLI updates...');
  await Promise.allSettled(
    UPDATERS.map((u) => runUpdate(u.name, u.cmd))
  );
  console.log('[updater] scheduled CLI updates complete');
}

export function startBackgroundUpdater(): void {
  // Run immediately on startup, then every 4 hours
  runAllUpdates().catch(() => null);

  setInterval(() => {
    runAllUpdates().catch(() => null);
  }, FOUR_HOURS_MS);

  console.log('[updater] background updater started (every 4 hours)');
}
