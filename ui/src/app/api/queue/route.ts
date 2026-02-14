/**
 * Queue API — list, enqueue, remove items
 */

import { NextResponse } from 'next/server';
import { resolve } from 'node:path';

// Direct SQLite access for the UI layer
import Database from 'better-sqlite3';

const DB_PATH = resolve(process.cwd(), '..', 'factory.db');

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Ensure tables exist
  db.exec(`
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

    CREATE TABLE IF NOT EXISTS queue_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const insert = db.prepare('INSERT OR IGNORE INTO queue_state (key, value) VALUES (?, ?)');
  insert.run('is_running', 'false');
  insert.run('last_run_at', '');

  return db;
}

/** GET — list all queue items + stats */
export async function GET() {
  try {
    const db = getDb();

    const items = db.prepare(`
      SELECT * FROM queue_items
      ORDER BY
        CASE status
          WHEN 'running' THEN 0
          WHEN 'pending' THEN 1
          WHEN 'needs-attention' THEN 2
          WHEN 'failed' THEN 3
          WHEN 'completed' THEN 4
        END,
        priority DESC,
        added_at ASC
    `).all();

    const stats = db.prepare(`
      SELECT status, COUNT(*) as count FROM queue_items GROUP BY status
    `).all() as { status: string; count: number }[];

    const statsObj: Record<string, number> = {
      pending: 0, running: 0, completed: 0, failed: 0, 'needs-attention': 0, total: 0,
    };
    for (const row of stats) {
      statsObj[row.status] = row.count;
      statsObj.total += row.count;
    }

    const isRunning = db.prepare(`SELECT value FROM queue_state WHERE key = 'is_running'`).get() as { value: string } | undefined;

    db.close();

    return NextResponse.json({
      items,
      stats: statsObj,
      isRunning: isRunning?.value === 'true',
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

/** POST — enqueue a new spec */
export async function POST(request: Request) {
  try {
    const { specFile, kind } = await request.json();

    if (!specFile || !kind) {
      return NextResponse.json({ error: 'specFile and kind are required' }, { status: 400 });
    }

    const db = getDb();

    // Check if already in queue
    const existing = db.prepare(
      `SELECT id FROM queue_items WHERE spec_file = ? AND status IN ('pending', 'running')`
    ).get(specFile);

    if (existing) {
      db.close();
      return NextResponse.json({ error: 'Spec is already in the queue' }, { status: 409 });
    }

    const id = `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO queue_items (id, spec_file, kind, status, priority, added_at)
      VALUES (?, ?, ?, 'pending', 0, ?)
    `).run(id, specFile, kind, now);

    const item = db.prepare('SELECT * FROM queue_items WHERE id = ?').get(id);
    db.close();

    return NextResponse.json({ item });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

/** DELETE — remove a queue item */
export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const db = getDb();
    const result = db.prepare('DELETE FROM queue_items WHERE id = ?').run(id);
    db.close();

    return NextResponse.json({ removed: result.changes > 0 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
