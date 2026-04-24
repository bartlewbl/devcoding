import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FileText, FileEdit, FilePlus, FileMinus, Terminal,
  Search, Globe, CheckSquare, Wrench, ChevronRight, ChevronDown,
  Copy, Check, Bot,
} from 'lucide-react';
import { ChatMessage as Msg } from '../types';
import { useState } from 'react';

/* ── Tool meta ───────────────────────────────────────────── */
const toolMeta = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('read') || n.includes('view') || n.includes('list')) {
    return { icon: FileText, color: 'border-l-sky-500 text-sky-400 bg-sky-950/40' };
  }
  if (n.includes('edit') || n.includes('modify') || n.includes('update')) {
    return { icon: FileEdit, color: 'border-l-amber-500 text-amber-400 bg-amber-950/40' };
  }
  if (n.includes('write') || n.includes('create')) {
    return { icon: FilePlus, color: 'border-l-emerald-500 text-emerald-400 bg-emerald-950/40' };
  }
  if (n.includes('delete')) {
    return { icon: FileMinus, color: 'border-l-red-500 text-red-400 bg-red-950/40' };
  }
  if (n.includes('bash') || n.includes('run') || n.includes('exec')) {
    return { icon: Terminal, color: 'border-l-lime-500 text-lime-400 bg-lime-950/40' };
  }
  if (n.includes('search') || n.includes('grep') || n.includes('glob')) {
    return { icon: Search, color: 'border-l-violet-500 text-violet-400 bg-violet-950/40' };
  }
  if (n.includes('fetch') || n.includes('web')) {
    return { icon: Globe, color: 'border-l-cyan-500 text-cyan-400 bg-cyan-950/40' };
  }
  if (n.includes('todo')) {
    return { icon: CheckSquare, color: 'border-l-pink-500 text-pink-400 bg-pink-950/40' };
  }
  return { icon: Wrench, color: 'border-l-zinc-500 text-zinc-400 bg-zinc-900/60' };
};

/* ── Code block with copy button ─────────────────────────── */
function CodeBlock({
  inline,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & { inline?: boolean }) {
  const match = /language-(\w+)/.exec(className || '');
  const lang = match?.[1];
  const [copied, setCopied] = useState(false);

  const copy = () => {
    const text = String(children).replace(/\n$/, '');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (inline) {
    return (
      <code
        className="font-mono text-[11px] bg-zinc-800 text-zinc-200 px-1 py-0.5 rounded border border-zinc-700/50"
        {...props}
      >
        {children}
      </code>
    );
  }

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-zinc-800">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800">
        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
          {lang || 'code'}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="bg-zinc-950 p-3 overflow-x-auto">
        <code className="font-mono text-xs text-zinc-300" {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

/* ── Tool call card ──────────────────────────────────────── */
function ToolCallCard({ message }: { message: Msg }) {
  const [open, setOpen] = useState(false);
  const label = message.content.replace(/[\u203A>]\s*$/, '').trim();
  if (!label) return null;

  const { icon: Icon, color } = toolMeta(message.toolName || label);

  return (
    <div className="my-2">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 text-xs py-1.5 px-3 rounded-md border-l-2 text-left w-full transition-colors hover:brightness-110 ${color}`}
      >
        {open ? (
          <ChevronDown size={12} className="shrink-0 opacity-70" />
        ) : (
          <ChevronRight size={12} className="shrink-0 opacity-70" />
        )}
        <Icon size={13} className="shrink-0 opacity-80" />
        <span className="font-mono">{label}</span>
      </button>
      {open && (
        <div className="mt-1 ml-5 rounded-md bg-zinc-900/60 border border-zinc-800/60 px-3 py-2">
          <span className="text-[11px] font-mono text-zinc-500">{message.content}</span>
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
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-2 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="leading-snug">{children}</li>,
          h1: ({ children }) => <h1 className="text-base font-semibold text-zinc-100 mt-4 mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-semibold text-zinc-100 mt-3 mb-1.5">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-medium text-zinc-200 mt-2 mb-1">{children}</h3>,
          hr: () => <hr className="border-zinc-800 my-3" />,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-zinc-700 pl-3 text-zinc-400 my-2 italic">
              {children}
            </blockquote>
          ),
          a: ({ children, href }) => (
            <a href={href} className="text-sky-400 hover:text-sky-300 underline" target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="text-xs border-collapse border border-zinc-800">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-zinc-800 px-2 py-1 bg-zinc-900 text-zinc-300 font-medium text-left">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-zinc-800 px-2 py-1 text-zinc-400">{children}</td>
          ),
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
}

export default function AssistantTurn({ messages }: Props) {
  // Build a flow of elements: merge consecutive ai-text, keep tool calls & system separate
  const elements: { type: 'text' | 'tool' | 'system'; content: string; msg?: Msg }[] = [];

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
      elements.push({ type: 'tool', content: msg.content, msg });
    } else if (msg.type === 'system') {
      flushText();
      elements.push({ type: 'system', content: msg.content });
    }
  }
  flushText();

  return (
    <div className="flex gap-3">
      {/* Avatar */}
      <div className="shrink-0 mt-0.5">
        <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
          <Bot size={14} className="text-zinc-400" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium text-zinc-500 mb-1">Assistant</div>
        <div className="space-y-0">
          {elements.map((el, i) => {
            if (el.type === 'text') {
              return <Markdown key={i} content={el.content} />;
            }
            if (el.type === 'tool') {
              return el.msg ? <ToolCallCard key={i} message={el.msg} /> : null;
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
