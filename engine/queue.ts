/**
 * Queue manager — enqueue, dequeue, update, list build items.
 * The factory processes specs from this queue while you sleep.
 */

import { getDb } from './db.ts';

// ─── Types ───────────────────────────────────────────────

export interface QueueItem {
    id: string;
    specFile: string;
    kind: 'AppSpec' | 'FeatureSpec';
    status: 'pending' | 'running' | 'completed' | 'failed' | 'needs-attention';
    priority: number;
    addedAt: string;
    startedAt: string | null;
    completedAt: string | null;
    output: string;
    error: string | null;
    durationMs: number | null;
}

interface QueueRow {
    id: string;
    spec_file: string;
    kind: string;
    status: string;
    priority: number;
    added_at: string;
    started_at: string | null;
    completed_at: string | null;
    output: string;
    error: string | null;
    duration_ms: number | null;
}

// ─── Helpers ─────────────────────────────────────────────

function mapRow(row: QueueRow): QueueItem {
    return {
        id: row.id,
        specFile: row.spec_file,
        kind: row.kind as QueueItem['kind'],
        status: row.status as QueueItem['status'],
        priority: row.priority,
        addedAt: row.added_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        output: row.output,
        error: row.error,
        durationMs: row.duration_ms,
    };
}

function generateId(): string {
    return `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function timestamp(): string {
    return new Date().toISOString();
}

// ─── Core Operations ─────────────────────────────────────

/** Add a spec to the build queue. */
export function enqueue(specFile: string, kind: 'AppSpec' | 'FeatureSpec'): QueueItem {
    const db = getDb();
    const id = generateId();
    const now = timestamp();

    // Check for duplicates
    const existing = db.prepare(
        `SELECT id FROM queue_items WHERE spec_file = ? AND status IN ('pending', 'running')`
    ).get(specFile) as QueueRow | undefined;

    if (existing) {
        throw new Error(`Spec "${specFile}" is already in the queue`);
    }

    db.prepare(`
        INSERT INTO queue_items (id, spec_file, kind, status, priority, added_at)
        VALUES (?, ?, ?, 'pending', 0, ?)
    `).run(id, specFile, kind, now);

    return getItem(id)!;
}

/** Get the next pending item (oldest first, highest priority). */
export function dequeue(): QueueItem | null {
    const db = getDb();
    const row = db.prepare(`
        SELECT * FROM queue_items
        WHERE status = 'pending'
        ORDER BY priority DESC, added_at ASC
        LIMIT 1
    `).get() as QueueRow | undefined;

    return row ? mapRow(row) : null;
}

/** Get a specific queue item by ID. */
export function getItem(id: string): QueueItem | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM queue_items WHERE id = ?').get(id) as QueueRow | undefined;
    return row ? mapRow(row) : null;
}

/** Get all queue items, ordered by status then added time. */
export function listQueue(): QueueItem[] {
    const db = getDb();
    const rows = db.prepare(`
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
    `).all() as QueueRow[];

    return rows.map(mapRow);
}

// ─── Status Updates ──────────────────────────────────────

/** Update a queue item's fields. */
export function updateItem(
    id: string,
    updates: Partial<Pick<QueueItem, 'status' | 'output' | 'error' | 'startedAt' | 'completedAt' | 'durationMs'>>
): QueueItem | null {
    const db = getDb();
    const sets: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.status !== undefined) { sets.push('status = ?'); values.push(updates.status); }
    if (updates.output !== undefined) { sets.push('output = ?'); values.push(updates.output); }
    if (updates.error !== undefined) { sets.push('error = ?'); values.push(updates.error); }
    if (updates.startedAt !== undefined) { sets.push('started_at = ?'); values.push(updates.startedAt); }
    if (updates.completedAt !== undefined) { sets.push('completed_at = ?'); values.push(updates.completedAt); }
    if (updates.durationMs !== undefined) { sets.push('duration_ms = ?'); values.push(updates.durationMs); }

    if (sets.length === 0) return getItem(id);

    values.push(id);
    db.prepare(`UPDATE queue_items SET ${sets.join(', ')} WHERE id = ?`).run(...values);

    return getItem(id);
}

/** Mark an item as running. */
export function markRunning(id: string): QueueItem | null {
    return updateItem(id, { status: 'running', startedAt: timestamp() });
}

/** Mark an item as completed. */
export function markCompleted(id: string, output: string, durationMs: number): QueueItem | null {
    return updateItem(id, {
        status: 'completed',
        output,
        completedAt: timestamp(),
        durationMs,
    });
}

/** Mark an item as failed. */
export function markFailed(id: string, error: string, output: string, durationMs: number): QueueItem | null {
    return updateItem(id, {
        status: 'failed',
        error,
        output,
        completedAt: timestamp(),
        durationMs,
    });
}

/** Remove a queue item. */
export function removeItem(id: string): boolean {
    const db = getDb();
    const result = db.prepare('DELETE FROM queue_items WHERE id = ?').run(id);
    return result.changes > 0;
}

/** Remove all completed items. */
export function clearCompleted(): number {
    const db = getDb();
    const result = db.prepare(`DELETE FROM queue_items WHERE status = 'completed'`).run();
    return result.changes;
}

/** Retry a failed item — reset to pending. */
export function retryItem(id: string): QueueItem | null {
    return updateItem(id, {
        status: 'pending',
        error: null,
        output: '',
        startedAt: null,
        completedAt: null,
        durationMs: null,
    });
}

// ─── Stats & State ───────────────────────────────────────

/** Get queue counts by status. */
export function getQueueStats(): Record<string, number> {
    const db = getDb();
    const rows = db.prepare(`
        SELECT status, COUNT(*) as count FROM queue_items GROUP BY status
    `).all() as { status: string; count: number }[];

    const stats: Record<string, number> = {
        pending: 0, running: 0, completed: 0, failed: 0, 'needs-attention': 0, total: 0,
    };
    for (const row of rows) {
        stats[row.status] = row.count;
        stats.total += row.count;
    }
    return stats;
}

/** Check if the queue processor is running. */
export function isQueueRunning(): boolean {
    const db = getDb();
    const row = db.prepare(`SELECT value FROM queue_state WHERE key = 'is_running'`).get() as { value: string } | undefined;
    return row?.value === 'true';
}

/** Set the queue running state. */
export function setQueueRunning(running: boolean): void {
    const db = getDb();
    db.prepare(`UPDATE queue_state SET value = ? WHERE key = 'is_running'`).run(running ? 'true' : 'false');
    if (running) {
        db.prepare(`UPDATE queue_state SET value = ? WHERE key = 'last_run_at'`).run(timestamp());
    }
}
