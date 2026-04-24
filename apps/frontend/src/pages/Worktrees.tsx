import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  Trash2,
  AlertTriangle,
  FolderGit,
  HardDrive,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import api from '../lib/api';
import { WorktreeStatus } from '../types';

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null) return '-';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

export default function Worktrees() {
  const navigate = useNavigate();
  const [worktrees, setWorktrees] = useState<WorktreeStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<'orphaned' | 'all' | null>(null);

  const fetchWorktrees = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<WorktreeStatus[]>('/worktrees');
      setWorktrees(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorktrees();
  }, [fetchWorktrees]);

  const showMsg = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 4000);
  };

  const deleteOrphaned = async () => {
    setConfirmDelete(null);
    setLoading(true);
    try {
      const res = await api.delete<{ removed: number; errors: string[] }>('/worktrees/orphaned');
      showMsg(`Removed ${res.data.removed} orphaned worktree(s)`);
      if (res.data.errors.length > 0) {
        console.error('Cleanup errors:', res.data.errors);
      }
      await fetchWorktrees();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteAll = async () => {
    setConfirmDelete(null);
    setLoading(true);
    try {
      const res = await api.delete<{ removed: number; errors: string[] }>('/worktrees/all');
      showMsg(`Removed ${res.data.removed} worktree(s)`);
      if (res.data.errors.length > 0) {
        console.error('Cleanup errors:', res.data.errors);
      }
      await fetchWorktrees();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const orphanedCount = worktrees.filter((w) => w.isOrphaned && w.exists).length;
  const totalSize = worktrees.reduce((sum, w) => sum + (w.sizeBytes || 0), 0);

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
          <h1 className="text-lg font-semibold">Worktree Manager</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchWorktrees}
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
            <FolderGit size={20} className="text-blue-400" />
            <div>
              <div className="text-2xl font-semibold">{worktrees.length}</div>
              <div className="text-xs text-zinc-500">Total worktrees</div>
            </div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
            <AlertTriangle size={20} className="text-orange-400" />
            <div>
              <div className="text-2xl font-semibold">{orphanedCount}</div>
              <div className="text-xs text-zinc-500">Orphaned</div>
            </div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
            <HardDrive size={20} className="text-zinc-400" />
            <div>
              <div className="text-2xl font-semibold">{formatBytes(totalSize)}</div>
              <div className="text-xs text-zinc-500">Total disk usage</div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setConfirmDelete('orphaned')}
            disabled={orphanedCount === 0 || loading}
            className="flex items-center gap-2 text-sm bg-orange-900/30 text-orange-400 border border-orange-900/50 hover:bg-orange-900/50 rounded-lg px-3 py-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Trash2 size={14} />
            Delete orphaned
          </button>
          <button
            onClick={() => setConfirmDelete('all')}
            disabled={worktrees.length === 0 || loading}
            className="flex items-center gap-2 text-sm bg-red-900/30 text-red-400 border border-red-900/50 hover:bg-red-900/50 rounded-lg px-3 py-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <AlertTriangle size={14} />
            Delete all
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
        {worktrees.length === 0 ? (
          <div className="text-center py-20 text-zinc-600">
            No worktrees found
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-800/50 text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Repository</th>
                  <th className="px-4 py-3 font-medium">Branch</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Size</th>
                  <th className="px-4 py-3 font-medium">Path</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {worktrees.map((w) => (
                  <tr
                    key={w.sessionId}
                    className={`hover:bg-zinc-800/30 transition-colors ${
                      w.isOrphaned ? 'bg-orange-900/5' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      {w.isOrphaned ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-orange-400">
                          <AlertTriangle size={12} />
                          Orphaned
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-green-400">
                          <CheckCircle2 size={12} />
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{w.repoFullName}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">{w.branch}</td>
                    <td className="px-4 py-3 text-zinc-500">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock size={12} />
                        {formatDate(w.createdAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{formatBytes(w.sizeBytes)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-600 truncate max-w-xs" title={w.worktreePath}>
                      {w.worktreePath}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={20} className="text-orange-400" />
              <h3 className="font-semibold">
                {confirmDelete === 'orphaned' ? 'Delete orphaned worktrees?' : 'Delete ALL worktrees?'}
              </h3>
            </div>
            <p className="text-sm text-zinc-400 mb-6">
              {confirmDelete === 'orphaned'
                ? `This will permanently remove ${orphanedCount} orphaned worktree(s) from disk. This cannot be undone.`
                : 'This will permanently remove ALL worktrees from disk. Active session worktrees will also be deleted. This cannot be undone.'}
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="text-sm text-zinc-400 hover:text-zinc-200 px-3 py-2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete === 'orphaned' ? deleteOrphaned : deleteAll}
                className="text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg px-4 py-2 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
