import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Github, LogOut, Zap, Clock, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import api from '../lib/api';
import RepoSelector from '../components/RepoSelector';
import { SessionSummary, GithubRepo } from '../types';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const STATUS_ICON = {
  creating: <Clock size={12} className="text-yellow-500" />,
  ready: <CheckCircle size={12} className="text-green-500" />,
  running: <Zap size={12} className="text-blue-400" />,
  ended: <XCircle size={12} className="text-zinc-600" />,
};

export default function Dashboard() {
  const { logout, token } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [githubConnected, setGithubConnected] = useState(false);
  const [showNew, setShowNew] = useState(false);

  // New session form state
  const [selectedRepo, setSelectedRepo] = useState<GithubRepo | null>(null);
  const [model, setModel] = useState<'claude' | 'kimi'>('claude');
  const [effort, setEffort] = useState<'low' | 'medium' | 'high'>('medium');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.get('/github/status').then((r) => setGithubConnected(r.data.connected));
    api.get<SessionSummary[]>('/sessions').then((r) => setSessions(r.data));
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('sessions:list', (list: SessionSummary[]) => setSessions(list));
    socket.on('session:created', (s: SessionSummary) => {
      setSessions((prev) => [...prev.filter((x) => x.id !== s.id), s]);
      navigate(`/session/${s.id}`);
    });
    socket.on('session:error', ({ error }: { error: string }) => {
      alert(`Error: ${error}`);
      setCreating(false);
    });
    return () => {
      socket.off('sessions:list');
      socket.off('session:created');
      socket.off('session:error');
    };
  }, [socket, navigate]);

  const connectGitHub = () => {
    window.location.href = `${BACKEND}/api/github/authorize?token=${token}`;
  };

  const createSession = () => {
    if (!selectedRepo || !socket) return;
    setCreating(true);
    socket.emit('session:create', {
      repoUrl: selectedRepo.clone_url,
      repoFullName: selectedRepo.full_name,
      model,
      effort,
    });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-900 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">AI Code Studio</h1>
        <div className="flex items-center gap-3">
          {!githubConnected && (
            <button
              onClick={connectGitHub}
              className="flex items-center gap-2 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg px-3 py-2 transition-colors"
            >
              <Github size={15} />
              Connect GitHub
            </button>
          )}
          {githubConnected && (
            <span className="flex items-center gap-1.5 text-xs text-green-500">
              <Github size={13} /> GitHub connected
            </span>
          )}
          <button onClick={logout} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm text-zinc-400">Sessions</h2>
          <button
            onClick={() => setShowNew(true)}
            disabled={!githubConnected}
            className="flex items-center gap-2 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg px-3 py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={14} /> New Session
          </button>
        </div>

        {/* Sessions grid */}
        {sessions.length === 0 ? (
          <div className="text-center py-20 text-zinc-600">
            {githubConnected
              ? 'No sessions yet — create one to start coding with AI'
              : 'Connect GitHub first, then create a session'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => navigate(`/session/${s.id}`)}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-left hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  {STATUS_ICON[s.status]}
                  <span className="text-xs text-zinc-400 capitalize">{s.status}</span>
                  <span className="ml-auto text-xs text-zinc-600">{s.model}</span>
                </div>
                <div className="font-mono text-xs text-zinc-300 truncate">{s.branch}</div>
                <div className="text-xs text-zinc-500 mt-1">{s.repoFullName}</div>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* New Session Modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6">
            <h3 className="text-base font-medium mb-5">New Session</h3>

            <div className="space-y-5">
              <div>
                <label className="block text-xs text-zinc-400 mb-2">Repository</label>
                <RepoSelector selected={selectedRepo} onSelect={setSelectedRepo} />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-2">Model</label>
                <div className="flex gap-2">
                  {(['claude', 'kimi'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setModel(m)}
                      className={`flex-1 py-2 rounded-lg text-sm capitalize transition-colors ${model === m ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-750'}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-2">
                  Effort {model === 'claude' && <span className="text-zinc-600">(maps to Haiku / Sonnet / Opus)</span>}
                </label>
                <div className="flex gap-2">
                  {(['low', 'medium', 'high'] as const).map((e) => (
                    <button
                      key={e}
                      onClick={() => setEffort(e)}
                      className={`flex-1 py-2 rounded-lg text-sm capitalize transition-colors ${effort === e ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-750'}`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowNew(false); setCreating(false); setSelectedRepo(null); }}
                className="flex-1 py-2.5 rounded-lg text-sm bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createSession}
                disabled={!selectedRepo || creating}
                className="flex-1 py-2.5 rounded-lg text-sm bg-zinc-700 text-zinc-100 hover:bg-zinc-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {creating ? 'Creating…' : 'Create Session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
