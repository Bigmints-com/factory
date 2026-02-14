/**
 * Knowledge API — retrieve build history and search.
 */

import { NextResponse } from 'next/server';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';

const DB_PATH = resolve(process.cwd(), '..', 'factory.db');

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Ensure tables exist
  db.exec(`
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
  `);

  return db;
}

/** GET — retrieve build history */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const specFile = url.searchParams.get('specFile');
    const query = url.searchParams.get('q');
    const limit = parseInt(url.searchParams.get('limit') || '50');

    const db = getDb();

    let rows: any[];

    if (query) {
      // Full-text search if FTS table exists
      try {
        rows = db.prepare(`
          SELECT builds.* FROM builds_fts
          JOIN builds ON builds.rowid = builds_fts.rowid
          WHERE builds_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        `).all(query, limit);
      } catch {
        // FTS table might not exist yet — fallback to LIKE search
        rows = db.prepare(`
          SELECT * FROM builds
          WHERE spec_file LIKE ? OR output LIKE ? OR notes LIKE ?
          ORDER BY timestamp DESC
          LIMIT ?
        `).all(`%${query}%`, `%${query}%`, `%${query}%`, limit);
      }
    } else if (specFile) {
      rows = db.prepare(`
        SELECT * FROM builds WHERE spec_file = ? ORDER BY timestamp DESC LIMIT ?
      `).all(specFile, limit);
    } else {
      rows = db.prepare(`
        SELECT * FROM builds ORDER BY timestamp DESC LIMIT ?
      `).all(limit);
    }

    // Stats
    const total = db.prepare('SELECT COUNT(*) as count FROM builds').get() as { count: number };
    const successful = db.prepare(`SELECT COUNT(*) as count FROM builds WHERE status = 'completed'`).get() as { count: number };
    const failed = db.prepare(`SELECT COUNT(*) as count FROM builds WHERE status = 'failed'`).get() as { count: number };
    const unique = db.prepare('SELECT COUNT(DISTINCT spec_file) as count FROM builds').get() as { count: number };

    db.close();

    // Parse files_generated JSON
    const entries = rows.map((row: any) => ({
      ...row,
      filesGenerated: JSON.parse(row.files_generated || '[]'),
    }));

    return NextResponse.json({
      entries,
      stats: {
        totalBuilds: total.count,
        successfulBuilds: successful.count,
        failedBuilds: failed.count,
        uniqueSpecs: unique.count,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
