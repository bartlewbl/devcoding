import { FileCode, Trash2 } from 'lucide-react';

interface Props {
  files: string[];
  selected: string | null;
  onSelect: (file: string) => void;
}

export default function FileTree({ files, selected, onSelect }: Props) {
  if (!files.length) {
    return <p className="text-zinc-700 text-xs px-3 py-2">No changes yet</p>;
  }

  return (
    <div className="space-y-0.5">
      {files.map((f) => (
        <button
          key={f}
          onClick={() => onSelect(f)}
          className={`w-full flex items-center gap-2 px-3 py-1.5 rounded text-left hover:bg-zinc-800 transition-colors ${selected === f ? 'bg-zinc-800' : ''}`}
        >
          <FileCode size={12} className="text-yellow-500 shrink-0" />
          <span className="font-mono text-xs text-zinc-300 truncate">{f}</span>
        </button>
      ))}
    </div>
  );
}
