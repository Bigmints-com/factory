/**
 * Queue item detail API — get details, retry, update priority.
 */

import { NextResponse } from 'next/server';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';

const DB_PATH = resolve(process.cwd(), '..', 'factory.db');

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  return db;
}

/** GET — get a specific queue item */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const item = db.prepare('SELECT * FROM queue_items WHERE id = ?').get(id);
    db.close();

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    return NextResponse.json({ item });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

/** PATCH — retry a failed item or update priority */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const db = getDb();

    const item = db.prepare('SELECT * FROM queue_items WHERE id = ?').get(id) as any;
    if (!item) {
      db.close();
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Retry: reset failed/needs-attention to pending
    if (body.action === 'retry') {
      if (!['failed', 'needs-attention'].includes(item.status)) {
        db.close();
        return NextResponse.json({ error: 'Can only retry failed items' }, { status: 400 });
      }

      db.prepare(`
        UPDATE queue_items
        SET status = 'pending', error = NULL, output = '', started_at = NULL, completed_at = NULL, duration_ms = NULL
        WHERE id = ?
      `).run(id);
    }

    // Update priority
    if (body.priority !== undefined) {
      db.prepare('UPDATE queue_items SET priority = ? WHERE id = ?').run(body.priority, id);
    }

    const updated = db.prepare('SELECT * FROM queue_items WHERE id = ?').get(id);
    db.close();

    return NextResponse.json({ item: updated });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
