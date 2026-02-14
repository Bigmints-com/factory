/**
 * Queue execution API — start processing the build queue.
 * Processes items sequentially, skipping failures and continuing to next.
 * Resolves spec paths from the active project.
 */

import { NextResponse } from 'next/server';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import Database from 'better-sqlite3';

const DB_PATH = resolve(process.cwd(), '..', 'factory.db');
const FACTORY_ROOT = resolve(process.cwd(), '..');

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  return db;
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Resolve a spec filename to its absolute path by checking the active project.
 */
function resolveSpecPath(specFile: string, kind: string): string {
  // If already absolute, use as-is
  if (specFile.startsWith('/') && existsSync(specFile)) return specFile;

  const projectsPath = join(FACTORY_ROOT, 'projects.json');
  if (existsSync(projectsPath)) {
    try {
      const config = JSON.parse(readFileSync(projectsPath, 'utf-8'));
      const activeId = config.activeProject;
      const project = config.projects?.find((p: { id: string }) => p.id === activeId);

      if (project?.path) {
        const cleanFile = specFile.replace(/^(apps|features)\//, '');
        const candidates = kind === 'FeatureSpec'
          ? [
              join(project.path, '.factory', 'specs', 'features', cleanFile),
              join(project.path, '.factory', 'specs', specFile),
            ]
          : [
              join(project.path, '.factory', 'specs', 'apps', cleanFile),
              join(project.path, '.factory', 'specs', 'features', cleanFile),
              join(project.path, '.factory', 'specs', specFile),
            ];

        for (const candidate of candidates) {
          if (existsSync(candidate)) return candidate;
        }
      }
    } catch { /* fall through */ }
  }

  // Fallback: factory root
  const fallback = join(FACTORY_ROOT, 'specs', specFile);
  if (existsSync(fallback)) return fallback;

  return specFile; // Return as-is, let CLI report the error
}

/** POST — Start processing the queue */
export async function POST() {
  const db = getDb();

  try {
    // Check if already running
    const state = db.prepare(`SELECT value FROM queue_state WHERE key = 'is_running'`).get() as { value: string } | undefined;
    if (state?.value === 'true') {
      db.close();
      return NextResponse.json({ error: 'Queue is already running' }, { status: 409 });
    }

    // Mark as running
    db.prepare(`UPDATE queue_state SET value = 'true' WHERE key = 'is_running'`).run();
    db.prepare(`UPDATE queue_state SET value = ? WHERE key = 'last_run_at'`).run(new Date().toISOString());

    // Process all pending items
    const results: {
      id: string;
      specFile: string;
      status: string;
      output: string;
      error: string | null;
      durationMs: number;
    }[] = [];

    const pending = db.prepare(`
      SELECT * FROM queue_items WHERE status = 'pending'
      ORDER BY priority DESC, added_at ASC
    `).all() as any[];

    for (const item of pending) {
      const startTime = Date.now();

      // Mark item as running
      db.prepare(`UPDATE queue_items SET status = 'running', started_at = ? WHERE id = ?`)
        .run(new Date().toISOString(), item.id);

      try {
        // Resolve the spec path from the active project
        const resolvedPath = resolveSpecPath(item.spec_file, item.kind);

        // Determine command based on kind
        let cmd: string;
        if (item.kind === 'FeatureSpec') {
          cmd = `npx tsx engine/cli.ts feature build "${resolvedPath}" 2>&1`;
        } else {
          cmd = `npx tsx engine/cli.ts build "${resolvedPath}" 2>&1`;
        }

        const output = stripAnsi(execSync(cmd, {
          cwd: FACTORY_ROOT,
          timeout: 300_000, // 5 minute timeout for LLM builds
          encoding: 'utf-8',
        }));

        const durationMs = Date.now() - startTime;

        // Mark as completed
        db.prepare(`
          UPDATE queue_items
          SET status = 'completed', output = ?, completed_at = ?, duration_ms = ?
          WHERE id = ?
        `).run(output, new Date().toISOString(), durationMs, item.id);

        // Log to knowledge base
        logBuild(db, item, 'completed', output, durationMs);

        results.push({
          id: item.id,
          specFile: item.spec_file,
          status: 'completed',
          output,
          error: null,
          durationMs,
        });
      } catch (err: any) {
        const durationMs = Date.now() - startTime;
        const errorOutput = stripAnsi(err.stdout || err.message || String(err));

        // Mark as failed — but CONTINUE to next item
        db.prepare(`
          UPDATE queue_items
          SET status = 'failed', output = ?, error = ?, completed_at = ?, duration_ms = ?
          WHERE id = ?
        `).run(errorOutput, err.message || String(err), new Date().toISOString(), durationMs, item.id);

        // Log failure to knowledge base
        logBuild(db, item, 'failed', errorOutput, durationMs);

        results.push({
          id: item.id,
          specFile: item.spec_file,
          status: 'failed',
          output: errorOutput,
          error: err.message || String(err),
          durationMs,
        });
      }
    }

    // Mark queue as no longer running
    db.prepare(`UPDATE queue_state SET value = 'false' WHERE key = 'is_running'`).run();
    db.close();

    const completed = results.filter(r => r.status === 'completed').length;
    const failed = results.filter(r => r.status === 'failed').length;

    return NextResponse.json({
      success: true,
      processed: results.length,
      completed,
      failed,
      results,
    });
  } catch (error) {
    // Ensure we reset running state on crash
    try {
      db.prepare(`UPDATE queue_state SET value = 'false' WHERE key = 'is_running'`).run();
      db.close();
    } catch { /* ignore */ }

    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

/** Log a build to the knowledge table. */
function logBuild(
  db: Database.Database,
  item: any,
  status: string,
  output: string,
  durationMs: number,
) {
  // Ensure builds table exists
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

  const id = `build_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Extract generated files from output
  const fileMatches = output.match(/✓\s+(.+)/g) || [];
  const filesGenerated = fileMatches.map((m: string) => m.replace(/^✓\s+/, '').trim());

  db.prepare(`
    INSERT INTO builds (id, spec_file, kind, timestamp, duration_ms, status, files_generated, output, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    item.spec_file,
    item.kind,
    new Date().toISOString(),
    durationMs,
    status,
    JSON.stringify(filesGenerated),
    output,
    status === 'failed' ? 'Build failed — check output for errors' : `Build completed successfully (${filesGenerated.length} files)`
  );
}
