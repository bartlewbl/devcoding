import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { Plus } from 'lucide-react';
import Spinner from './Spinner';
import RepoSelector from './RepoSelector';
import { SessionSummary, GithubRepo } from '../types';
import api from '../lib/api';

interface Props {
  socket: Socket | null;
  onClose: () => void;
  onCreated?: (session: SessionSummary) => void;
}

export default function NewSessionModal({ socket, onClose, onCreated }: Props) {
  const [selectedRepo, setSelectedRepo] = useState<GithubRepo | null>(null);
  const [model, setModel] = useState<'claude' | 'kimi' | 'codex'>('claude');
  const [modelName, setModelName] = useState<string | undefined>('claude-sonnet-4-6');
  const [effort, setEffort] = useState<'low' | 'medium' | 'high'>('medium');
  const [creating, setCreating] = useState(false);
  const [kimiModelLabel, setKimiModelLabel] = useState<string>('kimi-k2.6');

  useEffect(() => {
    if (!socket) return;

    const handleCreated = (s: SessionSummary) => {
      setCreating(false);
      onCreated?.(s);
      onClose();
    };

    const handleError = ({ error }: { error: string }) => {
      alert(`Error: ${error}`);
      setCreating(false);
    };

    socket.on('session:created', handleCreated);
    socket.on('session:error', handleError);

    return () => {
      socket.off('session:created', handleCreated);
      socket.off('session:error', handleError);
    };
  }, [socket, onCreated, onClose]);

  useEffect(() => {
    if (model !== 'kimi') return;
    api.get('/kimi/model')
      .then((res) => {
        const displayName = res.data.displayName || res.data.model || 'kimi-k2.6';
        setKimiModelLabel(displayName);
      })
      .catch(() => {
        setKimiModelLabel('kimi-k2.6');
      });
  }, [model]);

  const createSession = () => {
    if (!selectedRepo || !socket) return;
    setCreating(true);
    const payload: any = {
      repoUrl: selectedRepo.clone_url,
      repoFullName: selectedRepo.full_name,
      model,
      effort,
    };
    if (modelName !== undefined) {
      payload.modelName = modelName;
    }
    socket.emit('session:create', payload);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6">
        <h3 className="text-base font-medium mb-5">New Session</h3>

        <div className="space-y-5">
          <div>
            <label className="block text-xs text-zinc-400 mb-2">Repository</label>
            <RepoSelector selected={selectedRepo} onSelect={setSelectedRepo} />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-2">Provider</label>
            <div className="flex flex-wrap gap-2">
              {(['claude', 'kimi', 'codex'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setModel(m);
                    setModelName(
                      m === 'claude' ? 'claude-sonnet-4-6' :
                      m === 'kimi' ? undefined :
                      'gpt-5.4'
                    );
                  }}
                  className={`flex-1 min-w-[80px] py-2 rounded-lg text-sm capitalize transition-colors ${model === m ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-750'}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {model === 'kimi' ? (
            <div>
              <label className="block text-xs text-zinc-400 mb-2">Model</label>
              <div className="w-full bg-zinc-800/50 text-zinc-400 text-sm rounded-lg px-3 py-2 border border-zinc-700">
                {kimiModelLabel}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs text-zinc-400 mb-2">Model</label>
              <select
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                className="w-full bg-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-600"
              >
                {model === 'claude' ? (
                  <>
                    <option value="claude-haiku-4-5-20251001">claude-haiku-4-5-20251001</option>
                    <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
                    <option value="claude-opus-4-7">claude-opus-4-7</option>
                  </>
                ) : (
                  <>
                    <option value="gpt-5.4">gpt-5.4</option>
                    <option value="gpt-5.4-mini">gpt-5.4-mini</option>
                    <option value="gpt-5.3-codex-spark">gpt-5.3-codex-spark</option>
                    <option value="gpt-5.1-codex">gpt-5.1-codex</option>
                  </>
                )}
              </select>
            </div>
          )}

          {model === 'claude' && (
            <div>
              <label className="block text-xs text-zinc-400 mb-2">
                Reasoning Effort
              </label>
              <div className="flex flex-wrap gap-2">
                {(['low', 'medium', 'high'] as const).map((e) => (
                  <button
                    key={e}
                    onClick={() => setEffort(e)}
                    className={`flex-1 min-w-[80px] py-2 rounded-lg text-sm capitalize transition-colors ${effort === e ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-750'}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={() => { onClose(); setCreating(false); setSelectedRepo(null); }}
            className="flex-1 py-2.5 rounded-lg text-sm bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={createSession}
            disabled={!selectedRepo || creating}
            className="flex-1 py-2.5 rounded-lg text-sm bg-zinc-700 text-zinc-100 hover:bg-zinc-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {creating ? <span className="flex items-center justify-center gap-1.5"><Spinner size={14} /> Creating…</span> : 'Create Session'}
          </button>
        </div>
      </div>
    </div>
  );
}
