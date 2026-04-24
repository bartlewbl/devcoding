import { Terminal } from '@xterm/headless';

export interface ParsedChunk {
  type: 'tool-call' | 'ai-text' | 'system';
  content: string;
  toolName?: string;
}

// ── ANSI helpers ──────────────────────────────────────────────────────────────
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

// Strip combining strikethrough / overlay characters that terminals use when
// overwriting lines. These leak through xterm.js translateToString().
const STRIKE_CHARS = /[\u0336\u0337\u0338\u0335\u0334\u0332\u0333]/gu;
function stripStrikethrough(s: string): string {
  return s.replace(STRIKE_CHARS, '');
}

// ── Noise patterns ────────────────────────────────────────────────────────────
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
  // Cost / usage tracking noise from claude-code
  /^Now usi/i,
  /extra usage/i,
  /^(?:Now )?using\s+(?:extra\s+)?usage/i,
  /^[\d,]+\s*\$?\d+\.\d+\s*(?:USD|tokens?|input|output)/i,
  /claude-code\s*$/i,
  /anthropic\s*cost/i,
  // Prompt / input noise
  /^What would you like to work on/i,
  /^Forming[.…]*/i,
  /^\s*[›>]\s*$/,                 // lone arrows
  /^\s*[─━═\-─_]+\s*$/,           // lines of only dashes/box drawing
];

function isNoise(t: string): boolean {
  return NOISE.some(p => p.test(t));
}

// ── Garbage detection ─────────────────────────────────────────────────────────
// Reject lines that are mostly special characters (overwritten terminal garbage)
function isGarbage(t: string): boolean {
  if (!t) return true;
  const visible = t.replace(/\s/g, '');
  if (!visible) return true;
  const alnum = visible.replace(/[^a-zA-Z0-9]/g, '').length;
  const ratio = alnum / visible.length;
  // If less than 25% alphanumeric and line is short, it's likely garbage
  if (ratio < 0.25 && visible.length < 60) return true;
  // If less than 15% alphanumeric at any length, it's garbage
  if (ratio < 0.15) return true;
  return false;
}

// ── Tool call detection ───────────────────────────────────────────────────────
const TOOL_PREFIXES = [
  'Read', 'Write', 'Edit', 'Create', 'Delete', 'Bash', 'Search', 'Grep',
  'Glob', 'List', 'View', 'Run', 'Fetch', 'Call', 'Todo',
  'Resumed session', 'Updated', 'Modified', 'Searched code', 'Edited',
  'Ran', 'Wrote', 'Listed', 'WebFetch', 'WebSearch', 'MCP', 'Thinking',
];
const TOOL_RE = new RegExp(`^(${TOOL_PREFIXES.join('|')})`, 'i');
const ARROW_RE = /[›>⟩]\s*$/;

function isToolCall(t: string) {
  if (!ARROW_RE.test(t) || !TOOL_RE.test(t)) return false;
  return true;
}
function toolName(t: string) { return t.replace(ARROW_RE, '').trim().split(/\s+/).slice(0, 4).join(' '); }

const SUMMARY_RE = /^(Read|Listed|Searched|Ran|Wrote|Created|Edited|Fetched)\s+\d+/i;
function isToolSummary(t: string) { return SUMMARY_RE.test(t); }

// ── Parser (headless terminal approach) ───────────────────────────────────────
export class OutputParser {
  private term: Terminal;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private phase: 'startup' | 'ready' = 'startup';
  private startupBuf = '';
  // Sliding-window extraction state
  private seenHashes = new Set<string>();
  private lastCursorY = 0;

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
        setTimeout(() => {
          this.lastCursorY = this.term.buffer.active.cursorY;
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
    const cursorY = buf.baseY + buf.cursorY;

    // Sliding window: read the last N lines up to the cursor.
    // We never read more than 80 lines (2 screens) in one go to avoid
    // ingesting ancient scrollback that may contain stale overwritten text.
    const WINDOW = 80;
    const start = Math.max(0, Math.min(total - WINDOW, cursorY - WINDOW + 20));
    const end = Math.min(total, cursorY + 5);

    if (start >= end) return;

    const freshLines: string[] = [];
    for (let i = start; i < end; i++) {
      const rawLine = (buf.getLine(i)?.translateToString(true) ?? '').trimEnd();
      const clean = stripStrikethrough(rawLine).trim();
      if (!clean) continue;

      // Deduplicate within sliding window using a simple hash
      const hash = clean.slice(0, 120);
      if (this.seenHashes.has(hash)) continue;
      this.seenHashes.add(hash);

      freshLines.push(clean);
    }

    // Prune seen-hash set so it doesn't grow forever
    if (this.seenHashes.size > 500) {
      const keep = Array.from(this.seenHashes).slice(-300);
      this.seenHashes = new Set(keep);
    }

    if (!freshLines.length) return;

    let textBuf = '';
    const flush = () => {
      if (textBuf.trim()) {
        this.onParsed({ type: 'ai-text', content: textBuf.trim() });
        textBuf = '';
      }
    };

    for (const t of freshLines) {
      if (isNoise(t)) continue;
      if (isGarbage(t)) continue;

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

    this.lastCursorY = cursorY;
  }
}
