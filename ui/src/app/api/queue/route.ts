/**
 * Queue API — list, enqueue, remove items
 */

import { NextResponse } from 'next/server';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

// Direct SQLite access for the UI layer
import Database from 'better-sqlite3';

const DB_PATH = resolve(process.cwd(), '..', 'factory.db');
const FACTORY_ROOT = resolve(process.cwd(), '..');

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

  // Migration: add phase + depends_on columns
  const qCols = db.prepare(`PRAGMA table_info(queue_items)`).all() as { name: string }[];
  const qColNames = new Set(qCols.map((c: { name: string }) => c.name));
  if (!qColNames.has('phase')) {
    db.exec(`ALTER TABLE queue_items ADD COLUMN phase INTEGER DEFAULT 0`);
  }
  if (!qColNames.has('depends_on')) {
    db.exec(`ALTER TABLE queue_items ADD COLUMN depends_on TEXT DEFAULT '[]'`);
  }

  return db;
}

/**
 * Resolve the active project's path from projects.json
 */
function getActiveProjectPath(): string | null {
  try {
    const projectsPath = join(FACTORY_ROOT, 'projects.json');
    if (existsSync(projectsPath)) {
      const config = JSON.parse(readFileSync(projectsPath, 'utf-8'));
      if (config.activeProject) {
        const project = config.projects?.find(
          (p: any) => p.id === config.activeProject
        );
        if (project) return project.path;
      }
    }
  } catch {}
  return null;
}

/**
 * Check if the app spec for the given target slug is already in the build queue.
 * Feature specs can only be enqueued after their parent app spec is queued.
 */
function isAppSpecQueued(targetApp: string, db: ReturnType<typeof getDb>): boolean {
  const projectPath = getActiveProjectPath();
  if (!projectPath) return false;

  const appsDir = join(projectPath, '.factory', 'specs', 'apps');
  if (!existsSync(appsDir)) return false;

  const appFiles = readdirSync(appsDir).filter(
    (f) => f.endsWith('.yaml') || f.endsWith('.yml')
  );

  for (const file of appFiles) {
    try {
      const raw = readFileSync(join(appsDir, file), 'utf-8');
      const parsed = parseYaml(raw);
      const slug = parsed.metadata?.slug || file.replace(/\.ya?ml$/, '');
      if (slug === targetApp) {
        // Check if this app spec file is already in the queue
        const queued = db.prepare(
          `SELECT id FROM queue_items WHERE spec_file = ? AND status IN ('pending', 'running', 'completed')`
        ).get(file);
        return !!queued;
      }
    } catch {}
  }

  return false;
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
    const { specFile, kind, phase, dependsOn } = await request.json();

    if (!specFile || !kind) {
      return NextResponse.json({ error: 'specFile and kind are required' }, { status: 400 });
    }

    const db = getDb();

    // For FeatureSpecs, validate that the target app is already in the queue
    if (kind === 'FeatureSpec') {
      const projectPath = getActiveProjectPath();
      if (projectPath) {
        try {
          const specPath = join(projectPath, '.factory', 'specs', specFile);
          if (existsSync(specPath)) {
            const raw = readFileSync(specPath, 'utf-8');
            const parsed = parseYaml(raw);
            const targetApp = parsed.target?.app;
            if (targetApp && !isAppSpecQueued(targetApp, db)) {
              db.close();
              return NextResponse.json(
                { error: `App "${targetApp}" must be in the queue first. Queue the app spec before adding features.` },
                { status: 400 }
              );
            }

            // Validate all dependsOn specs are already in the queue
            const specDeps: string[] = parsed.dependsOn ?? dependsOn ?? [];
            if (specDeps.length > 0) {
              const featuresDir = join(projectPath, '.factory', 'specs', 'features');
              const featureFiles = existsSync(featuresDir)
                ? readdirSync(featuresDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
                : [];

              // Build a slug → filename map
              const slugToFile: Record<string, string> = {};
              for (const f of featureFiles) {
                try {
                  const fRaw = readFileSync(join(featuresDir, f), 'utf-8');
                  const fParsed = parseYaml(fRaw);
                  const fSlug = fParsed.feature?.slug || f.replace(/\.ya?ml$/, '');
                  slugToFile[fSlug] = `features/${f}`;
                } catch {}
              }

              const missingDeps: string[] = [];
              for (const dep of specDeps) {
                const depFile = slugToFile[dep];
                if (depFile) {
                  const depQueued = db.prepare(
                    `SELECT id FROM queue_items WHERE spec_file = ? AND status IN ('pending', 'running', 'completed')`
                  ).get(depFile);
                  if (!depQueued) missingDeps.push(dep);
                }
              }

              if (missingDeps.length > 0) {
                db.close();
                return NextResponse.json(
                  { error: `Missing dependencies in queue: ${missingDeps.join(', ')}. Use Build All to queue in correct order.` },
                  { status: 400 }
                );
              }
            }
          }
        } catch {}
      }
    }

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
    const phaseVal = phase ?? 0;
    const dependsOnVal = JSON.stringify(dependsOn ?? []);

    db.prepare(`
      INSERT INTO queue_items (id, spec_file, kind, status, priority, phase, depends_on, added_at)
      VALUES (?, ?, ?, 'pending', 0, ?, ?, ?)
    `).run(id, specFile, kind, phaseVal, dependsOnVal, now);

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
