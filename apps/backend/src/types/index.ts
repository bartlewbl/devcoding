import type { IPty } from 'node-pty';
import type { FSWatcher } from 'chokidar';
import type { OutputParser } from '../services/parser';

export interface Session {
  id: string;
  repoUrl: string;
  repoFullName: string;
  repoPath: string;
  worktreePath: string;
  branch: string;
  model: 'claude' | 'kimi';
  effort: 'low' | 'medium' | 'high';
  status: 'creating' | 'ready' | 'running' | 'ended';
  createdAt: number;
  outputBuffer: string;
  pty?: IPty;
  watcher?: FSWatcher;
  parser: OutputParser;
}

export interface SessionSummary {
  id: string;
  branch: string;
  model: 'claude' | 'kimi';
  effort: string;
  status: Session['status'];
  repoFullName: string;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  type: 'tool-call' | 'ai-text' | 'system';
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
