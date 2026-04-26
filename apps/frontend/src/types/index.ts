export * from './usage';

export interface SessionSummary {
  id: string;
  branch: string;
  model: 'claude' | 'kimi' | 'codex';
  modelName?: string;
  effort: string;
  status: 'creating' | 'ready' | 'running' | 'stopped' | 'ended';
  repoFullName: string;
  createdAt: number;
  lastActivityAt: number;
}

export interface ChatMessage {
  id: string;
  type: 'user' | 'tool-call' | 'tool-result' | 'ai-text' | 'system';
  content: string;
  toolName?: string;
  timestamp: number;
  // Streaming updates: when a new message arrives with a streamId that already
  // exists in state, the frontend replaces that message instead of appending.
  streamId?: string;
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

export interface WorktreeStatus {
  sessionId: string;
  repoFullName: string;
  branch: string;
  worktreePath: string;
  createdAt: number;
  exists: boolean;
  isOrphaned: boolean;
  sizeBytes?: number;
}
