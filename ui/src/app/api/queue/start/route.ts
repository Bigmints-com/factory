/**
 * Queue execution API — start processing the build queue.
 * 
 * Spawns builds as background processes so the API returns immediately.
 * Items are processed sequentially — each build updates the DB on completion.
 * The UI polls /api/queue every 3s to pick up status changes.
 */

import { NextResponse } from 'next/server';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
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

/**
 * Process queue items sequentially in the background.
 * This function runs detached from the HTTP request.
 */
function processQueueInBackground() {
  const db = getDb();

  const pending = db.prepare(`
    SELECT * FROM queue_items WHERE status = 'pending'
    ORDER BY priority DESC, added_at ASC
  `).all() as any[];

  if (pending.length === 0) {
    db.prepare(`UPDATE queue_state SET value = 'false' WHERE key = 'is_running'`).run();
    db.close();
    return;
  }

  // Process items one at a time, chaining via callbacks
  let index = 0;

  function processNext() {
    if (index >= pending.length) {
      // All done — mark queue as not running
      const finDb = getDb();
      finDb.prepare(`UPDATE queue_state SET value = 'false' WHERE key = 'is_running'`).run();
      finDb.close();
      return;
    }

    const item = pending[index];
    index++;

    const startTime = Date.now();

    // Mark item as running
    const runDb = getDb();
    runDb.prepare(`UPDATE queue_items SET status = 'running', started_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), item.id);
    runDb.close();

    // Resolve the spec path
    const resolvedPath = resolveSpecPath(item.spec_file, item.kind);

    // Build the command
    const args = item.kind === 'FeatureSpec'
      ? ['tsx', 'engine/cli.ts', 'feature', 'build', resolvedPath]
      : ['tsx', 'engine/cli.ts', 'build', resolvedPath];

    // Spawn the build process
    const child = spawn('npx', args, {
      cwd: FACTORY_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code: number | null) => {
      const durationMs = Date.now() - startTime;
      const output = stripAnsi(stdout + stderr);
      const doneDb = getDb();

      if (code === 0) {
        // Success
        doneDb.prepare(`
          UPDATE queue_items
          SET status = 'completed', output = ?, completed_at = ?, duration_ms = ?
          WHERE id = ?
        `).run(output, new Date().toISOString(), durationMs, item.id);

        logBuild(doneDb, item, 'completed', output, durationMs);
      } else {
        // Failed
        const errorMsg = stderr || `Process exited with code ${code}`;
        doneDb.prepare(`
          UPDATE queue_items
          SET status = 'failed', output = ?, error = ?, completed_at = ?, duration_ms = ?
          WHERE id = ?
        `).run(output, stripAnsi(errorMsg), new Date().toISOString(), durationMs, item.id);

        logBuild(doneDb, item, 'failed', output, durationMs);
      }

      doneDb.close();

      // Process next item
      processNext();
    });

    child.on('error', (err: Error) => {
      const durationMs = Date.now() - startTime;
      const errDb = getDb();
      errDb.prepare(`
        UPDATE queue_items
        SET status = 'failed', output = '', error = ?, completed_at = ?, duration_ms = ?
        WHERE id = ?
      `).run(err.message, new Date().toISOString(), durationMs, item.id);

      logBuild(errDb, item, 'failed', '', durationMs);
      errDb.close();

      // Continue to next item
      processNext();
    });
  }

  db.close();
  processNext();
}

/** POST — Start processing the queue (returns immediately) */
export async function POST() {
  const db = getDb();

  try {
    // Check if already running
    const state = db.prepare(`SELECT value FROM queue_state WHERE key = 'is_running'`).get() as { value: string } | undefined;
    if (state?.value === 'true') {
      db.close();
      return NextResponse.json({ error: 'Queue is already running' }, { status: 409 });
    }

    // Check for pending items
    const pendingCount = (db.prepare(`SELECT COUNT(*) as count FROM queue_items WHERE status = 'pending'`).get() as any)?.count || 0;
    if (pendingCount === 0) {
      db.close();
      return NextResponse.json({ error: 'No pending items in queue' }, { status: 400 });
    }

    // Mark as running
    db.prepare(`UPDATE queue_state SET value = 'true' WHERE key = 'is_running'`).run();
    db.prepare(`UPDATE queue_state SET value = ? WHERE key = 'last_run_at'`).run(new Date().toISOString());
    db.close();

    // Fire-and-forget: process queue in background
    processQueueInBackground();

    return NextResponse.json({
      success: true,
      message: 'Queue processing started',
      pending: pendingCount,
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

/** Log a build to the knowledge table with a structured debrief summary. */
function logBuild(
  db: Database.Database,
  item: any,
  status: string,
  rawOutput: string,
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
  const fileMatches = rawOutput.match(/✓\s+(.+)/g) || [];
  const filesGenerated = fileMatches.map((m: string) => m.replace(/^✓\s+/, '').trim());

  // Group files by directory
  const dirCounts = new Map<string, number>();
  for (const f of filesGenerated) {
    const parts = f.split('/');
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
    dirCounts.set(dir, (dirCounts.get(dir) || 0) + 1);
  }
  const dirTable = Array.from(dirCounts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dir, count]) => `| ${dir} | ${count} |`)
    .join('\n');

  const specName = item.spec_file?.split('/').pop()?.replace('.yaml', '') || item.spec_file;
  const outcome = status === 'failed'
    ? 'Build failed — check queue output for details'
    : `Successfully generated ${filesGenerated.length} file(s)`;

  const summary = `# Build Debrief: ${specName}

> ${outcome}

## What Was Built
- **Spec**: \`${item.spec_file}\`
- **Type**: ${item.kind === 'FeatureSpec' ? 'Feature' : 'App'}

## Files Generated

${filesGenerated.length} files across ${dirCounts.size} director${dirCounts.size === 1 ? 'y' : 'ies'}

| Directory | Files |
|---|---|
${dirTable || '| — | 0 |'}

## Duration

Built in ${(durationMs / 1000).toFixed(1)}s.
`;

  const oneLiner = status === 'failed'
    ? 'Build failed'
    : `Built ${filesGenerated.length} file(s) in ${(durationMs / 1000).toFixed(1)}s`;

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
    summary,
    oneLiner,
  );
}
