import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { GitBranch, Upload, Square, ArrowLeft, TerminalSquare, MessageSquare } from 'lucide-react';
import { useSocket } from '../hooks/useSocket';
import Terminal from '../components/Terminal';
import ChatPanel from '../components/ChatPanel';
import FileTree from '../components/FileTree';
import DiffViewer from '../components/DiffViewer';
import { SessionSummary } from '../types';
import api from '../lib/api';

type Tab = 'chat' | 'terminal';

export default function Session() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const socket = useSocket();
  const navigate = useNavigate();

  const [session, setSession] = useState<SessionSummary | null>(null);
  const [tab, setTab] = useState<Tab>('chat');
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diff, setDiff] = useState<string>('');
  const [pushing, setPushing] = useState(false);
  const [pushUrl, setPushUrl] = useState<string | null>(null);
  const [spawnError, setSpawnError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    api.get<SessionSummary>(`/sessions/${sessionId}`)
      .then((r) => setSession(r.data))
      .catch(() => navigate('/dashboard'));
  }, [sessionId, navigate]);

  useEffect(() => {
    if (!socket || !sessionId) return;

    socket.on('files:update', ({ sessionId: sid, files: f }: { sessionId: string; files: string[] }) => {
      if (sid === sessionId) setFiles(f);
    });

    socket.on('diff:update', ({ sessionId: sid, file, diff: d }: { sessionId: string; file: string; diff: string }) => {
      if (sid === sessionId && file === selectedFile) setDiff(d);
    });

    socket.on('session:pushed', ({ sessionId: sid, url }: { sessionId: string; url: string }) => {
      if (sid === sessionId) { setPushUrl(url); setPushing(false); }
    });

    socket.on('session:ended', ({ sessionId: sid }: { sessionId: string }) => {
      if (sid === sessionId) setSession((s) => s ? { ...s, status: 'ended' } : s);
    });

    socket.on('session:error', ({ sessionId: sid, error }: { sessionId?: string; error: string }) => {
      if (!sid || sid === sessionId) setSpawnError(error);
    });

    return () => {
      socket.off('files:update');
      socket.off('diff:update');
      socket.off('session:pushed');
      socket.off('session:ended');
    };
  }, [socket, sessionId, selectedFile]);

  const onFileSelect = (file: string) => {
    setSelectedFile(file);
    if (socket && sessionId) {
      socket.emit('diff:request', { sessionId, file });
    }
  };

  const pushBranch = () => {
    if (!socket || !sessionId) return;
    setPushing(true);
    socket.emit('session:push', { sessionId });
  };

  const endSession = () => {
    if (!socket || !sessionId) return;
    socket.emit('session:end', { sessionId });
    navigate('/dashboard');
  };

  if (!socket || !session || !sessionId) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {spawnError && (
        <div className="bg-red-950 border-b border-red-800 text-red-300 text-xs px-4 py-2">
          CLI error: {spawnError} — check backend logs and make sure <code className="font-mono">claude</code> / <code className="font-mono">kimi</code> is installed and accessible.
        </div>
      )}
      {/* Header */}
      <header className="border-b border-zinc-900 px-4 py-3 flex items-center gap-3 shrink-0">
        <Link to="/dashboard" className="text-zinc-500 hover:text-zinc-300 transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <GitBranch size={14} className="text-zinc-500" />
        <span className="font-mono text-sm text-zinc-300">{session.branch}</span>
        <span className="text-zinc-700 text-xs">·</span>
        <span className="text-xs text-zinc-500">{session.repoFullName}</span>
        <span className="text-xs text-zinc-700 capitalize ml-1">{session.model}</span>

        <div className="ml-auto flex items-center gap-2">
          {pushUrl ? (
            <a href={pushUrl} target="_blank" rel="noreferrer"
              className="text-xs text-green-400 hover:text-green-300 underline">
              Branch pushed ↗
            </a>
          ) : (
            <button
              onClick={pushBranch}
              disabled={pushing || session.status === 'creating'}
              className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40"
            >
              <Upload size={12} />
              {pushing ? 'Pushing…' : 'Push Branch'}
            </button>
          )}
          <button
            onClick={endSession}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-400 transition-colors px-2 py-1.5"
          >
            <Square size={12} /> End
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Main area */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Tabs */}
          <div className="flex gap-1 px-4 pt-3 pb-0 border-b border-zinc-900 shrink-0">
            <button
              onClick={() => setTab('chat')}
              className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-t-lg transition-colors ${tab === 'chat' ? 'text-zinc-100 border-b-2 border-zinc-400' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <MessageSquare size={12} /> Chat
            </button>
            <button
              onClick={() => setTab('terminal')}
              className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-t-lg transition-colors ${tab === 'terminal' ? 'text-zinc-100 border-b-2 border-zinc-400' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <TerminalSquare size={12} /> Terminal
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 min-h-0">
            <div className={tab === 'chat' ? 'h-full' : 'hidden h-full'}>
              <ChatPanel sessionId={sessionId} socket={socket} />
            </div>
            <div className={tab === 'terminal' ? 'h-full' : 'hidden h-full'}>
              <Terminal sessionId={sessionId} socket={socket} />
            </div>
          </div>
        </div>

        {/* Right sidebar: files + diff */}
        <div className="w-72 border-l border-zinc-900 flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-zinc-900">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Changed Files</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto py-2">
            <FileTree files={files} selected={selectedFile} onSelect={onFileSelect} />
          </div>

          {selectedFile && (
            <>
              <div className="px-4 py-2 border-t border-zinc-900 border-b">
                <span className="font-mono text-xs text-zinc-500 truncate block">{selectedFile}</span>
              </div>
              <div className="flex-1 min-h-0 overflow-auto">
                <DiffViewer diff={diff} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
