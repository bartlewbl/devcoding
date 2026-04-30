import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Track sessions that already have an in-flight topic request
const inFlight = new Set<string>();

// Max argument length for the prompt to avoid E2BIG
const MAX_MESSAGE_LEN = 2000;

export function isTopicGenerationInFlight(sessionId: string): boolean {
  return inFlight.has(sessionId);
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

    // Parse output: first non-empty line that isn't a meta footer
    const lines = stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const topicLine = lines.find(
      (l) => !/^(To resume this session|Session ID:|TurnBegin|StepBegin|ThinkPart|StatusUpdate)/i.test(l)
    );

    if (!topicLine) return undefined;

    // Clean up common LLM artifacts
    let topic = topicLine
      .replace(/^["'*`]+|["'*`]+$/g, '')   // surrounding quotes / backticks
      .replace(/\*\*/g, '')                // markdown bold
      .replace(/^[-–—\s]+/, '')            // leading dashes
      .trim();

    if (!topic) return undefined;

    // Cap length
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
