/**
 * Queue Stop API — stop all running builds and delete pending items
 */

import { NextResponse } from 'next/server';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import Database from 'better-sqlite3';

const DB_PATH = resolve(process.cwd(), '..', 'factory.db');

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  return db;
}

/** POST — stop queue, kill builds, delete pending */
export async function POST() {
  try {
    // 1. Kill any running build processes
    try {
      execSync('pkill -f "engine/cli.ts build" 2>/dev/null || true', { stdio: 'ignore' });
      execSync('pkill -f "engine/cli.ts feature" 2>/dev/null || true', { stdio: 'ignore' });
    } catch {
      // pkill returns non-zero if no processes found — that's fine
    }

    const db = getDb();

    // 2. Mark any running items as failed
    const runningItems = db.prepare(
      `SELECT id FROM queue_items WHERE status = 'running'`
    ).all() as { id: string }[];

    if (runningItems.length > 0) {
      db.prepare(`
        UPDATE queue_items
        SET status = 'failed', error = 'Stopped by user', completed_at = ?
        WHERE status = 'running'
      `).run(new Date().toISOString());
    }

    // 3. Reset queue running state (pending items are preserved)
    db.prepare(`UPDATE queue_state SET value = 'false' WHERE key = 'is_running'`).run();

    db.close();

    return NextResponse.json({
      stopped: runningItems.length,
      message: `Stopped ${runningItems.length} running build(s). Pending items preserved.`,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
