export interface ParsedChunk {
  type: 'tool-call' | 'ai-text' | 'system';
  content: string;
  toolName?: string;
}

// Matches tool call lines from Claude Code and Kimi CLI output
const TOOL_PREFIXES = [
  'Read', 'Write', 'Edit', 'Create', 'Delete', 'Bash', 'Search', 'Grep',
  'Glob', 'List', 'View', 'Run', 'Fetch', 'Call', 'Todo', 'Resumed session',
  'Updated', 'Modified', 'Searched code', 'Edited', 'Ran', 'Created file',
  'Wrote', 'Listed', 'WebFetch', 'WebSearch', 'MCP', 'Thinking',
];
const TOOL_RE = new RegExp(`^(${TOOL_PREFIXES.join('|')})`, 'i');
const ARROW_RE = /[›>⟩]\s*$/;

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b[()][AB012]/g, '')
    .replace(/\x1b[^[\]()]/g, '');
}

function isToolCallLine(line: string): boolean {
  const t = line.trim();
  return ARROW_RE.test(t) && TOOL_RE.test(t);
}

function toolName(line: string): string {
  return line.trim().replace(ARROW_RE, '').trim().split(/\s+/).slice(0, 3).join(' ');
}

export class OutputParser {
  private textBuffer = '';
  private overflow = '';

  process(raw: string): ParsedChunk[] {
    const clean = stripAnsi(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const input = this.overflow + clean;
    const lines = input.split('\n');
    this.overflow = lines.pop() ?? '';

    const out: ParsedChunk[] = [];

    for (const line of lines) {
      const t = line.trim();
      if (isToolCallLine(t)) {
        if (this.textBuffer.trim()) {
          out.push({ type: 'ai-text', content: this.textBuffer.trim() });
          this.textBuffer = '';
        }
        out.push({ type: 'tool-call', content: t, toolName: toolName(t) });
      } else if (t) {
        this.textBuffer += (this.textBuffer ? '\n' : '') + line;
      } else if (this.textBuffer.trim()) {
        out.push({ type: 'ai-text', content: this.textBuffer.trim() });
        this.textBuffer = '';
      }
    }

    return out;
  }

  flush(): ParsedChunk[] {
    if (!this.textBuffer.trim()) return [];
    const msg: ParsedChunk = { type: 'ai-text', content: this.textBuffer.trim() };
    this.textBuffer = '';
    return [msg];
  }
}
