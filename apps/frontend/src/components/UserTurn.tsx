import { ChatMessage as Msg } from '../types';
import { User } from 'lucide-react';

interface Props {
  messages: Msg[];
}

export default function UserTurn({ messages }: Props) {
  const content = messages.map(m => m.content).join('\n\n');
  return (
    <div className="flex justify-end gap-3">
      <div className="flex-1 min-w-0 flex flex-col items-end">
        <div className="text-[11px] font-medium text-zinc-500 mb-1">You</div>
        <div className="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%] text-sm leading-relaxed shadow-sm">
          {content}
        </div>
      </div>
      <div className="shrink-0 mt-5">
        <div className="w-6 h-6 rounded-full bg-blue-900/40 border border-blue-700/40 flex items-center justify-center">
          <User size={14} className="text-blue-400" />
        </div>
      </div>
    </div>
  );
}
