import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { ChatMessage as Msg } from '../types';

export default function ChatMessage({ message }: { message: Msg }) {
  const [open, setOpen] = useState(false);

  if (message.type === 'user') {
    return (
      <div className="flex mb-1">
        <div className="bg-blue-600 text-white rounded-2xl rounded-tl-sm px-4 py-2 max-w-[78%] text-sm leading-relaxed">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.type === 'tool-call') {
    const label = message.content.replace(/[›>⟩]\s*$/, '').trim();
    return (
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-400 text-sm py-0.5 text-left w-full group"
      >
        {open
          ? <ChevronDown size={12} className="shrink-0" />
          : <ChevronRight size={12} className="shrink-0" />
        }
        <span className="font-mono text-xs">{label}</span>
        <span className="text-zinc-700 group-hover:text-zinc-600">›</span>
      </button>
    );
  }

  if (message.type === 'ai-text') {
    return (
      <div className="prose prose-invert prose-sm max-w-none text-zinc-100 leading-relaxed [&_code]:font-mono [&_code]:text-xs [&_code]:bg-zinc-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-zinc-200 [&_pre]:bg-zinc-900 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {message.content}
        </ReactMarkdown>
      </div>
    );
  }

  if (message.type === 'system') {
    return (
      <div className="text-zinc-600 text-xs italic py-1">{message.content}</div>
    );
  }

  return null;
}
