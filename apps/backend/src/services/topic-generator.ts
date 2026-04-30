import { execFile } from 'child_process';
import { promisify } from 'util';
import { getDiff } from './git';
import { ChatMessage } from '../types';

const execFileAsync = promisify(execFile);

// Track sessions that already have an in-flight topic request
const inFlight = new Set<string>();

// Track sessions that already have an in-flight commit message request
const commitInFlight = new Set<string>();

// Max argument length for the prompt to avoid E2BIG
const MAX_MESSAGE_LEN = 2000;
const MAX_DIFF_LEN = 4000;
const MAX_CHAT_HISTORY_LEN = 2000;

export function isTopicGenerationInFlight(sessionId: string): boolean {
  return inFlight.has(sessionId);
}

export function isCommitGenerationInFlight(sessionId: string): boolean {
  return commitInFlight.has(sessionId);
}

export async function generateTopicWithKimi(
  sessionId: string,
  message: string
): Promise<string | undefined> {
  if (inFlight.has(sessionId)) return undefined;
  inFlight.add(sessionId);

  const truncated = message.trim().slice(0, MAX_MESSAGE_LEN);
  const prompt = `Respond with ONLY a short 3-5 word title for this coding task, no other text: ${truncated}`;

  try {
    const { stdout } = await execFileAsync(
      'kimi',
      ['--quiet', '--prompt', prompt, '--max-steps-per-turn', '1'],
      { timeout: 15_000 }
    );

    const lines = stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const topicLine = lines.find(
      (l) => !/^(To resume this session|Session ID:|TurnBegin|StepBegin|ThinkPart|StatusUpdate)/i.test(l)
    );

    if (!topicLine) return undefined;

    let topic = topicLine
      .replace(/^["'*`]+|["'*`]+$/g, '')
      .replace(/\*\*/g, '')
      .replace(/^[-–—\s]+/, '')
      .trim();

    if (!topic) return undefined;

    if (topic.length > 60) {
      topic = topic.slice(0, 60);
      const lastSpace = topic.lastIndexOf(' ');
      if (lastSpace > 20) topic = topic.slice(0, lastSpace);
    }

    return topic || undefined;
  } catch (err) {
    console.error('[topic-generator] kimi failed:', err);
    return undefined;
  } finally {
    inFlight.delete(sessionId);
  }
}

export async function generateCommitMessageWithKimi(
  sessionId: string,
  worktreePath: string,
  messages: ChatMessage[]
): Promise<string | undefined> {
  if (commitInFlight.has(sessionId)) return undefined;
  commitInFlight.add(sessionId);

  try {
    const diff = await getDiff(worktreePath);
    if (!diff || diff.trim().length === 0) {
      return undefined;
    }

    // Build chat history summary
    const chatHistory = messages
      .filter((m) => m.type === 'user' || m.type === 'ai-text')
      .map((m) => {
        const prefix = m.type === 'user' ? 'User' : 'AI';
        const content = m.content.slice(0, 300).replace(/\n/g, ' ');
        return `${prefix}: ${content}`;
      })
      .join('\n')
      .slice(0, MAX_CHAT_HISTORY_LEN);

    const truncatedDiff = diff.trim().slice(0, MAX_DIFF_LEN);

    const prompt = `You are a helpful assistant that writes git commit messages.
Given the chat history between a user and an AI coding assistant, and the git diff of the changes made, write a concise, descriptive commit message.

Rules:
- Maximum 72 characters for the subject line
- Use conventional commit format (e.g., feat:, fix:, refactor:, docs:, test:)
- Be specific about what changed
- Respond with ONLY the commit message, no quotes, no explanations

Chat History:
${chatHistory}

Git Diff:
${truncatedDiff}`;

    const { stdout } = await execFileAsync(
      'kimi',
      ['--quiet', '--prompt', prompt, '--max-steps-per-turn', '1'],
      { timeout: 20_000 }
    );

    const lines = stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const msgLine = lines.find(
      (l) => !/^(To resume this session|Session ID:|TurnBegin|StepBegin|ThinkPart|StatusUpdate)/i.test(l)
    );

    if (!msgLine) return undefined;

    let message = msgLine
      .replace(/^["'*`]+|["'*`]+$/g, '')
      .replace(/\*\*/g, '')
      .trim();

    if (!message) return undefined;

    // Enforce 72-char subject line
    if (message.length > 72) {
      message = message.slice(0, 72);
      const lastSpace = message.lastIndexOf(' ');
      if (lastSpace > 30) message = message.slice(0, lastSpace);
    }

    return message || undefined;
  } catch (err) {
    console.error('[topic-generator] commit message generation failed:', err);
    return undefined;
  } finally {
    commitInFlight.delete(sessionId);
  }
}
