import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { Socket } from 'socket.io-client';
import { Send } from 'lucide-react';
import ChatMessage from './ChatMessage';
import { ChatMessage as Msg } from '../types';

interface Props {
  sessionId: string;
  socket: Socket;
}

export default function ChatPanel({ sessionId, socket }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = ({ sessionId: sid, message }: { sessionId: string; message: Msg }) => {
      if (sid !== sessionId) return;
      setMessages((prev) => [...prev, message]);
    };
    socket.on('chat:message', handler);
    return () => { socket.off('chat:message', handler); };
  }, [sessionId, socket]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [...prev, {
      id: Date.now().toString(),
      type: 'user',
      content: text,
      timestamp: Date.now(),
    }]);
    socket.emit('session:chat', { sessionId, message: text });
    setInput('');
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3 min-h-0">
        {messages.length === 0 && (
          <p className="text-zinc-700 text-sm">Session started. Type a message to begin.</p>
        )}
        {messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 pb-4 pt-2 border-t border-zinc-900">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
            rows={2}
            className="flex-1 bg-zinc-900 text-zinc-100 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-zinc-700 placeholder-zinc-600"
          />
          <button
            onClick={send}
            className="p-3 bg-zinc-800 text-zinc-300 rounded-xl hover:bg-zinc-700 transition-colors shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
