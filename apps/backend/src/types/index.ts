import type { IPty } from 'node-pty';
import type { FSWatcher } from 'chokidar';
import type { OutputParser } from '../services/parser';

export * from './usage';

export type CLIProvider = 'claude' | 'kimi' | 'codex';

export interface Session {
  id: string;
  userId: string;
  repoUrl: string;
  repoFullName: string;
  repoPath: string;
  worktreePath: string;
  branch: string;
  model: 'claude' | 'kimi' | 'codex';
  modelName?: string;
  effort: 'low' | 'medium' | 'high';
  status: 'creating' | 'ready' | 'running' | 'stopped' | 'ended';
  createdAt: number;
  outputBuffer: string;
  lastActivityAt: number;
  stoppedAt?: number;
  messages: ChatMessage[];
  pty?: IPty;
  watcher?: FSWatcher;
  parser?: OutputParser;
}

export interface SessionSummary {
  id: string;
  branch: string;
  model: 'claude' | 'kimi' | 'codex';
  modelName?: string;
  effort: string;
  status: Session['status'];
  lastActivityAt: number;
  repoFullName: string;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  type: 'user' | 'tool-call' | 'ai-text' | 'system';
  content: string;
  toolName?: string;
  timestamp: number;
}

export interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  clone_url: string;
  html_url: string;
  private: boolean;
  description: string | null;
  default_branch: string;
}

export interface AuthenticatedRequest extends Express.Request {
  userId: string;
}
