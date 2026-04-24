import { Terminal } from '@xterm/headless';

export interface ParsedChunk {
  type: 'tool-call' | 'ai-text' | 'system';
  content: string;
  toolName?: string;
}

// ── ANSI helpers (only used for startup detection) ────────────────────────────
function preprocess(raw: string): string {
  return raw.replace(/\x1b\[(\d*)C/g, (_, n) => ' '.repeat(Math.min(parseInt(n || '1', 10), 40)));
}

function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b[PX^_][^\x1b]*(?:\x1b\\|$)/g, '')
    .replace(/\x1b[^[\]PX^_]/g, '')
    .replace(/\x1b/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

// ── Noise patterns ─────────────────────────────────────────────────────────────
const NOISE: RegExp[] = [
  /\(thinking\)/,
  /^Thinking[.\s]*/i,
  /Contemplating/i,
  /esc\s*to\s*interrupt/i,
  /Update available/i,
  /brew upgrade/i,
  /^[─━═\-─]{5,}$/,
  /^\(base\).*[@%]/,
  /^[▐▌▛▜▝▞▟▘▙▚]/u,
  /^Security guide/i,
  /^Accessing workspace/i,
  /^Quick safety check/i,
  /Claude Code.{0,30}ll be able/i,
  /Enter to confirm|Esc to cancel/i,
  /^\? for shortcuts/,
  /^❯\s*\d+\./,
  /ctrl\+o to expand/i,
  /^\s*\(ctrl\+/i,
  /^[✶✻✽✢✳⏺·⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s*$/u,
];

function isNoise(t: string): boolean {
  return NOISE.some(p => p.test(t));
}

// ── Tool call detection ────────────────────────────────────────────────────────
const TOOL_PREFIXES = [
  'Read', 'Write', 'Edit', 'Create', 'Delete', 'Bash', 'Search', 'Grep',
  'Glob', 'List', 'View', 'Run', 'Fetch', 'Call', 'Todo',
  'Resumed session', 'Updated', 'Modified', 'Searched code', 'Edited',
  'Ran', 'Wrote', 'Listed', 'WebFetch', 'WebSearch', 'MCP', 'Thinking',
];
const TOOL_RE = new RegExp(`^(${TOOL_PREFIXES.join('|')})`, 'i');
const ARROW_RE = /[›>⟩]\s*$/;

function isToolCall(t: string) { return ARROW_RE.test(t) && TOOL_RE.test(t); }
function toolName(t: string) { return t.replace(ARROW_RE, '').trim().split(/\s+/).slice(0, 4).join(' '); }

const SUMMARY_RE = /^(Read|Listed|Searched|Ran|Wrote|Created|Edited|Fetched)\s+\d+/i;
function isToolSummary(t: string) { return SUMMARY_RE.test(t); }

// ── Parser (headless terminal approach) ────────────────────────────────────────
// Instead of manually parsing escape sequences, we feed raw PTY data into a
// proper VT100 terminal emulator. After a quiet period (400 ms of no new data),
// we read the settled screen buffer line by line. This correctly handles
// cursor-up/down animations that previously garbled the stream parser.
export class OutputParser {
  private term: Terminal;
  private lastProcessedLine = 0;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private phase: 'startup' | 'ready' = 'startup';
  private startupBuf = '';

  constructor(private readonly onParsed: (chunk: ParsedChunk) => void) {
    this.term = new Terminal({
      allowProposedApi: true,
      cols: 160,
      rows: 40,
      scrollback: 5000,
    });
  }

  process(raw: string): void {
    if (this.phase === 'startup') {
      this.startupBuf += stripAnsi(preprocess(raw));
      this.term.write(raw);

      if (this.startupBuf.includes('for shortcuts') || this.startupBuf.length > 10000) {
        this.phase = 'ready';
        this.startupBuf = '';
        // Capture buffer length after xterm processes the write (~100 ms)
        setTimeout(() => {
          this.lastProcessedLine = this.term.buffer.active.length;
          this.onParsed({ type: 'system', content: 'Session ready' });
        }, 100);
      }
      return;
    }

    this.term.write(raw);
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.extract(), 400);
  }

  private extract(): void {
    const buf = this.term.buffer.active;
    const total = buf.length;
    if (total <= this.lastProcessedLine) return;

    const lines: string[] = [];
    for (let i = this.lastProcessedLine; i < total; i++) {
      lines.push((buf.getLine(i)?.translateToString(true) ?? '').trimEnd());
    }

    // Drop trailing blank lines (e.g. empty screen rows below cursor)
    while (lines.length && !lines[lines.length - 1]) lines.pop();

    this.lastProcessedLine = total;
    if (!lines.length) return;

    let textBuf = '';
    const flush = () => {
      if (textBuf.trim()) {
        this.onParsed({ type: 'ai-text', content: textBuf.trim() });
        textBuf = '';
      }
    };

    for (const raw of lines) {
      const t = raw.trim();
      if (!t) { flush(); continue; }
      if (isNoise(t)) continue;

      if (isToolCall(t)) {
        flush();
        this.onParsed({ type: 'tool-call', content: t, toolName: toolName(t) });
      } else if (isToolSummary(t)) {
        flush();
        this.onParsed({ type: 'tool-call', content: t + ' ›', toolName: toolName(t + ' ›') });
      } else {
        const content = t.replace(/^[⏺·]\s*/u, '');
        if (content) textBuf += (textBuf ? '\n' : '') + content;
      }
    }
    flush();
  }
}
