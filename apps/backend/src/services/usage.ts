import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { UsageRecord, UsageStats, UsageFilter, ProviderStats, ModelStats, DailyUsage } from '../types/usage';

const DATA_DIR = path.resolve(__dirname, '../../.data');
const OLD_USAGE_FILE = path.join(DATA_DIR, 'usage.json');

let migrated = false;

function migrateUsageFromJson(): void {
  if (migrated) return;
  migrated = true;
  if (!fs.existsSync(OLD_USAGE_FILE)) return;
  try {
    const raw = fs.readFileSync(OLD_USAGE_FILE, 'utf-8');
    const data = JSON.parse(raw) as UsageRecord[];
    if (!Array.isArray(data) || data.length === 0) {
      fs.renameSync(OLD_USAGE_FILE, `${OLD_USAGE_FILE}.migrated`);
      return;
    }
    const insert = getDb().prepare(`
      INSERT OR IGNORE INTO usage
      (id, sessionId, userId, provider, modelName, timestamp, inputTokens, outputTokens, totalTokens, costUsd, rawLine)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const migrate = getDb().transaction((rows: UsageRecord[]) => {
      for (const r of rows) {
        insert.run(
          r.id,
          r.sessionId,
          r.userId,
          r.provider,
          r.modelName ?? null,
          r.timestamp,
          r.inputTokens ?? null,
          r.outputTokens ?? null,
          r.totalTokens ?? null,
          r.costUsd ?? null,
          r.rawLine
        );
      }
    });
    migrate(data);
    fs.renameSync(OLD_USAGE_FILE, `${OLD_USAGE_FILE}.migrated`);
    console.log(`[usage] migrated ${data.length} usage record(s) from JSON to SQLite`);
  } catch (err) {
    console.error('[usage] JSON migration failed:', err);
  }
}

function buildFilterWhere(filter?: UsageFilter): { where: string; params: any[] } {
  const conditions: string[] = [];
  const params: any[] = [];

  if (filter?.userId) {
    conditions.push('userId = ?');
    params.push(filter.userId);
  }
  if (filter?.sessionId) {
    conditions.push('sessionId = ?');
    params.push(filter.sessionId);
  }
  if (filter?.provider) {
    conditions.push('provider = ?');
    params.push(filter.provider);
  }
  if (filter?.modelName) {
    conditions.push('modelName = ?');
    params.push(filter.modelName);
  }
  if (filter?.startTime !== undefined) {
    conditions.push('timestamp >= ?');
    params.push(filter.startTime);
  }
  if (filter?.endTime !== undefined) {
    conditions.push('timestamp <= ?');
    params.push(filter.endTime);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { where, params };
}

export function recordUsage(
  sessionId: string,
  userId: string,
  provider: 'claude' | 'kimi' | 'codex',
  modelName: string | undefined,
  rawLine: string
): UsageRecord | undefined {
  migrateUsageFromJson();

  const parsed = parseUsageLine(rawLine);
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

  getDb().prepare(`
    INSERT INTO usage
    (id, sessionId, userId, provider, modelName, timestamp, inputTokens, outputTokens, totalTokens, costUsd, rawLine)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.sessionId,
    record.userId,
    record.provider,
    record.modelName ?? null,
    record.timestamp,
    record.inputTokens ?? null,
    record.outputTokens ?? null,
    record.totalTokens ?? null,
    record.costUsd ?? null,
    record.rawLine
  );

  // Prune: keep last 40,000 when exceeding 50,000
  const countRow = getDb().prepare('SELECT COUNT(*) as count FROM usage').get() as { count: number };
  if (countRow.count > 50_000) {
    const threshold = getDb().prepare(
      'SELECT timestamp FROM usage ORDER BY timestamp DESC LIMIT 1 OFFSET 40000'
    ).get() as { timestamp: number } | undefined;
    if (threshold) {
      getDb().prepare('DELETE FROM usage WHERE timestamp < ?').run(threshold.timestamp);
    }
  }

  return record;
}

export function getUsage(filter?: UsageFilter): UsageRecord[] {
  migrateUsageFromJson();
  const { where, params } = buildFilterWhere(filter);
  const sql = `SELECT * FROM usage ${where} ORDER BY timestamp DESC`;
  const rows = getDb().prepare(sql).all(...params) as any[];

  return rows.map((r) => ({
    id: r.id,
    sessionId: r.sessionId,
    userId: r.userId,
    provider: r.provider,
    modelName: r.modelName ?? undefined,
    timestamp: r.timestamp,
    inputTokens: r.inputTokens ?? undefined,
    outputTokens: r.outputTokens ?? undefined,
    totalTokens: r.totalTokens ?? undefined,
    costUsd: r.costUsd ?? undefined,
    rawLine: r.rawLine,
  }));
}

export function getUsageStats(filter?: UsageFilter): UsageStats {
  const { where, params } = buildFilterWhere(filter);

  const totalRow = getDb().prepare(`
    SELECT COUNT(*) as totalRecords,
           COALESCE(SUM(inputTokens), 0) as totalInputTokens,
           COALESCE(SUM(outputTokens), 0) as totalOutputTokens,
           COALESCE(SUM(totalTokens), 0) as totalTokens,
           COALESCE(SUM(costUsd), 0) as totalCostUsd
    FROM usage ${where}
  `).get(...params) as any;

  const providerRows = getDb().prepare(`
    SELECT provider,
           COUNT(*) as records,
           COALESCE(SUM(inputTokens), 0) as inputTokens,
           COALESCE(SUM(outputTokens), 0) as outputTokens,
           COALESCE(SUM(totalTokens), 0) as totalTokens,
           COALESCE(SUM(costUsd), 0) as costUsd
    FROM usage ${where}
    GROUP BY provider
  `).all(...params) as any[];

  const modelRows = getDb().prepare(`
    SELECT COALESCE(modelName, provider || '-default') as model,
           provider,
           COUNT(*) as records,
           COALESCE(SUM(inputTokens), 0) as inputTokens,
           COALESCE(SUM(outputTokens), 0) as outputTokens,
           COALESCE(SUM(totalTokens), 0) as totalTokens,
           COALESCE(SUM(costUsd), 0) as costUsd
    FROM usage ${where}
    GROUP BY COALESCE(modelName, provider || '-default'), provider
  `).all(...params) as any[];

  const byProvider: Record<string, ProviderStats> = {};
  for (const r of providerRows) {
    byProvider[r.provider] = {
      provider: r.provider,
      records: r.records,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      totalTokens: r.totalTokens,
      costUsd: r.costUsd,
    };
  }

  const byModel: Record<string, ModelStats> = {};
  for (const r of modelRows) {
    byModel[r.model] = {
      model: r.model,
      provider: r.provider,
      records: r.records,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      totalTokens: r.totalTokens,
      costUsd: r.costUsd,
    };
  }

  return {
    totalRecords: totalRow.totalRecords,
    totalInputTokens: totalRow.totalInputTokens,
    totalOutputTokens: totalRow.totalOutputTokens,
    totalTokens: totalRow.totalTokens,
    totalCostUsd: totalRow.totalCostUsd,
    byProvider,
    byModel,
  };
}

export function getDailyUsage(filter?: UsageFilter): DailyUsage[] {
  migrateUsageFromJson();
  const { where, params } = buildFilterWhere(filter);

  const sql = `
    SELECT date(timestamp/1000, 'unixepoch') as day,
           COUNT(*) as records,
           COALESCE(SUM(inputTokens), 0) as inputTokens,
           COALESCE(SUM(outputTokens), 0) as outputTokens,
           COALESCE(SUM(totalTokens), 0) as totalTokens,
           COALESCE(SUM(costUsd), 0) as costUsd
    FROM usage ${where}
    GROUP BY day
    ORDER BY day ASC
  `;

  const rows = getDb().prepare(sql).all(...params) as any[];
  return rows.map((r) => ({
    day: r.day,
    records: r.records,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    totalTokens: r.totalTokens,
    costUsd: r.costUsd,
  }));
}

export function deleteUsageForSession(sessionId: string): number {
  migrateUsageFromJson();
  const result = getDb().prepare('DELETE FROM usage WHERE sessionId = ?').run(sessionId);
  return result.changes;
}

export function clearAllUsage(): void {
  migrateUsageFromJson();
  getDb().prepare('DELETE FROM usage').run();
}

// ── Usage parsing ─────────────────────────────────────────────────────────────

interface ParsedUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
}

const NUM = String.raw`\d[\d,]*(?:\.\d+)?[kKmMbB]?`;

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
