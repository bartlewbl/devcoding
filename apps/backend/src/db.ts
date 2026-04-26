import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const DATA_DIR = path.resolve(__dirname, '../.data');
const DB_PATH = path.join(DATA_DIR, 'sessions.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      repoUrl TEXT NOT NULL,
      repoFullName TEXT NOT NULL,
      repoPath TEXT NOT NULL,
      worktreePath TEXT NOT NULL,
      branch TEXT NOT NULL,
      model TEXT NOT NULL,
      modelName TEXT,
      effort TEXT NOT NULL,
      status TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      lastActivityAt INTEGER NOT NULL,
      stoppedAt INTEGER,
      outputBuffer TEXT NOT NULL DEFAULT '',
      messages TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS usage (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      userId TEXT NOT NULL,
      provider TEXT NOT NULL,
      modelName TEXT,
      timestamp INTEGER NOT NULL,
      inputTokens INTEGER,
      outputTokens INTEGER,
      totalTokens INTEGER,
      costUsd REAL,
      rawLine TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_usage_session ON usage(sessionId);
    CREATE INDEX IF NOT EXISTS idx_usage_user ON usage(userId);
    CREATE INDEX IF NOT EXISTS idx_usage_provider ON usage(provider);
    CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage(timestamp);
    CREATE INDEX IF NOT EXISTS idx_usage_model ON usage(modelName);
  `);

  return db;
}
