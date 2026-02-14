/**
 * SQLite database manager for the Factory engine.
 * Single database file storing queue state, build history, and knowledge entries.
 */

import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { FACTORY_ROOT } from './utils.ts';

const DB_PATH = resolve(FACTORY_ROOT, 'factory.db');

let _db: Database.Database | null = null;

/** Get or create the SQLite database connection. */
export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    initSchema(_db);
  }
  return _db;
}

/** Initialize all tables if they don't exist. */
function initSchema(db: Database.Database): void {
  db.exec(`
    -- Queue items
    CREATE TABLE IF NOT EXISTS queue_items (
      id TEXT PRIMARY KEY,
      spec_file TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('AppSpec', 'FeatureSpec')),
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'running', 'completed', 'failed', 'needs-attention')),
      priority INTEGER NOT NULL DEFAULT 0,
      added_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      output TEXT DEFAULT '',
      error TEXT,
      duration_ms INTEGER
    );

    -- Build knowledge entries
    CREATE TABLE IF NOT EXISTS builds (
      id TEXT PRIMARY KEY,
      spec_file TEXT NOT NULL,
      kind TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      duration_ms INTEGER,
      status TEXT NOT NULL,
      files_generated TEXT DEFAULT '[]',
      validation_result TEXT,
      output TEXT DEFAULT '',
      notes TEXT DEFAULT ''
    );

    -- Full-text search index for knowledge
    CREATE VIRTUAL TABLE IF NOT EXISTS builds_fts USING fts5(
      spec_file,
      output,
      notes,
      files_generated,
      content='builds',
      content_rowid='rowid'
    );

    -- Queue execution state
    CREATE TABLE IF NOT EXISTS queue_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Ensure default state values exist
  const insert = db.prepare(
    'INSERT OR IGNORE INTO queue_state (key, value) VALUES (?, ?)'
  );
  insert.run('is_running', 'false');
  insert.run('last_run_at', '');
}

/** Close the database connection. */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
