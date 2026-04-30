import { Terminal } from '@xterm/headless';
import { CLIProvider } from '../types';

export { CLIProvider };
export type ParsedChunkType = 'tool-call' | 'tool-result' | 'ai-text' | 'system';

export interface ParsedChunk {
  type: ParsedChunkType;
  content: string;
  toolName?: string;
  // Stable per-line ID. When a chunk is re-emitted with the same streamId
  // (because the underlying terminal line grew), the frontend replaces the
  // existing chat message instead of appending a duplicate.
  streamId?: string;
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

// \u2500\u2500 Cell-level styled extractor \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// xterm's translateToString throws away SGR attributes. To restore some markdown
// structure we walk cells ourselves and wrap consecutive bold runs in `**\u2026**`
// and underlined runs in `__\u2026__`. Italic isn't used by either kimi or claude so
// we ignore it. Strikethrough overlay glyphs are dropped via stripStrikethrough.
//
// Caveats:
// - We only emit a marker when crossing a style boundary, so streamed content
//   produces clean markup like "Some **bold** text" rather than "**S****o**\u2026".
// - The cell `getChars()` includes the literal char for combining marks; we
//   keep them so CJK / emoji aren't split.
function readStyledLine(line: import('@xterm/headless').IBufferLine): string {
  const w = line.length;
  let out = '';
  let bold = false;
  let underline = false;
  let cell: import('@xterm/headless').IBufferCell | undefined;
  for (let x = 0; x < w; x++) {
    cell = line.getCell(x, cell);
    if (!cell) continue;
    if (cell.getWidth() === 0) continue; // continuation cell of wide char
    const chars = cell.getChars() || ' ';
    const isBold = !!cell.isBold();
    const isUnder = !!cell.isUnderline();

    if (isBold !== bold) {
      out += '**';
      bold = isBold;
    }
    if (isUnder !== underline) {
      out += '__';
      underline = isUnder;
    }
    out += chars;
  }
  if (underline) out += '__';
  if (bold) out += '**';
  // Collapse trailing whitespace runs that sit inside style markers \u2014 they
  // would otherwise show up as empty bold/underline (`** **`) at line end.
  return out.replace(/(\*\*|__)\s+(\*\*|__)$/g, '$1$2').trimEnd();
}

// Determine if a styled line is "all bold" (heading-like). Cheap to compute
// alongside the styled string but we recompute here from cells to avoid
// regex-fighting with markdown markers in the styled string.
function lineIsAllBold(line: import('@xterm/headless').IBufferLine): boolean {
  const w = line.length;
  let saw = false;
  let cell: import('@xterm/headless').IBufferCell | undefined;
  for (let x = 0; x < w; x++) {
    cell = line.getCell(x, cell);
    if (!cell) continue;
    if (cell.getWidth() === 0) continue;
    const chars = cell.getChars();
    if (!chars || chars === ' ') continue;
    saw = true;
    if (!cell.isBold()) return false;
  }
  return saw;
}

// ── Provider-specific configs ─────────────────────────────────────────────────
interface ProviderConfig {
  toolPrefixes: string[];
  noise: RegExp[];
  usagePatterns: RegExp[];
  bulletChars: string;
  // Optional extra tool-call regexes. Each must capture the tool name in group 1.
  toolCallPatterns?: RegExp[];
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
    // Kimi tool-call format is "Used <Tool> (<arg>)" / "Using <Tool> (<arg>)" with
    // the verb as the prefix. Tool names themselves (WriteFile, ReadFile, Glob,
    // Grep, Shell, FetchURL, SearchWeb, etc.) are matched via toolCallPatterns
    // below — the prefixes here cover the few summary forms kimi emits directly.
    toolPrefixes: [
      'Used', 'Using',
      'WriteFile', 'ReadFile', 'StrReplaceFile', 'Glob', 'Grep', 'Shell',
      'FetchURL', 'SearchWeb', 'ReadMediaFile', 'Todo',
    ],
    noise: [
      /\(thinking\)/,
      // Live "Thinking" / "Composing" status lines (with optional elapsed/token suffix).
      // e.g. "Thinking ...  5s · 250 tokens · 50 tok/s", "Composing... 2s · 60 tokens"
      /^Thinking\b.*?(?:\d+\s*tok|·|tokens|s\s*$)/i,
      /^Composing\b/i,
      // Final thinking summary committed to history.
      /^Thought for\s+\d/i,
      // Context/status bar fragments. "context: 12.5%" / "context: 12.5% (28.5k/200k)"
      /^context:\s*\d/i,
      // Subagent metadata lines emitted under tool-call blocks.
      /^subagent\s+\S+\s+\(/i,
      // Welcome panel text & version banner.
      /Welcome to Kimi/i,
      /Send\s+\/help\s+for help/i,
      /kimi-cli\s*version/i,
      /^kimi,\s*version/i,
      /New version available/i,
      // Toolbar fragments: "ctrl-x: toggle mode", "shift-tab: plan mode", "@: mention files"
      /^(?:ctrl|shift|alt)-[a-z]+\s*:/i,
      /^@:\s*mention/i,
      /^\/(?:feedback|theme|help)\s*:/i,
      // Status flags rendered as standalone tokens in the toolbar.
      /^(?:yolo|plan)\s*$/i,
      /^plan mode (?:ON|OFF)/i,
      // Background bash counter: "⚙ bash: 2"
      /^⚙\s*bash:/u,
      // Generic terminal noise.
      /esc\s*to\s*interrupt/i,
      /Update available/i,
      /^[─━═\-─]{5,}$/,
      /^\(base\).*[@%]/,
      /^[▐▌▛▜▝▞▟▘▙▚]/u,
      /^[✶✻✽✢✳⏺·●○•⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s*$/u,
      /^\s*[›>]\s*$/,
      /^\s*[─━═\-─_]+\s*$/,
      /^Loading\.\.\./i,
      /^\s*\(ctrl\+/i,
      // Kimi logo block on welcome panel uses these block-drawing chars.
      /^[▐█▛▌]+/u,
      // Kimi echoes every user input back to the terminal prefixed with
      // PROMPT_SYMBOL: ✨ (agent), 💫 (thinking), 📋 (plan), $ (shell). The
      // user message is already shown in the chat as a `user` turn, so this
      // echo is pure duplication noise.
      /^[✨💫📋]\s/u,
    ],
    usagePatterns: [
      /\$[\d,]+(?:\.\d+)?\s*(?:USD)?/i,
      /[\d,]+(?:\.\d+)?[kKmMbB]?\s*(?:tokens?|input|output|prompt|completion|cache)/i,
      /\b(?:input|output|prompt|completion)\s*(?:tokens?)?\s*[:=]\s*[\d,]/i,
    ],
    // Kimi renders tool calls under a `•` (U+2022) bullet via Rich's BulletColumns.
    // While streaming the bullet is replaced by a Rich "dots" Spinner whose
    // frames cycle through the Braille patterns ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ — these must also
    // be stripped so the line content (e.g. "Using ReadFile (...)") matches
    // toolCallPatterns instead of getting treated as ai-text.
    bulletChars: '•●·⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏',
    // Match "Used WriteFile (path)" / "Using Grep (pattern)" — capture the tool name.
    toolCallPatterns: [
      /^(?:Used|Using)\s+([A-Z][A-Za-z0-9_]+)\b/,
    ],
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
  const extra = config.toolCallPatterns ?? [];

  return (t: string) => {
    // Paren form: "Read(file_path: "...")" — most common Claude/Codex form.
    if (PAREN_RE.test(t)) return true;
    // Arrow form: "Read some-file ›" — older Claude render.
    if (ARROW_RE.test(t) && TOOL_RE.test(t)) return true;
    // Provider-specific patterns (e.g. kimi's "Used WriteFile (...)")
    for (const re of extra) {
      if (re.test(t)) return true;
    }
    return false;
  };
}

function toolName(t: string, config?: ProviderConfig): string {
  const stripped = t.replace(/[\u203A>\u27E9]\s*$/, '').trim();
  // Provider-specific patterns take priority — they capture the real tool name
  // from forms like "Used WriteFile (...)" where the leading word is a verb.
  if (config?.toolCallPatterns) {
    for (const re of config.toolCallPatterns) {
      const m = stripped.match(re);
      if (m && m[1]) return m[1];
    }
  }
  const parenMatch = stripped.match(/^([A-Z][A-Za-z0-9_]*)\s*\(/);
  if (parenMatch) return parenMatch[1];
  return stripped.split(/\s+/).slice(0, 3).join(' ');
}

const SUMMARY_RE = /^(Read|Listed|Searched|Ran|Wrote|Created|Edited|Fetched)\s+\d+/i;
function isToolSummary(t: string) { return SUMMARY_RE.test(t); }

// Convert a single styled terminal line into a markdown-friendly line so
// react-markdown can render headings, lists, etc. The input has already been
// run through readStyledLine (so bold/underline are wrapped in **/__).
//
// Transformations, in order:
//   1. Whole-line bold + reasonably short  → "## " prefixed heading.
//      Strip the surrounding ** so it renders as a heading instead of bold
//      paragraph; markdown headings are already visually emphasized in the
//      chat's prose theme.
//   2. Leading "•" / "◦" / "▪" + whitespace → "- " (markdown unordered list).
//   3. Leading "N." numeric prefix is left alone — already valid markdown.
//   4. Indented (≥2 spaces) bullet/number → preserve indentation as a nested
//      list item.
function toMarkdownLine(line: string, allBold: boolean): string {
  let s = line;

  // 2/4: list bullets, possibly indented.
  s = s.replace(/^(\s*)[•◦▪]\s+/u, (_m, indent: string) => `${indent}- `);

  // 1: heading (skip if the line is itself a list item — bold list rows are
  // common in TODO lists and shouldn't collapse into headings).
  if (allBold && !/^\s*[-\d]/.test(s) && s.length <= 80) {
    const stripped = s.replace(/\*\*/g, '').trim();
    if (stripped) return `## ${stripped}`;
  }

  return s;
}

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
type LineRecord = {
  text: string;
  streamId: string;
  type: ParsedChunkType;
};

export class OutputParser {
  private term: Terminal;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private phase: 'startup' | 'ready' = 'startup';
  private startupBuf = '';
  // Per-line streaming state. Keyed by absolute terminal line index. When the
  // same line index re-extracts with extending content, we emit an update with
  // the same streamId so the frontend replaces the message in place.
  private lineState = new Map<number, LineRecord>();
  private streamSeq = 0;
  // Throttling: keep an upper bound on how long the frontend goes between
  // updates while the model is mid-stream and data keeps arriving.
  private lastExtractAt = 0;
  private static readonly DEBOUNCE_MS = 60;
  private static readonly MAX_EXTRACT_GAP_MS = 200;
  private lastCursorY = 0;
  private lastToolName?: string;
  private isNoise: (t: string) => boolean;
  private isUsage: (t: string) => boolean;
  private isToolCall: (t: string) => boolean;

  private nextStreamId(): string {
    return `s${++this.streamSeq}`;
  }

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

      // Provider-specific "ready" markers:
      //   claude / codex → "? for shortcuts"
      //   kimi           → welcome panel: "Welcome to Kimi" / "Send /help for help"
      const readyMarker =
        this.startupBuf.includes('for shortcuts') ||
        this.startupBuf.includes('Welcome to Kimi') ||
        /Send\s+\/help\s+for help/i.test(this.startupBuf);
      if (readyMarker || this.startupBuf.length > 10000) {
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

    // Streaming-friendly scheduling: extract on a short debounce when the data
    // stream pauses, but force an extract if too much time has elapsed since
    // the last one (so continuous output still flushes to the chat).
    const now = Date.now();
    if (this.debounce) clearTimeout(this.debounce);

    if (now - this.lastExtractAt >= OutputParser.MAX_EXTRACT_GAP_MS) {
      this.lastExtractAt = now;
      this.extract();
    } else {
      this.debounce = setTimeout(() => {
        this.lastExtractAt = Date.now();
        this.extract();
      }, OutputParser.DEBOUNCE_MS);
    }
  }

  private extract(): void {
    const buf = this.term.buffer.active;
    const total = buf.length;
    const cursorY = buf.baseY + buf.cursorY;

    // Sliding window: read the last N lines up to (and slightly past) the cursor.
    // We never read more than 80 lines (2 screens) in one go to avoid ingesting
    // ancient scrollback that may contain stale overwritten text.
    const WINDOW = 80;
    const start = Math.max(0, Math.min(total - WINDOW, cursorY - WINDOW + 20));
    const end = Math.min(total, cursorY + 5);
    if (start >= end) return;

    const config = PROVIDER_CONFIGS[this.provider] || PROVIDER_CONFIGS.claude;
    const bulletRe = new RegExp(`^[${config.bulletChars}]\\s+`, 'u');

    // Pass 1: collapse terminal-wrapped continuations into single logical lines.
    // xterm marks rows that are continuations of an over-long line with
    // `isWrapped`; joining them avoids emitting "Dashboard a" / "nd Session…"
    // as two separate chat messages just because the terminal hit its column
    // limit. The logical line keeps the START row's index as its key so its
    // streamId remains stable across extracts even if more wrap-rows appear.
    type LogicalLine = { idx: number; lastIdx: number; text: string; allBold: boolean };
    const logical: LogicalLine[] = [];
    for (let i = start; i < end; i++) {
      const line = buf.getLine(i);
      if (!line) continue;
      const raw = readStyledLine(line);
      const wrapsPrev = (line as { isWrapped?: boolean }).isWrapped === true;
      const last = logical[logical.length - 1];
      if (wrapsPrev && last && last.lastIdx === i - 1) {
        // xterm wraps long lines onto consecutive rows; concatenate verbatim.
        last.text += raw;
        last.lastIdx = i;
        // A wrapped continuation can't change "all-bold" — once any row in
        // the run isn't all-bold the heading semantics are lost.
        if (last.allBold && !lineIsAllBold(line)) last.allBold = false;
        continue;
      }
      logical.push({ idx: i, lastIdx: i, text: raw, allBold: lineIsAllBold(line) });
    }

    for (const { idx: i, text: rawLine, allBold } of logical) {
      const clean = stripStrikethrough(rawLine).trim();
      if (!clean) continue;

      // ── Classify ──────────────────────────────────────────────
      let kind: ParsedChunkType;
      let content: string;
      let extractedToolName: string | undefined;

      if (RESULT_MARKER_RE.test(clean)) {
        // Tool-result continuation marker (e.g. "⎿ Read 50 lines").
        const result = clean.replace(RESULT_MARKER_RE, '').trim();
        if (!result) continue;
        kind = 'tool-result';
        content = result;
        extractedToolName = this.lastToolName;
      } else {
        const t = clean.replace(bulletRe, '').trim();
        if (!t) continue;

        if (this.isUsage(t)) {
          this.onUsage?.({ provider: this.provider, rawLine: t });
          continue;
        }
        if (this.isNoise(t)) continue;
        if (isGarbage(t)) continue;

        if (this.isToolCall(t) || isToolSummary(t)) {
          kind = 'tool-call';
          // Tool-call card doesn't render markdown bold; strip the markers
          // we emitted from the styled extractor.
          content = t.replace(/\*\*/g, '').replace(/__/g, '');
          extractedToolName = toolName(t, config);
          this.lastToolName = extractedToolName;
        } else {
          // Kimi/Rich diff panels (lines like "│ 55 <code> │" or panel borders)
          // are passed through verbatim so the frontend preprocessor can
          // convert the entire panel into a single fenced diff block with the
          // file path in the title bar. See preprocessKimiPanels in
          // AssistantTurn.tsx.
          kind = 'ai-text';
          content = toMarkdownLine(clean, allBold);
        }
      }

      // ── Stream-aware emission ────────────────────────────────
      // Reuse the streamId (so the chat message updates in place) when the new
      // content is a continuation of an existing stream. We try, in order:
      //   1. Same row, identical content       → skip silently
      //   2. Same row, new extends prev         → streaming append
      //   3. Same row, prev was truncated …     → committed text replaces it
      //   4. Different row, content is a prefix-superset of a recent stream of
      //      the same kind → adopt that streamId. Catches kimi's pattern of
      //      printing partial paragraphs in a transient live-preview area and
      //      then re-printing the committed full paragraph at a later row.
      let streamId: string | undefined;
      const prev = this.lineState.get(i);
      if (prev && prev.type === kind) {
        if (content === prev.text) continue;
        if (content.startsWith(prev.text)) {
          streamId = prev.streamId;
        } else if (/(?:…|\.{3})\s*$/.test(prev.text)) {
          const prevPrefix = prev.text.replace(/(?:…|\.{3})\s*$/, '').trim();
          const shared = Math.min(prevPrefix.length, 24);
          if (shared > 0 && content.startsWith(prevPrefix.slice(0, shared))) {
            streamId = prev.streamId;
          }
        }
      }

      // Cross-row prefix merge for ai-text only — tool-call/result rows are
      // already keyed on a stable bullet position, and merging them across
      // rows would conflate independent invocations.
      if (!streamId && kind === 'ai-text' && content.length >= 24) {
        let skip = false;
        for (const [otherIdx, rec] of this.lineState) {
          if (otherIdx === i) continue;
          if (rec.type !== 'ai-text') continue;
          if (Math.abs(otherIdx - i) > 60) continue; // only nearby rows
          if (content === rec.text || content.startsWith(rec.text)) {
            // New row carries an extension of an earlier preview; adopt its
            // streamId and retire the stale row entry.
            streamId = rec.streamId;
            this.lineState.delete(otherIdx);
            break;
          }
          if (rec.text.startsWith(content)) {
            // We already emitted a longer version at the other row; this is
            // a redundant partial. Skip without emitting.
            skip = true;
            break;
          }
        }
        if (skip) continue;
      }

      if (!streamId) streamId = this.nextStreamId();

      this.lineState.set(i, { text: content, streamId, type: kind });

      const chunk: ParsedChunk = { type: kind, content, streamId };
      if (extractedToolName !== undefined) chunk.toolName = extractedToolName;
      this.onParsed(chunk);
    }

    // Prune line state for entries far below the current window so the map
    // doesn't grow without bound on long sessions.
    if (this.lineState.size > 800) {
      const keepFrom = start - 200;
      for (const k of Array.from(this.lineState.keys())) {
        if (k < keepFrom) this.lineState.delete(k);
      }
    }

    this.lastCursorY = cursorY;
  }
}
