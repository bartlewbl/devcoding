import { useEffect, useRef } from 'react';
import {
  Play,
  Square,
  Pencil,
  Trash2,
  Power,
  ArrowRight,
  X,
} from 'lucide-react';
import { SessionSummary } from '../types';

interface SessionContextMenuProps {
  session: SessionSummary;
  x?: number;
  y?: number;
  onClose: () => void;
  onOpen: () => void;
  onRename: () => void;
  onStart: () => void;
  onStop: () => void;
  onEnd: () => void;
  onDelete: () => void;
}

export default function SessionContextMenu({
  session,
  x,
  y,
  onClose,
  onOpen,
  onRename,
  onStart,
  onStop,
  onEnd,
  onDelete,
}: SessionContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [onClose]);

  const canStart = session.status === 'stopped';
  const canStop = session.status === 'running';
  const canEnd = session.status !== 'ended' && session.status !== 'creating';

  // On desktop with coordinates, position near the cursor; otherwise center like a modal
  const positioned = typeof x === 'number' && typeof y === 'number';
  const menuStyle: React.CSSProperties = positioned
    ? {
        position: 'fixed',
        left: Math.min(x, window.innerWidth - 280),
        top: Math.min(y, window.innerHeight - 320),
        width: 260,
        zIndex: 70,
      }
    : {};

  return (
    <div
      className={`fixed inset-0 z-[70] bg-black/50 sm:bg-black/30 backdrop-blur-sm ${positioned ? 'hidden sm:block' : 'flex items-end sm:items-center justify-center p-4'}`}
      onClick={onClose}
    >
      <div
        ref={menuRef}
        style={menuStyle}
        onClick={(e) => e.stopPropagation()}
        className={`bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden ${positioned ? '' : 'w-full max-w-xs'}`}
      >
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-sm font-medium text-zinc-100 truncate">
              {session.name || session.branch}
            </div>
            <div className="text-xs text-zinc-500 truncate">{session.repoFullName}</div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <div className="py-1">
          <button
            onClick={() => { onOpen(); onClose(); }}
            className="w-full text-left px-4 py-3 text-sm text-zinc-100 hover:bg-zinc-800 flex items-center gap-3 transition-colors"
          >
            <ArrowRight size={16} className="text-zinc-400" />
            Open
          </button>

          <button
            onClick={() => { onRename(); onClose(); }}
            className="w-full text-left px-4 py-3 text-sm text-zinc-100 hover:bg-zinc-800 flex items-center gap-3 transition-colors"
          >
            <Pencil size={16} className="text-zinc-400" />
            Rename
          </button>

          {canStart && (
            <button
              onClick={() => { onStart(); onClose(); }}
              className="w-full text-left px-4 py-3 text-sm text-zinc-100 hover:bg-zinc-800 flex items-center gap-3 transition-colors"
            >
              <Play size={16} className="text-green-400" />
              Start
            </button>
          )}

          {canStop && (
            <button
              onClick={() => { onStop(); onClose(); }}
              className="w-full text-left px-4 py-3 text-sm text-zinc-100 hover:bg-zinc-800 flex items-center gap-3 transition-colors"
            >
              <Square size={16} className="text-orange-400" />
              Stop
            </button>
          )}

          {canEnd && (
            <button
              onClick={() => { onEnd(); onClose(); }}
              className="w-full text-left px-4 py-3 text-sm text-zinc-100 hover:bg-zinc-800 flex items-center gap-3 transition-colors"
            >
              <Power size={16} className="text-red-400" />
              End Session
            </button>
          )}

          <button
            onClick={() => { onDelete(); onClose(); }}
            className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-red-950/30 flex items-center gap-3 transition-colors"
          >
            <Trash2 size={16} />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
