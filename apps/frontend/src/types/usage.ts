export interface UsageRecord {
  id: string;
  sessionId: string;
  userId: string;
  provider: 'claude' | 'kimi' | 'codex';
  modelName?: string;
  timestamp: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  rawLine: string;
}

export interface UsageStats {
  totalRecords: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  byProvider: Record<string, ProviderStats>;
  byModel: Record<string, ModelStats>;
}

export interface ProviderStats {
  provider: string;
  records: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface ModelStats {
  model: string;
  provider: string;
  records: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
}
