import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { UsageRecord, UsageStats, UsageFilter, ProviderStats, ModelStats } from '../types/usage';

const DATA_DIR = path.resolve(__dirname, '../../.data');
const USAGE_FILE = path.join(DATA_DIR, 'usage.json');

// In-memory cache
let records: UsageRecord[] = [];
let loaded = false;

function load(): void {
  if (loaded) return;
  if (!fs.existsSync(USAGE_FILE)) {
    records = [];
    loaded = true;
    return;
  }
  try {
    const raw = fs.readFileSync(USAGE_FILE, 'utf-8');
    const data = JSON.parse(raw) as UsageRecord[];
    records = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('[usage] failed to load usage records:', err);
    records = [];
  }
  loaded = true;
}

function save(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(USAGE_FILE, JSON.stringify(records, null, 2));
  } catch (err) {
    console.error('[usage] failed to save usage records:', err);
  }
}

export function recordUsage(
  sessionId: string,
  userId: string,
  provider: 'claude' | 'kimi' | 'codex',
  modelName: string | undefined,
  rawLine: string
): UsageRecord | undefined {
  load();

  const parsed = parseUsageLine(provider, rawLine);
  if (!parsed && !looksLikeUsage(rawLine, provider)) {
    return undefined;
  }

  const record: UsageRecord = {
    id: uuidv4(),
    sessionId,
    userId,
    provider,
    modelName,
    timestamp: Date.now(),
    rawLine: rawLine.trim(),
    ...parsed,
  };

  records.push(record);

  // Keep only the last 50,000 records to prevent unbounded growth
  if (records.length > 50_000) {
    records = records.slice(-40_000);
  }

  save();
  return record;
}

export function getUsage(filter?: UsageFilter): UsageRecord[] {
  load();
  let result = [...records];

  if (filter?.userId) {
    result = result.filter((r) => r.userId === filter.userId);
  }
  if (filter?.sessionId) {
    result = result.filter((r) => r.sessionId === filter.sessionId);
  }
  if (filter?.provider) {
    result = result.filter((r) => r.provider === filter.provider);
  }
  if (filter?.modelName) {
    result = result.filter((r) => r.modelName === filter.modelName);
  }
  if (filter?.startTime !== undefined) {
    result = result.filter((r) => r.timestamp >= filter.startTime!);
  }
  if (filter?.endTime !== undefined) {
    result = result.filter((r) => r.timestamp <= filter.endTime!);
  }

  // Sort by timestamp descending
  return result.sort((a, b) => b.timestamp - a.timestamp);
}

export function getUsageStats(filter?: UsageFilter): UsageStats {
  const filtered = getUsage(filter);

  const byProvider: Record<string, ProviderStats> = {};
  const byModel: Record<string, ModelStats> = {};

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalTokens = 0;
  let totalCostUsd = 0;

  for (const r of filtered) {
    totalInputTokens += r.inputTokens || 0;
    totalOutputTokens += r.outputTokens || 0;
    totalTokens += r.totalTokens || 0;
    totalCostUsd += r.costUsd || 0;

    const pKey = r.provider;
    if (!byProvider[pKey]) {
      byProvider[pKey] = {
        provider: r.provider,
        records: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0,
      };
    }
    byProvider[pKey].records++;
    byProvider[pKey].inputTokens += r.inputTokens || 0;
    byProvider[pKey].outputTokens += r.outputTokens || 0;
    byProvider[pKey].totalTokens += r.totalTokens || 0;
    byProvider[pKey].costUsd += r.costUsd || 0;

    const mKey = r.modelName || `${r.provider}-default`;
    if (!byModel[mKey]) {
      byModel[mKey] = {
        model: mKey,
        provider: r.provider,
        records: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0,
      };
    }
    byModel[mKey].records++;
    byModel[mKey].inputTokens += r.inputTokens || 0;
    byModel[mKey].outputTokens += r.outputTokens || 0;
    byModel[mKey].totalTokens += r.totalTokens || 0;
    byModel[mKey].costUsd += r.costUsd || 0;
  }

  return {
    totalRecords: filtered.length,
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
    totalCostUsd,
    byProvider,
    byModel,
  };
}

export function deleteUsageForSession(sessionId: string): number {
  load();
  const before = records.length;
  records = records.filter((r) => r.sessionId !== sessionId);
  const removed = before - records.length;
  if (removed > 0) save();
  return removed;
}

export function clearAllUsage(): void {
  load();
  records = [];
  save();
}

// ── Provider-specific usage parsing ───────────────────────────────────────────

interface ParsedUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
}

function looksLikeUsage(line: string, provider: string): boolean {
  const lower = line.toLowerCase();

  if (provider === 'claude') {
    return (
      /\$\d+\.\d+\s*(usd)?/i.test(line) ||
      /\d[\d,]*\s*(tokens?|input|output)/i.test(line) ||
      /^now usi/i.test(line) ||
      /extra usage/i.test(line) ||
      /anthropic\s*cost/i.test(line) ||
      /claude-code\s*$/i.test(line)
    );
  }

  if (provider === 'kimi') {
    return (
      /\$\d+\.\d+/i.test(line) ||
      /\d[\d,]*\s*(tokens?|input|output)/i.test(line) ||
      /usage/i.test(lower) ||
      /cost/i.test(lower)
    );
  }

  if (provider === 'codex') {
    return (
      /\$\d+\.\d+/i.test(line) ||
      /\d[\d,]*\s*(tokens?|input|output)/i.test(line) ||
      /usage/i.test(lower) ||
      /cost/i.test(lower)
    );
  }

  return false;
}

function parseUsageLine(provider: string, line: string): ParsedUsage | undefined {
  const result: ParsedUsage = {};
  let hasValue = false;

  if (provider === 'claude') {
    // Cost: $0.0123 USD
    const costMatch = line.match(/\$([\d,]+\.\d{2,})/);
    if (costMatch) {
      result.costUsd = parseFloat(costMatch[1].replace(/,/g, ''));
      hasValue = true;
    }

    // Tokens: "1,234 tokens" or "1,234 input / 5,678 output"
    const tokenInputOutput = line.match(/([\d,]+)\s*(?:input|in)\s*\W\s*([\d,]+)\s*(?:output|out)/i);
    if (tokenInputOutput) {
      result.inputTokens = parseInt(tokenInputOutput[1].replace(/,/g, ''), 10);
      result.outputTokens = parseInt(tokenInputOutput[2].replace(/,/g, ''), 10);
      result.totalTokens = (result.inputTokens || 0) + (result.outputTokens || 0);
      hasValue = true;
    } else {
      const tokenMatch = line.match(/([\d,]+)\s*tokens?/i);
      if (tokenMatch) {
        result.totalTokens = parseInt(tokenMatch[1].replace(/,/g, ''), 10);
        hasValue = true;
      }
    }
  }

  if (provider === 'kimi') {
    const costMatch = line.match(/\$([\d,]+\.\d{2,})/);
    if (costMatch) {
      result.costUsd = parseFloat(costMatch[1].replace(/,/g, ''));
      hasValue = true;
    }

    const tokenMatch = line.match(/([\d,]+)\s*tokens?/i);
    if (tokenMatch) {
      result.totalTokens = parseInt(tokenMatch[1].replace(/,/g, ''), 10);
      hasValue = true;
    }
  }

  if (provider === 'codex') {
    const costMatch = line.match(/\$([\d,]+\.\d{2,})/);
    if (costMatch) {
      result.costUsd = parseFloat(costMatch[1].replace(/,/g, ''));
      hasValue = true;
    }

    const tokenMatch = line.match(/([\d,]+)\s*tokens?/i);
    if (tokenMatch) {
      result.totalTokens = parseInt(tokenMatch[1].replace(/,/g, ''), 10);
      hasValue = true;
    }
  }

  return hasValue ? result : undefined;
}
