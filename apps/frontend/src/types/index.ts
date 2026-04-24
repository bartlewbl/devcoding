export interface SessionSummary {
  id: string;
  branch: string;
  model: 'claude' | 'kimi' | 'codex';
  modelName?: string;
  effort: string;
  status: 'creating' | 'ready' | 'running' | 'ended';
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
