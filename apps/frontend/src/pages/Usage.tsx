import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  Trash2,
  AlertTriangle,
  BarChart3,
  Coins,
  Database,
  Layers,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import api from '../lib/api';
import { UsageRecord, UsageStats } from '../types/usage';

function formatNumber(n?: number): string {
  if (n === undefined || n === null || isNaN(n)) return '-';
  return n.toLocaleString();
}

function formatCost(n?: number): string {
  if (n === undefined || n === null || isNaN(n)) return '-';
  return '$' + n.toFixed(4);
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

const PROVIDER_COLORS: Record<string, string> = {
  claude: 'text-orange-400',
  kimi: 'text-purple-400',
  codex: 'text-green-400',
};

const PROVIDER_BG: Record<string, string> = {
  claude: 'bg-orange-400/10 border-orange-400/20',
  kimi: 'bg-purple-400/10 border-purple-400/20',
  codex: 'bg-green-400/10 border-green-400/20',
};

export default function Usage() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [filterProvider, setFilterProvider] = useState<string>('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (filterProvider !== 'all') params.provider = filterProvider;

      const [recordsRes, statsRes] = await Promise.all([
        api.get<UsageRecord[]>('/usage', { params }),
        api.get<UsageStats>('/usage/stats', { params }),
      ]);

      setRecords(recordsRes.data);
      setStats(statsRes.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [filterProvider]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const showMsg = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 4000);
  };

  const clearAll = async () => {
    setConfirmClear(false);
    setLoading(true);
    try {
      await api.delete('/usage/all');
      showMsg('All usage data cleared');
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const providerStats = stats ? Object.values(stats.byProvider) : [];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Back to dashboard"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-lg font-semibold">Usage Manager</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
              <BarChart3 size={20} className="text-blue-400" />
              <div>
                <div className="text-2xl font-semibold">{formatNumber(stats.totalRecords)}</div>
                <div className="text-xs text-zinc-500">Total records</div>
              </div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
              <Database size={20} className="text-zinc-400" />
              <div>
                <div className="text-2xl font-semibold">{formatNumber(stats.totalTokens)}</div>
                <div className="text-xs text-zinc-500">Total tokens</div>
              </div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
              <Layers size={20} className="text-indigo-400" />
              <div>
                <div className="text-2xl font-semibold">{formatNumber(stats.totalInputTokens)}</div>
                <div className="text-xs text-zinc-500">Input tokens</div>
              </div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
              <Coins size={20} className="text-yellow-400" />
              <div>
                <div className="text-2xl font-semibold">{formatCost(stats.totalCostUsd)}</div>
                <div className="text-xs text-zinc-500">Total cost</div>
              </div>
            </div>
          </div>
        )}

        {/* Provider breakdown */}
        {providerStats.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {providerStats.map((p) => (
              <div
                key={p.provider}
                className={`rounded-xl p-4 border ${PROVIDER_BG[p.provider] || 'bg-zinc-900 border-zinc-800'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`font-medium capitalize ${PROVIDER_COLORS[p.provider] || 'text-zinc-300'}`}>
                    {p.provider}
                  </span>
                  <span className="text-xs text-zinc-500">{p.records} records</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <div className="text-zinc-300">{formatNumber(p.totalTokens)}</div>
                    <div className="text-xs text-zinc-600">tokens</div>
                  </div>
                  <div>
                    <div className="text-zinc-300">{formatNumber(p.inputTokens)}</div>
                    <div className="text-xs text-zinc-600">input</div>
                  </div>
                  <div>
                    <div className="text-zinc-300">{formatCost(p.costUsd)}</div>
                    <div className="text-xs text-zinc-600">cost</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Filters & Actions */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <select
              value={filterProvider}
              onChange={(e) => setFilterProvider(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-zinc-700"
            >
              <option value="all">All providers</option>
              <option value="claude">Claude</option>
              <option value="kimi">Kimi</option>
              <option value="codex">Codex</option>
            </select>
          </div>
          <button
            onClick={() => setConfirmClear(true)}
            disabled={records.length === 0 || loading}
            className="flex items-center gap-2 text-sm bg-red-900/30 text-red-400 border border-red-900/50 hover:bg-red-900/50 rounded-lg px-3 py-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Trash2 size={14} />
            Clear all
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-4 flex items-center gap-2 text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-4 py-3">
            <XCircle size={16} />
            {error}
          </div>
        )}
        {message && (
          <div className="mb-4 flex items-center gap-2 text-sm text-green-400 bg-green-900/20 border border-green-900/30 rounded-lg px-4 py-3">
            <CheckCircle2 size={16} />
            {message}
          </div>
        )}

        {/* Table */}
        {records.length === 0 ? (
          <div className="text-center py-20 text-zinc-600">
            No usage data yet — usage will appear as AI sessions run
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[640px]">
              <thead className="bg-zinc-800/50 text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Provider</th>
                  <th className="px-4 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 font-medium">Tokens</th>
                  <th className="px-4 py-3 font-medium">Cost</th>
                  <th className="px-4 py-3 font-medium">Raw</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                      {formatDate(r.timestamp)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`capitalize font-medium ${PROVIDER_COLORS[r.provider] || 'text-zinc-300'}`}>
                        {r.provider}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {r.modelName || '-'}
                    </td>
                    <td className="px-4 py-3 text-zinc-300">
                      {r.totalTokens !== undefined ? (
                        <div className="text-xs">
                          <div>{formatNumber(r.totalTokens)} total</div>
                          {r.inputTokens !== undefined && (
                            <div className="text-zinc-500">
                              {formatNumber(r.inputTokens)} in / {formatNumber(r.outputTokens ?? 0)} out
                            </div>
                          )}
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-300">
                      {r.costUsd !== undefined ? formatCost(r.costUsd) : '-'}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 font-mono text-xs truncate max-w-xs" title={r.rawLine}>
                      {r.rawLine}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Confirmation modal */}
      {confirmClear && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={20} className="text-orange-400" />
              <h3 className="font-semibold">Clear all usage data?</h3>
            </div>
            <p className="text-sm text-zinc-400 mb-6">
              This will permanently remove all usage records. This cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmClear(false)}
                className="text-sm text-zinc-400 hover:text-zinc-200 px-3 py-2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={clearAll}
                className="text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg px-4 py-2 transition-colors"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
