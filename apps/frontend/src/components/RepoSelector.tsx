import { useEffect, useState } from 'react';
import { Search, Lock, Globe } from 'lucide-react';
import Spinner from './Spinner';
import api from '../lib/api';
import { GithubRepo } from '../types';

interface Props {
  onSelect: (repo: GithubRepo) => void;
  selected: GithubRepo | null;
}

export default function RepoSelector({ onSelect, selected }: Props) {
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<GithubRepo[]>('/github/repos')
      .then((r) => setRepos(r.data))
      .catch(() => setRepos([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = repos.filter((r) =>
    r.full_name.toLowerCase().includes(query.toLowerCase())
  );

  if (loading) return <div className="text-zinc-500 text-sm py-4 text-center flex items-center justify-center gap-2"><Spinner size={14} /> Loading repos…</div>;

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search repositories…"
          className="w-full bg-zinc-900 text-zinc-100 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-600 placeholder-zinc-600"
        />
      </div>

      <div className="max-h-56 overflow-y-auto space-y-0.5 rounded-lg border border-zinc-800">
        {filtered.map((repo) => (
          <button
            key={repo.id}
            onClick={() => onSelect(repo)}
            className={`w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-zinc-800 transition-colors ${selected?.id === repo.id ? 'bg-zinc-800' : ''}`}
          >
            {repo.private
              ? <Lock size={12} className="text-zinc-500 mt-0.5 shrink-0" />
              : <Globe size={12} className="text-zinc-500 mt-0.5 shrink-0" />
            }
            <div className="min-w-0">
              <div className="text-sm text-zinc-200 truncate">{repo.full_name}</div>
              {repo.description && (
                <div className="text-xs text-zinc-500 truncate mt-0.5">{repo.description}</div>
              )}
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="text-zinc-600 text-sm text-center py-4">No repos found</div>
        )}
      </div>
    </div>
  );
}
