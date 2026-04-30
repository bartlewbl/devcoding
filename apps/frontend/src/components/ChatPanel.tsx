import { useEffect, useRef, useState, KeyboardEvent, useMemo } from 'react';
import { Socket } from 'socket.io-client';
import { Send } from 'lucide-react';
import { ChatMessage as Msg, SessionSummary } from '../types';
import UserTurn from './UserTurn';
import AssistantTurn from './AssistantTurn';

interface Props {
  sessionId: string;
  socket: Socket;
  model?: SessionSummary['model'];
}

export type Turn =
  | { role: 'user'; messages: Msg[] }
  | { role: 'assistant'; messages: Msg[] };

function groupIntoTurns(msgs: Msg[]): Turn[] {
  const turns: Turn[] = [];
  for (const msg of msgs) {
    const last = turns[turns.length - 1];
    const role = msg.type === 'user' ? 'user' : 'assistant';
    if (last && last.role === role) {
      last.messages.push(msg);
    } else {
      turns.push({ role, messages: [msg] });
    }
  }
  return turns;
}

export default function ChatPanel({ sessionId, socket, model }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMessage = ({ sessionId: sid, message }: { sessionId: string; message: Msg }) => {
      if (sid !== sessionId) return;
      setMessages((prev) => [...prev, message]);
    };
    const onHistory = ({ sessionId: sid, messages: hist }: { sessionId: string; messages: Msg[] }) => {
      if (sid !== sessionId) return;
      setMessages(hist);
    };
    socket.on('chat:message', onMessage);
    socket.on('chat:history', onHistory);
    return () => {
      socket.off('chat:message', onMessage);
      socket.off('chat:history', onHistory);
    };
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

  const turns = useMemo(() => groupIntoTurns(messages), [messages]);

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <div className="flex-1 overflow-y-auto px-4 py-5 min-h-0 overscroll-contain">
        {messages.length === 0 && (
          <p className="text-zinc-700 text-sm">Session started. Type a message to begin.</p>
        )}
        <div className="space-y-6">
          {turns.map((turn, i) =>
            turn.role === 'user' ? (
              <UserTurn key={i} messages={turn.messages} />
            ) : (
              <AssistantTurn key={i} messages={turn.messages} model={model} />
            )
          )}
        </div>
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
            className="flex-1 bg-zinc-900 text-zinc-100 rounded-xl px-4 py-3 text-base md:text-sm resize-none focus:outline-none focus:ring-1 focus:ring-zinc-700 placeholder-zinc-600"
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
