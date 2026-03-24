import { homedir } from 'node:os';
/**
 * Queue Clear API — delete ALL queue items regardless of status
 */

import { NextResponse } from 'next/server';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import Database from 'better-sqlite3';

const DB_PATH = resolve(homedir(), '.factory', 'factory.db');

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  return db;
}

/** POST — clear entire queue */
export async function POST() {
  try {
    // Kill any running build processes
    try {
      execSync('pkill -f "engine/cli.ts build" 2>/dev/null || true', { stdio: 'ignore' });
      execSync('pkill -f "engine/cli.ts feature" 2>/dev/null || true', { stdio: 'ignore' });
    } catch {
      // pkill returns non-zero if no processes found
    }

    const db = getDb();

    const count = db.prepare(`SELECT COUNT(*) as c FROM queue_items`).get() as { c: number };
    db.prepare(`DELETE FROM queue_items`).run();
    db.prepare(`UPDATE queue_state SET value = 'false' WHERE key = 'is_running'`).run();

    db.close();

    return NextResponse.json({
      cleared: count.c,
      message: `Cleared ${count.c} item(s) from queue`,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
