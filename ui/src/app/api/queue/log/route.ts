/**
 * Live log streaming API — returns build output from a given byte offset.
 * 
 * GET /api/queue/log?offset=N
 * Returns { log: string, offset: number, done: boolean }
 */

import { NextResponse } from 'next/server';
import { resolve } from 'node:path';
import { existsSync, readFileSync, statSync } from 'node:fs';
import Database from 'better-sqlite3';

const DB_PATH = resolve(process.cwd(), '..', 'factory.db');
const LOG_FILE = resolve(process.cwd(), '..', 'factory-build.log');

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Check if log file exists
    if (!existsSync(LOG_FILE)) {
        return NextResponse.json({ log: '', offset: 0, done: true });
    }

    try {
        const stat = statSync(LOG_FILE);
        const fileSize = stat.size;

        // Read new content from offset
        let log = '';
        if (offset < fileSize) {
            const buf = Buffer.alloc(fileSize - offset);
            const fd = require('node:fs').openSync(LOG_FILE, 'r');
            require('node:fs').readSync(fd, buf, 0, buf.length, offset);
            require('node:fs').closeSync(fd);
            log = buf.toString('utf-8');
        }

        // Strip ANSI codes for clean display
        const cleanLog = log.replace(/\x1b\[[0-9;]*m/g, '');

        // Check if queue is still running
        let done = true;
        try {
            const db = new Database(DB_PATH);
            db.pragma('journal_mode = WAL');
            const state = db.prepare(
                `SELECT value FROM queue_state WHERE key = 'is_running'`
            ).get() as { value: string } | undefined;
            const running = db.prepare(
                `SELECT COUNT(*) as c FROM queue_items WHERE status = 'running'`
            ).get() as { c: number };
            done = state?.value !== 'true' && running.c === 0;
            db.close();
        } catch { /* if DB errors, assume done */ }

        return NextResponse.json({
            log: cleanLog,
            offset: fileSize,
            done,
        });
    } catch {
        return NextResponse.json({ log: '', offset: 0, done: true });
    }
}
