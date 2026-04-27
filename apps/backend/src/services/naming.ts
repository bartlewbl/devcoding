import { exec } from 'child_process';
import { promisify } from 'util';
import { Session } from '../types';

const execAsync = promisify(exec);
const namingInProgress = new Set<string>();

export async function generateSessionName(session: Session): Promise<string | undefined> {
  if (namingInProgress.has(session.id)) return undefined;

  const userMessages = session.messages.filter((m) => m.type === 'user');
  if (userMessages.length === 0) return undefined;

  namingInProgress.add(session.id);
  try {
    const firstMessage = userMessages[0].content.slice(0, 300);
    const prompt = `Generate a concise 3-5 word title for this conversation. Only output the title text, no quotes, no explanations: "${firstMessage}"`;

    const { stdout } = await execAsync(
      `echo ${JSON.stringify(prompt)} | kimi --print --input-format text --output-format text --final-message-only`,
      { timeout: 15000, env: { ...process.env, TERM: 'xterm-256color' } }
    );

    const name = stdout.split('\n')[0].trim();
    if (name && name.length > 0 && name.length < 100) {
      return name;
    }
  } catch (err) {
    console.error('[naming] failed to generate name:', err);
  } finally {
    namingInProgress.delete(session.id);
  }
  return undefined;
}
