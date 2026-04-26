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

  const parsed = parseUsageLine(rawLine);
  // Only persist records that actually contain numeric usage data —
  // otherwise lines that merely mention "cost" or "usage" create empty ghost records.
  if (!parsed) return undefined;

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

// ── Usage parsing ─────────────────────────────────────────────────────────────
// Providers print tokens in varying shapes; we parse the union so the same
// logic works for Claude Code, Kimi, and Codex without per-provider branches.

interface ParsedUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
}

// Matches a numeric literal like "15", "1,234", "15.2", "15.2k", "1.5M".
const NUM = String.raw`\d[\d,]*(?:\.\d+)?[kKmMbB]?`;

// Parse a numeric token string honoring comma separators and k/M/B suffixes.
function parseTokenCount(raw: string): number | undefined {
  const m = raw.trim().replace(/,/g, '').match(/^(\d+(?:\.\d+)?)\s*([kKmMbB]?)$/);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  if (!isFinite(n)) return undefined;
  switch (m[2].toLowerCase()) {
    case 'k': return Math.round(n * 1_000);
    case 'm': return Math.round(n * 1_000_000);
    case 'b': return Math.round(n * 1_000_000_000);
    default:  return Math.round(n);
  }
}

// Extract a token count for a field given its synonyms. Tries both the
// trailing form ("123k input") and the labeled form ("input: 123k").
function extractTokenField(line: string, synonyms: string[]): number | undefined {
  const group = synonyms.join('|');
  const trailing = new RegExp(`(${NUM})\\s*(?:tokens?\\s+)?(?:${group})\\b`, 'i');
  const labeled  = new RegExp(`\\b(?:${group})\\s*(?:tokens?)?\\s*[:=]\\s*(${NUM})`, 'i');
  const m = line.match(trailing) || line.match(labeled);
  return m ? parseTokenCount(m[1]) : undefined;
}

function parseUsageLine(line: string): ParsedUsage | undefined {
  const result: ParsedUsage = {};
  let hasValue = false;

  // Cost: $0.12, $1,234.56, $0.1 USD
  const costMatch = line.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(?:USD)?/i);
  if (costMatch) {
    const cost = parseFloat(costMatch[1].replace(/,/g, ''));
    if (isFinite(cost) && cost > 0) {
      result.costUsd = cost;
      hasValue = true;
    }
  }

  const input = extractTokenField(line, ['input', 'prompt']);
  if (input !== undefined) {
    result.inputTokens = input;
    hasValue = true;
  }

  const output = extractTokenField(line, ['output', 'completion']);
  if (output !== undefined) {
    result.outputTokens = output;
    hasValue = true;
  }

  if (result.inputTokens !== undefined || result.outputTokens !== undefined) {
    result.totalTokens = (result.inputTokens || 0) + (result.outputTokens || 0);
  } else {
    // Fallback: "12,345 tokens" or "total tokens: 12.3k"
    const total =
      extractTokenField(line, ['total']) ??
      (() => {
        const m = line.match(new RegExp(`(${NUM})\\s*tokens?\\b`, 'i'));
        return m ? parseTokenCount(m[1]) : undefined;
      })();
    if (total !== undefined) {
      result.totalTokens = total;
      hasValue = true;
    }
  }

  return hasValue ? result : undefined;
}
