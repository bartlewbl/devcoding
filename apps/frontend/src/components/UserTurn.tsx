import { ChatMessage as Msg } from '../types';

interface Props {
  messages: Msg[];
}

export default function UserTurn({ messages }: Props) {
  const content = messages.map(m => m.content).join('\n\n');
  return (
    <div className="flex justify-end">
      <div className="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%] text-sm leading-relaxed shadow-sm">
        {content}
      </div>
    </div>
  );
}
