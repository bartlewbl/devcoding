import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FileText, FileEdit, FilePlus, FileMinus, Terminal,
  Search, Globe, CheckSquare, Wrench, ChevronRight, ChevronDown,
  Copy, Check, Bot, Sparkles, Zap, Code2,
} from 'lucide-react';
import { ChatMessage as Msg, SessionSummary } from '../types';
import { useState } from 'react';

type Provider = SessionSummary['model'];

/* ── Provider meta ─────────────────────────────────────────── */
const providerMeta = (model?: Provider) => {
  switch (model) {
    case 'claude':
      return {
        name: 'Claude',
        icon: Sparkles,
        color: 'text-amber-400',
        bg: 'bg-amber-950/40',
        border: 'border-amber-500/30',
        avatarBg: 'bg-amber-950/60',
        avatarBorder: 'border-amber-700/40',
      };
    case 'kimi':
      return {
        name: 'Kimi',
        icon: Zap,
        color: 'text-sky-400',
        bg: 'bg-sky-950/40',
        border: 'border-sky-500/30',
        avatarBg: 'bg-sky-950/60',
        avatarBorder: 'border-sky-700/40',
      };
    case 'codex':
      return {
        name: 'Codex',
        icon: Code2,
        color: 'text-emerald-400',
        bg: 'bg-emerald-950/40',
        border: 'border-emerald-500/30',
        avatarBg: 'bg-emerald-950/60',
        avatarBorder: 'border-emerald-700/40',
      };
    default:
      return {
        name: 'Assistant',
        icon: Bot,
        color: 'text-zinc-400',
        bg: 'bg-zinc-900/60',
        border: 'border-zinc-500/30',
        avatarBg: 'bg-zinc-800',
        avatarBorder: 'border-zinc-700',
      };
  }
};

/* ── Tool meta ───────────────────────────────────────────── */
const toolMeta = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('read') || n.includes('view') || n.includes('list')) {
    return { icon: FileText, color: 'border-l-sky-500 text-sky-400 bg-sky-950/40' };
  }
  // Match before generic "edit": kimi uses "StrReplaceFile" / "Replace".
  if (n.includes('edit') || n.includes('modify') || n.includes('update') || n.includes('replace')) {
    return { icon: FileEdit, color: 'border-l-amber-500 text-amber-400 bg-amber-950/40' };
  }
  if (n.includes('write') || n.includes('create')) {
    return { icon: FilePlus, color: 'border-l-emerald-500 text-emerald-400 bg-emerald-950/40' };
  }
  if (n.includes('delete')) {
    return { icon: FileMinus, color: 'border-l-red-500 text-red-400 bg-red-950/40' };
  }
  // Kimi's "Shell" tool maps to a terminal command alongside bash/run/exec.
  if (n.includes('bash') || n.includes('run') || n.includes('exec') || n === 'shell') {
    return { icon: Terminal, color: 'border-l-lime-500 text-lime-400 bg-lime-950/40' };
  }
  if (n.includes('search') || n.includes('grep') || n.includes('glob')) {
    return { icon: Search, color: 'border-l-violet-500 text-violet-400 bg-violet-950/40' };
  }
  if (n.includes('fetch') || n.includes('web') || n.includes('url')) {
    return { icon: Globe, color: 'border-l-cyan-500 text-cyan-400 bg-cyan-950/40' };
  }
  if (n.includes('todo')) {
    return { icon: CheckSquare, color: 'border-l-pink-500 text-pink-400 bg-pink-950/40' };
  }
  return { icon: Wrench, color: 'border-l-zinc-500 text-zinc-400 bg-zinc-900/60' };
};

/* ── Parse tool call content ───────────────────────────────── */
function parseToolContent(content: string, toolName?: string) {
  const clean = content.replace(/[\u203A>\u27E9]\s*$/, '').trim();

  // Prefer explicit toolName from the parser; fall back to the first identifier.
  const name = toolName
    || clean.match(/^([A-Z][A-Za-z0-9_]*)/)?.[1]
    || clean.split(/[\s(]/)[0];

  // Extract the args portion inside parens. Use the LAST closing paren so
  // nested string quotes don't short-circuit the capture.
  const openParen = clean.indexOf('(');
  const closeParen = clean.lastIndexOf(')');
  const argsRaw = (openParen >= 0 && closeParen > openParen)
    ? clean.slice(openParen + 1, closeParen).trim()
    : undefined;

  const filePathMatch = clean.match(/(?:file_path|path|file)\s*[:=]\s*["']([^"']+)["']/i)
    || clean.match(/\b([\w./-]+\.(?:ts|tsx|js|jsx|py|json|yaml|yml|html|css|rs|go|java|md|sql|sh|dockerfile))\b/i);

  const commandMatch = clean.match(/(?:command|cmd|bash)\s*[:=]\s*["']([\s\S]+?)["']\s*(?:,|\)|$)/i);

  const searchMatch = clean.match(/(?:query|search|q|pattern)\s*[:=]\s*["']([^"']+)["']/i);

  const primary = filePathMatch?.[1] || commandMatch?.[1] || searchMatch?.[1] || argsRaw || '';
  const summary = primary.length > 100 ? primary.slice(0, 97) + '…' : primary;

  return {
    name,
    summary,
    argsRaw,
    filePath: filePathMatch?.[1],
    command: commandMatch?.[1],
    searchQuery: searchMatch?.[1],
  };
}

/* ── Code block with copy button & line numbers ────────────── */
function CodeBlock({
  inline,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & { inline?: boolean }) {
  const match = /language-(\w+)/.exec(className || '');
  const lang = match?.[1];
  const [copied, setCopied] = useState(false);

  // react-markdown v9 dropped the `inline` prop — detect inline code by the
  // absence of a language class and no embedded newlines.
  const raw = String(children ?? '');
  const isBlock = inline === false || Boolean(lang) || raw.includes('\n');

  const copy = () => {
    const text = raw.replace(/\n$/, '');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!isBlock) {
    return (
      <code
        className="font-mono text-[11px] bg-zinc-800/80 text-zinc-200 px-1.5 py-0.5 rounded border border-zinc-700/60"
        {...props}
      >
        {children}
      </code>
    );
  }

  const text = String(children).replace(/\n$/, '');
  const lines = text.split('\n');

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-zinc-800/80 shadow-sm">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900/90 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
            {lang || 'text'}
          </span>
        </div>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="flex bg-zinc-950">
        {/* Line numbers */}
        <div className="select-none py-3 pl-3 pr-2 text-right bg-zinc-950 border-r border-zinc-900/50">
          {lines.map((_, i) => (
            <div key={i} className="text-[11px] font-mono text-zinc-700 leading-5">
              {i + 1}
            </div>
          ))}
        </div>
        {/* Code */}
        <pre className="flex-1 p-3 overflow-x-auto">
          <code className="font-mono text-xs text-zinc-300 leading-5" {...props}>
            {children}
          </code>
        </pre>
      </div>
    </div>
  );
}

/* ── Tool call card ──────────────────────────────────────── */
function ToolCallCard({ message, results }: { message: Msg; results: string[] }) {
  const [open, setOpen] = useState(false);
  const parsed = parseToolContent(message.content, message.toolName);
  const hasDetails = Boolean(
    parsed.filePath || parsed.command || parsed.searchQuery || parsed.argsRaw || results.length
  );

  const { icon: Icon, color } = toolMeta(message.toolName || parsed.name);

  return (
    <div className="my-2">
      <button
        onClick={() => hasDetails && setOpen(!open)}
        className={`flex items-center gap-2 text-xs py-1.5 px-3 rounded-md border-l-2 text-left w-full transition-colors ${hasDetails ? 'hover:brightness-110 cursor-pointer' : 'cursor-default'} ${color}`}
      >
        {hasDetails ? (
          open
            ? <ChevronDown size={12} className="shrink-0 opacity-70" />
            : <ChevronRight size={12} className="shrink-0 opacity-70" />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <Icon size={13} className="shrink-0 opacity-80" />
        <span className="font-mono font-medium">{parsed.name}</span>
        {parsed.summary && (
          <span className="font-mono text-zinc-400/80 truncate">{parsed.summary}</span>
        )}
        {results.length > 0 && !open && (
          <span className="ml-auto text-[10px] text-zinc-500 shrink-0">
            {results[0].length > 40 ? results[0].slice(0, 37) + '…' : results[0]}
          </span>
        )}
      </button>
      {open && hasDetails && (
        <div className="mt-1 ml-5 rounded-md bg-zinc-900/60 border border-zinc-800/60 px-3 py-2 space-y-2">
          {parsed.filePath && (
            <div className="flex items-center gap-2">
              <FileText size={11} className="text-zinc-500 shrink-0" />
              <span className="text-[11px] font-mono text-sky-400 break-all">{parsed.filePath}</span>
            </div>
          )}
          {parsed.command && (
            <div className="rounded overflow-hidden border border-zinc-800">
              <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-950 border-b border-zinc-800">
                <Terminal size={10} className="text-lime-500" />
                <span className="text-[10px] text-zinc-500 uppercase">Command</span>
              </div>
              <pre className="px-2 py-1.5 text-[11px] font-mono text-zinc-300 bg-zinc-950 overflow-x-auto whitespace-pre-wrap">
                {parsed.command}
              </pre>
            </div>
          )}
          {parsed.searchQuery && (
            <div className="flex items-center gap-2">
              <Search size={11} className="text-zinc-500 shrink-0" />
              <span className="text-[11px] font-mono text-violet-400">{parsed.searchQuery}</span>
            </div>
          )}
          {!parsed.filePath && !parsed.command && !parsed.searchQuery && parsed.argsRaw && (
            <pre className="text-[11px] font-mono text-zinc-400 whitespace-pre-wrap break-all">
              {parsed.argsRaw}
            </pre>
          )}
          {results.length > 0 && (
            <div className="rounded overflow-hidden border border-zinc-800">
              <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-950 border-b border-zinc-800">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Result</span>
              </div>
              <pre className="px-2 py-1.5 text-[11px] font-mono text-zinc-300 bg-zinc-950 overflow-x-auto whitespace-pre-wrap">
                {results.join('\n')}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── System divider ──────────────────────────────────────── */
function SystemDivider({ content }: { content: string }) {
  return (
    <div className="flex items-center gap-2 py-2 my-1">
      <div className="flex-1 h-px bg-zinc-800" />
      <span className="text-zinc-600 text-[10px] uppercase tracking-widest font-medium">{content}</span>
      <div className="flex-1 h-px bg-zinc-800" />
    </div>
  );
}

/* ── Markdown renderer ───────────────────────────────────── */
function Markdown({ content }: { content: string }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none text-zinc-200 leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: CodeBlock as any,
          // Block code renders its own <pre>; skip the outer wrapper react-markdown adds.
          pre: ({ children }) => <>{children}</>,
          p: ({ children }) => <p className="mb-2.5 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-2.5 space-y-1 pl-4 list-disc">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2.5 space-y-1 pl-4 list-decimal">{children}</ol>,
          li: ({ children }) => <li className="leading-snug">{children}</li>,
          h1: ({ children }) => <h1 className="text-base font-semibold text-zinc-100 mt-5 mb-2.5 pb-1 border-b border-zinc-800">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-semibold text-zinc-100 mt-4 mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-medium text-zinc-200 mt-3 mb-1.5">{children}</h3>,
          hr: () => <hr className="border-zinc-800 my-4" />,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-zinc-600 pl-3 text-zinc-400 my-2.5 italic bg-zinc-900/30 py-1 pr-2 rounded-r">
              {children}
            </blockquote>
          ),
          a: ({ children, href }) => (
            <a href={href} className="text-sky-400 hover:text-sky-300 underline underline-offset-2" target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-2.5 rounded-lg border border-zinc-800">
              <table className="text-xs border-collapse w-full">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-zinc-900">{children}</thead>,
          th: ({ children }) => (
            <th className="border border-zinc-800 px-3 py-1.5 text-zinc-300 font-medium text-left">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-zinc-800 px-3 py-1.5 text-zinc-400">
              {children}
            </td>
          ),
          strong: ({ children }) => <strong className="text-zinc-100 font-semibold">{children}</strong>,
          em: ({ children }) => <em className="text-zinc-300 italic">{children}</em>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/* ── Assistant turn ──────────────────────────────────────── */
interface Props {
  messages: Msg[];
  model?: Provider;
}

export default function AssistantTurn({ messages, model }: Props) {
  // Build a flow of elements: merge consecutive ai-text, keep tool calls & system separate.
  // tool-result messages are attached to the most-recent tool-call.
  type El =
    | { type: 'text'; content: string }
    | { type: 'tool'; msg: Msg; results: string[] }
    | { type: 'system'; content: string };
  const elements: El[] = [];

  let textBuf = '';
  const flushText = () => {
    if (textBuf.trim()) {
      elements.push({ type: 'text', content: textBuf.trim() });
      textBuf = '';
    }
  };

  for (const msg of messages) {
    if (msg.type === 'ai-text') {
      textBuf += (textBuf ? '\n\n' : '') + msg.content;
    } else if (msg.type === 'tool-call') {
      flushText();
      elements.push({ type: 'tool', msg, results: [] });
    } else if (msg.type === 'tool-result') {
      // Attach to the most recent tool-call element, if any; otherwise render as faint text.
      const last = elements[elements.length - 1];
      if (last && last.type === 'tool') {
        last.results.push(msg.content);
      } else {
        textBuf += (textBuf ? '\n' : '') + '> ' + msg.content;
      }
    } else if (msg.type === 'system') {
      flushText();
      elements.push({ type: 'system', content: msg.content });
    }
  }
  flushText();

  const meta = providerMeta(model);
  const ProviderIcon = meta.icon;

  return (
    <div className="flex gap-3">
      {/* Avatar */}
      <div className="shrink-0 mt-0.5">
        <div className={`w-6 h-6 rounded-full ${meta.avatarBg} border ${meta.avatarBorder} flex items-center justify-center`}>
          <ProviderIcon size={14} className={meta.color} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className={`text-[11px] font-medium ${meta.color} mb-1`}>{meta.name}</div>
        <div className="space-y-0">
          {elements.map((el, i) => {
            if (el.type === 'text') {
              return <Markdown key={i} content={el.content} />;
            }
            if (el.type === 'tool') {
              return <ToolCallCard key={i} message={el.msg} results={el.results} />;
            }
            if (el.type === 'system') {
              return <SystemDivider key={i} content={el.content} />;
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
}
