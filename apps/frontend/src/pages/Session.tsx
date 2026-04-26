import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { GitBranch, Upload, Square, ArrowLeft, TerminalSquare, MessageSquare, Zap, Clock, CheckCircle, XCircle, ChevronDown, GitPullRequest, GitMerge } from 'lucide-react';
import { useSocket } from '../hooks/useSocket';
import Terminal from '../components/Terminal';
import ChatPanel from '../components/ChatPanel';
import FileTree from '../components/FileTree';
import DiffViewer from '../components/DiffViewer';
import NewSessionModal from '../components/NewSessionModal';
import { SessionSummary } from '../types';
import api from '../lib/api';

type Tab = 'chat' | 'terminal';

const STATUS_ICON = {
  creating: <Clock size={12} className="text-yellow-500 shrink-0" />,
  ready: <CheckCircle size={12} className="text-green-500 shrink-0" />,
  running: <Zap size={12} className="text-blue-400 shrink-0" />,
  stopped: <Clock size={12} className="text-orange-400 shrink-0" />,
  ended: <XCircle size={12} className="text-zinc-600 shrink-0" />,
};

export default function Session() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const socket = useSocket();
  const navigate = useNavigate();

  const [session, setSession] = useState<SessionSummary | null>(null);
  const [allSessions, setAllSessions] = useState<SessionSummary[]>([]);
  const [tab, setTab] = useState<Tab>('chat');
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diff, setDiff] = useState<string>('');
  const [pushUrl, setPushUrl] = useState<string | null>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [mergedToMain, setMergedToMain] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sessionId) return;
    api.get<SessionSummary>(`/sessions/${sessionId}`)
      .then((r) => setSession(r.data))
      .catch(() => navigate('/dashboard'));
  }, [sessionId, navigate]);

  useEffect(() => {
    api.get<SessionSummary[]>('/sessions').then((r) => setAllSessions(r.data));
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  useEffect(() => {
    if (!socket) return;

    socket.on('sessions:list', (list: SessionSummary[]) => setAllSessions(list));
    socket.on('session:created', (s: SessionSummary) => {
      setAllSessions((prev) => [...prev.filter((x) => x.id !== s.id), s]);
    });

    return () => {
      socket.off('sessions:list');
      socket.off('session:created');
    };
  }, [socket]);

  useEffect(() => {
    if (!socket || !sessionId) return;

    socket.on('files:update', ({ sessionId: sid, files: f }: { sessionId: string; files: string[] }) => {
      if (sid === sessionId) setFiles(f);
    });

    socket.on('diff:update', ({ sessionId: sid, file, diff: d }: { sessionId: string; file: string; diff: string }) => {
      if (sid === sessionId && file === selectedFile) setDiff(d);
    });

    socket.on('session:pushed', ({ sessionId: sid, url }: { sessionId: string; url: string }) => {
      if (sid === sessionId) { setPushUrl(url); setActionInProgress(null); }
    });

    socket.on('session:pr-created', ({ sessionId: sid, url }: { sessionId: string; url: string }) => {
      if (sid === sessionId) { setPrUrl(url); setActionInProgress(null); }
    });

    socket.on('session:merged-to-main', ({ sessionId: sid }: { sessionId: string }) => {
      if (sid === sessionId) { setMergedToMain(true); setActionInProgress(null); }
    });

    socket.on('session:ended', ({ sessionId: sid }: { sessionId: string }) => {
      if (sid === sessionId) setSession((s) => s ? { ...s, status: 'ended' } : s);
    });

    socket.on('session:updated', (summary: SessionSummary) => {
      if (summary.id === sessionId) setSession(summary);
      setAllSessions((prev) => prev.map((s) => (s.id === summary.id ? summary : s)));
    });

    socket.on('session:error', ({ sessionId: sid, error }: { sessionId?: string; error: string }) => {
      if (!sid || sid === sessionId) setSessionError(error);
    });

    return () => {
      socket.off('files:update');
      socket.off('diff:update');
      socket.off('session:pushed');
      socket.off('session:pr-created');
      socket.off('session:merged-to-main');
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
    setActionInProgress('push');
    socket.emit('session:push', { sessionId });
    setShowMenu(false);
  };

  const createPR = () => {
    if (!socket || !sessionId) return;
    setActionInProgress('pr');
    socket.emit('session:create-pr', { sessionId });
    setShowMenu(false);
  };

  const mergeToMain = () => {
    if (!socket || !sessionId) return;
    setActionInProgress('merge');
    socket.emit('session:merge-to-main', { sessionId });
    setShowMenu(false);
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
      {sessionError && (
        <div className="bg-red-950 border-b border-red-800 text-red-300 text-xs px-4 py-2">
          Error: {sessionError}
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
        {session.modelName && (
          <span className="text-xs text-zinc-600 ml-1">({session.modelName})</span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {pushUrl && <a href={pushUrl} target="_blank" rel="noreferrer" className="text-xs text-green-400 hover:text-green-300 underline">Branch pushed ↗</a>}
          {prUrl && <a href={prUrl} target="_blank" rel="noreferrer" className="text-xs text-green-400 hover:text-green-300 underline">PR created ↗</a>}
          {mergedToMain && <span className="text-xs text-green-400">Merged to main ✓</span>}

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              disabled={actionInProgress !== null || session.status === 'creating'}
              className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40"
            >
              <Upload size={12} />
              {actionInProgress === 'push' ? 'Pushing…' : actionInProgress === 'pr' ? 'Creating PR…' : actionInProgress === 'merge' ? 'Merging…' : 'Git Actions'}
              <ChevronDown size={12} />
            </button>

            {showMenu && (
              <div className="absolute right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg z-50 min-w-48">
                <button
                  onClick={pushBranch}
                  className="w-full text-left px-4 py-2 text-xs text-zinc-100 hover:bg-zinc-700 flex items-center gap-2 first:rounded-t-lg"
                >
                  <Upload size={12} /> Push Branch
                </button>
                <button
                  onClick={createPR}
                  className="w-full text-left px-4 py-2 text-xs text-zinc-100 hover:bg-zinc-700 flex items-center gap-2"
                >
                  <GitPullRequest size={12} /> Create PR
                </button>
                <button
                  onClick={mergeToMain}
                  className="w-full text-left px-4 py-2 text-xs text-zinc-100 hover:bg-zinc-700 flex items-center gap-2 last:rounded-b-lg"
                >
                  <GitMerge size={12} /> Push to Main
                </button>
              </div>
            )}
          </div>

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
        {/* Left sidebar: sessions */}
        <div className="w-64 border-r border-zinc-900 flex flex-col shrink-0 bg-zinc-950">
          <div className="px-4 py-3 border-b border-zinc-900 flex items-center justify-between">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Sessions</span>
            <button
              onClick={() => setShowNew(true)}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              + New
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto py-2">
            {allSessions.length === 0 ? (
              <div className="px-4 py-6 text-xs text-zinc-600 text-center">No sessions</div>
            ) : (
              <div className="space-y-4">
                {Object.entries(
                  allSessions.reduce<Record<string, SessionSummary[]>>((acc, s) => {
                    (acc[s.repoFullName] ||= []).push(s);
                    return acc;
                  }, {})
                )
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([repo, repoSessions]) => (
                    <div key={repo}>
                      <div className="px-3 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                        {repo}
                      </div>
                      <div className="space-y-1 px-2">
                        {repoSessions
                          .sort((a, b) => b.createdAt - a.createdAt)
                          .map((s) => {
                            const isActive = s.id === sessionId;
                            return (
                              <button
                                key={s.id}
                                onClick={() => navigate(`/session/${s.id}`)}
                                className={`w-full text-left rounded-lg px-3 py-2 transition-colors ${
                                  isActive
                                    ? 'bg-zinc-800 border border-zinc-700'
                                    : 'hover:bg-zinc-900 border border-transparent'
                                }`}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  {STATUS_ICON[s.status]}
                                  <span className={`text-xs capitalize ${isActive ? 'text-zinc-200' : 'text-zinc-400'}`}>
                                    {s.status}
                                  </span>
                                  <span className="ml-auto text-[10px] text-zinc-600">{s.modelName || s.model}</span>
                                </div>
                                <div className={`font-mono text-xs truncate ${isActive ? 'text-zinc-100' : 'text-zinc-300'}`}>
                                  {s.branch}
                                </div>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

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

          {/* Tab content — both are always mounted so xterm can measure correctly */}
          <div className="flex-1 min-h-0 relative">
            <div className={`absolute inset-0 ${tab === 'chat' ? '' : 'invisible pointer-events-none'}`}>
              <ChatPanel sessionId={sessionId} socket={socket} model={session.model} />
            </div>
            <div className={`absolute inset-0 ${tab === 'terminal' ? '' : 'invisible pointer-events-none'}`}>
              <Terminal sessionId={sessionId} socket={socket} tab={tab} />
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
        </div>
      </div>

      {/* Code diff modal */}
      {selectedFile && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setSelectedFile(null)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl flex flex-col max-w-4xl w-11/12 h-5/6 max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <span className="font-mono text-sm text-zinc-100">{selectedFile}</span>
              <button
                onClick={() => setSelectedFile(null)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <DiffViewer diff={diff} />
            </div>
          </div>
        </div>
      )}

      {showNew && (
        <NewSessionModal
          socket={socket}
          onClose={() => setShowNew(false)}
        />
      )}
    </div>
  );
}
