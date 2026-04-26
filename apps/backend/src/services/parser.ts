import { Terminal } from '@xterm/headless';
import { CLIProvider } from '../types';

export { CLIProvider };
export type ParsedChunkType = 'tool-call' | 'tool-result' | 'ai-text' | 'system';

export interface ParsedChunk {
  type: ParsedChunkType;
  content: string;
  toolName?: string;
}

export interface UsageEvent {
  provider: CLIProvider;
  rawLine: string;
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

// ── Provider-specific configs ─────────────────────────────────────────────────
interface ProviderConfig {
  toolPrefixes: string[];
  noise: RegExp[];
  usagePatterns: RegExp[];
  bulletChars: string;
}

const PROVIDER_CONFIGS: Record<CLIProvider, ProviderConfig> = {
  claude: {
    toolPrefixes: [
      'Read', 'Write', 'Edit', 'Create', 'Delete', 'Bash', 'Search', 'Grep',
      'Glob', 'List', 'View', 'Run', 'Fetch', 'Call', 'Todo',
      'Resumed session', 'Updated', 'Modified', 'Searched code', 'Edited',
      'Ran', 'Wrote', 'Listed', 'WebFetch', 'WebSearch', 'MCP', 'Thinking',
    ],
    noise: [
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
      // Cost / usage tracking noise from claude-code — these get captured as usage events
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
      /^\s*⏺\s*$/,                    // lone bullet
    ],
    usagePatterns: [
      /\$[\d,]+(?:\.\d+)?\s*(?:USD)?/i,
      /[\d,]+(?:\.\d+)?[kKmMbB]?\s*(?:tokens?|input|output|prompt|completion|cache)/i,
      /\b(?:input|output|prompt|completion)\s*(?:tokens?)?\s*[:=]/i,
      /^Now usi/i,
      /extra usage/i,
      /anthropic\s*cost/i,
      /claude-code\s*$/i,
    ],
    bulletChars: '⏺·',
  },
  kimi: {
    toolPrefixes: [
      'Read', 'Write', 'Edit', 'Create', 'Delete', 'Bash', 'Search', 'Grep',
      'Glob', 'List', 'View', 'Run', 'Fetch', 'Call', 'Todo',
      'Resumed session', 'Updated', 'Modified', 'Searched code', 'Edited',
      'Ran', 'Wrote', 'Listed', 'WebFetch', 'WebSearch', 'MCP', 'Thinking',
      'Tool', 'Execute', 'Command',
    ],
    noise: [
      /\(thinking\)/,
      /^Thinking[.\s]*/i,
      /esc\s*to\s*interrupt/i,
      /Update available/i,
      /^[─━═\-─]{5,}$/,
      /^\(base\).*[@%]/,
      /^[▐▌▛▜▝▞▟▘▙▚]/u,
      /^[✶✻✽✢✳⏺·⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s*$/u,
      /^\s*[›>]\s*$/,
      /^\s*[─━═\-─_]+\s*$/,
      /^\s*●\s*$/,
      /kimi-cli\s*version/i,
      /^Loading\.\.\./i,
      /^\s*\(ctrl\+/i,
    ],
    usagePatterns: [
      /\$[\d,]+(?:\.\d+)?\s*(?:USD)?/i,
      /[\d,]+(?:\.\d+)?[kKmMbB]?\s*(?:tokens?|input|output|prompt|completion|cache)/i,
      /\b(?:input|output|prompt|completion)\s*(?:tokens?)?\s*[:=]\s*[\d,]/i,
    ],
    bulletChars: '●·',
  },
  codex: {
    toolPrefixes: [
      'Read', 'Write', 'Edit', 'Create', 'Delete', 'Bash', 'Search', 'Grep',
      'Glob', 'List', 'View', 'Run', 'Fetch', 'Call', 'Todo',
      'Resumed session', 'Updated', 'Modified', 'Searched code', 'Edited',
      'Ran', 'Wrote', 'Listed', 'WebFetch', 'WebSearch', 'MCP', 'Thinking',
      'Command',
    ],
    noise: [
      /\(thinking\)/,
      /^Thinking[.\s]*/i,
      /esc\s*to\s*interrupt/i,
      /Update available/i,
      /^[─━═\-─]{5,}$/,
      /^\(base\).*[@%]/,
      /^[▐▌▛▜▝▞▟▘▙▚]/u,
      /^[✶✻✽✢✳⏺·⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s*$/u,
      /^\s*[›>]\s*$/,
      /^\s*[─━═\-─_]+\s*$/,
      /^\s*\$\s*$/,                   // lone $
      /codex\s*version/i,
      /^Loading\.\.\./i,
      /^\s*\(ctrl\+/i,
      /^\$\s+/,                        // shell prompt noise
    ],
    usagePatterns: [
      /\$[\d,]+(?:\.\d+)?\s*(?:USD)?/i,
      /[\d,]+(?:\.\d+)?[kKmMbB]?\s*(?:tokens?|input|output|prompt|completion|cache)/i,
      /\b(?:input|output|prompt|completion)\s*(?:tokens?)?\s*[:=]\s*[\d,]/i,
    ],
    bulletChars: '·',
  },
};

// ── Noise detection ───────────────────────────────────────────────────────────
function createIsNoise(config: ProviderConfig) {
  return (t: string): boolean => config.noise.some(p => p.test(t));
}

function createIsUsage(config: ProviderConfig) {
  return (t: string): boolean => config.usagePatterns.some(p => p.test(t));
}

// ── Garbage detection ─────────────────────────────────────────────────────────
// Reject lines that are mostly special characters (overwritten terminal garbage)
function isGarbage(t: string): boolean {
  if (!t) return true;
  // Never treat markdown code fences as garbage
  if (/^```/.test(t.trim())) return false;
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
// Matches tool result continuation markers (box-drawing / arrow chars at line start).
// Example: "⎿ Read 50 lines" or "└ Updated 3 files".
const RESULT_MARKER_RE = /^[⎿└↳]\s*/u;

function createIsToolCall(config: ProviderConfig) {
  const TOOL_RE = new RegExp(`^(${config.toolPrefixes.join('|')})\\b`, 'i');
  const PAREN_RE = new RegExp(`^(${config.toolPrefixes.join('|')})\\s*\\(`, 'i');
  const ARROW_RE = /[›>⟩]\s*$/;

  return (t: string) => {
    // Paren form: "Read(file_path: "...")" — most common Claude/Codex form.
    if (PAREN_RE.test(t)) return true;
    // Arrow form: "Read some-file ›" — older Claude render.
    if (ARROW_RE.test(t) && TOOL_RE.test(t)) return true;
    return false;
  };
}

function toolName(t: string): string {
  const stripped = t.replace(/[\u203A>\u27E9]\s*$/, '').trim();
  const parenMatch = stripped.match(/^([A-Z][A-Za-z0-9_]*)\s*\(/);
  if (parenMatch) return parenMatch[1];
  return stripped.split(/\s+/).slice(0, 3).join(' ');
}

const SUMMARY_RE = /^(Read|Listed|Searched|Ran|Wrote|Created|Edited|Fetched)\s+\d+/i;
function isToolSummary(t: string) { return SUMMARY_RE.test(t); }

// ── Content formatting ────────────────────────────────────────────────────────
function formatContent(lines: string[], config: ProviderConfig): string {
  if (lines.length === 0) return '';

  const result: string[] = [];
  let inRawCodeBlock = false;   // inside existing ```...```
  let inDetectedBlock = false;  // inside auto-detected code block
  let codeBlockLang = '';
  let codeBuffer: string[] = [];

  const flushDetected = () => {
    if (codeBuffer.length > 0) {
      const lang = codeBlockLang || '';
      result.push('```' + lang);
      result.push(...codeBuffer);
      result.push('```');
      codeBuffer = [];
    }
    inDetectedBlock = false;
    codeBlockLang = '';
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check for raw code fences
    const fenceMatch = trimmed.match(/^```(\w*)/);
    if (fenceMatch) {
      if (inDetectedBlock) {
        flushDetected();
      }
      inRawCodeBlock = !inRawCodeBlock;
      result.push(line);
      continue;
    }

    // If inside a raw code block, pass through
    if (inRawCodeBlock) {
      result.push(line);
      continue;
    }

    // Strip provider-specific bullet chars from start of text lines
    const bulletRe = new RegExp(`^[${config.bulletChars}]\\s*`, 'u');
    const cleanLine = line.replace(bulletRe, '');
    const cleanTrimmed = cleanLine.trim();

    // Detect indented code blocks
    const INDENTED_CODE_RE = /^( {4,}|\t)/;
    if (INDENTED_CODE_RE.test(line) && !cleanTrimmed.startsWith('-') && !cleanTrimmed.startsWith('*')) {
      if (!inDetectedBlock) {
        inDetectedBlock = true;
      }
      codeBuffer.push(cleanLine.replace(INDENTED_CODE_RE, ''));
      continue;
    }

    // Auto-detect code blocks by pattern
    if (!inDetectedBlock && cleanTrimmed.length > 0) {
      const lang = detectLanguage(cleanTrimmed);
      if (lang) {
        // Look ahead: if next few lines also look like code, start a block
        const lookAhead = lines.slice(i + 1, i + 4);
        const codeLikeLines = lookAhead.filter(l => {
          const lt = l.trim();
          return lt.length > 0 && (
            INDENTED_CODE_RE.test(l) ||
            detectLanguage(lt) ||
            /^[a-z_][a-z0-9_]*\s*[=:]|^\{|^\}|^\(|^\)|^function |^class |^const |^let |^var |^if |^for |^while |^return |^import |^export /.test(lt)
          );
        }).length;

        if (codeLikeLines >= 1 || /^[a-z_][a-z0-9_]*\s*[=:]/i.test(cleanTrimmed)) {
          inDetectedBlock = true;
          codeBlockLang = lang;
          codeBuffer.push(cleanTrimmed);
          continue;
        }
      }
    }

    // Regular text line
    if (inDetectedBlock && codeBuffer.length > 0) {
      // Check if we should end the detected code block
      if (cleanTrimmed.length === 0 || /^[a-zA-Z][a-zA-Z\s]{2,50}[.!?]$/.test(cleanTrimmed)) {
        flushDetected();
        if (cleanTrimmed.length > 0) result.push(cleanLine);
        continue;
      }
      codeBuffer.push(cleanTrimmed);
      continue;
    }

    result.push(cleanLine);
  }

  if (inDetectedBlock) {
    flushDetected();
  }

  return result.join('\n');
}

function detectLanguage(line: string): string | undefined {
  const extMatch = line.match(/\.(ts|tsx|js|jsx|py|json|yaml|yml|html|css|rs|go|java|md|sql|sh|bash|dockerfile)\b/i);
  if (extMatch) {
    const ext = extMatch[1].toLowerCase();
    const map: Record<string, string> = {
      ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
      py: 'python', rs: 'rust', go: 'go', java: 'java', md: 'markdown',
      yml: 'yaml', sh: 'bash', dockerfile: 'dockerfile',
    };
    return map[ext] || ext;
  }

  // Check for shebang
  if (/^#![\/\w]+/.test(line)) {
    if (line.includes('python')) return 'python';
    if (line.includes('node')) return 'javascript';
    if (line.includes('bash') || line.includes('sh')) return 'bash';
  }

  // Check for language keywords
  if (/^(import|from|export|const|let|var|function|interface|type)\s/.test(line)) return 'typescript';
  if (/^(def|class|import|from)\s/.test(line)) return 'python';
  if (/^(package|import|public|class|interface)\s/.test(line)) return 'java';
  if (/^(fn|let|mut|use|mod|pub)\s/.test(line)) return 'rust';
  if (/^(package|func|import|type)\s/.test(line)) return 'go';

  return undefined;
}

// ── Parser (headless terminal approach) ───────────────────────────────────────
export class OutputParser {
  private term: Terminal;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private phase: 'startup' | 'ready' = 'startup';
  private startupBuf = '';
  // Sliding-window extraction state
  private seenHashes = new Set<string>();
  private lastCursorY = 0;
  private lastToolName?: string;
  private isNoise: (t: string) => boolean;
  private isUsage: (t: string) => boolean;
  private isToolCall: (t: string) => boolean;

  constructor(
    private readonly provider: CLIProvider,
    private readonly onParsed: (chunk: ParsedChunk) => void,
    private readonly onUsage?: (event: UsageEvent) => void
  ) {
    const config = PROVIDER_CONFIGS[provider];
    if (!config) {
      console.error(`[OutputParser] Unknown provider: ${provider}. Falling back to claude config.`);
    }
    const effectiveConfig = config || PROVIDER_CONFIGS.claude;

    this.term = new Terminal({
      allowProposedApi: true,
      cols: 160,
      rows: 40,
      scrollback: 5000,
    });

    this.isNoise = createIsNoise(effectiveConfig);
    this.isUsage = createIsUsage(effectiveConfig);
    this.isToolCall = createIsToolCall(effectiveConfig);
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

    const config = PROVIDER_CONFIGS[this.provider] || PROVIDER_CONFIGS.claude;
    const bulletRe = new RegExp(`^[${config.bulletChars}]\\s+`, 'u');
    let textLines: string[] = [];
    const flushText = () => {
      if (textLines.length) {
        const formatted = formatContent(textLines, config);
        if (formatted.trim()) {
          this.onParsed({ type: 'ai-text', content: formatted.trim() });
        }
        textLines = [];
      }
    };

    for (const rawT of freshLines) {
      // Detect tool-result continuation lines (e.g. "⎿ Read 50 lines") before
      // stripping anything — these are structural markers we want to preserve.
      if (RESULT_MARKER_RE.test(rawT)) {
        const result = rawT.replace(RESULT_MARKER_RE, '').trim();
        if (result) {
          flushText();
          this.onParsed({ type: 'tool-result', content: result, toolName: this.lastToolName });
        }
        continue;
      }

      // Strip provider bullet prefix so tool detection sees the raw content.
      const t = rawT.replace(bulletRe, '').trim();
      if (!t) continue;

      // Check for usage data before treating as noise
      if (this.isUsage(t)) {
        this.onUsage?.({ provider: this.provider, rawLine: t });
        continue;
      }

      if (this.isNoise(t)) continue;
      if (isGarbage(t)) continue;

      if (this.isToolCall(t)) {
        flushText();
        const name = toolName(t);
        this.lastToolName = name;
        this.onParsed({ type: 'tool-call', content: t, toolName: name });
      } else if (isToolSummary(t)) {
        flushText();
        const name = toolName(t);
        this.lastToolName = name;
        this.onParsed({ type: 'tool-call', content: t, toolName: name });
      } else {
        textLines.push(t);
      }
    }
    flushText();

    this.lastCursorY = cursorY;
  }
}
