/**
 * Knowledge persistence for the Factory engine.
 * Logs every build for future reference and provides full-text search.
 */

import { getDb } from './db.ts';
import { timestamp } from './utils.ts';

export interface BuildEntry {
  id: string;
  specFile: string;
  kind: string;
  timestamp: string;
  durationMs: number | null;
  status: string;
  filesGenerated: string[];
  validationResult: string;
  output: string;
  notes: string;
}

interface BuildRow {
  id: string;
  spec_file: string;
  kind: string;
  timestamp: string;
  duration_ms: number | null;
  status: string;
  files_generated: string;
  validation_result: string;
  output: string;
  notes: string;
}

/** Map a DB row to a BuildEntry. */
function mapRow(row: BuildRow): BuildEntry {
  return {
    id: row.id,
    specFile: row.spec_file,
    kind: row.kind,
    timestamp: row.timestamp,
    durationMs: row.duration_ms,
    status: row.status,
    filesGenerated: JSON.parse(row.files_generated || '[]'),
    validationResult: row.validation_result || '',
    output: row.output || '',
    notes: row.notes || '',
  };
}

/** Log a build to the knowledge base. */
export function logBuild(entry: {
  specFile: string;
  kind: string;
  status: string;
  durationMs?: number;
  filesGenerated?: string[];
  validationResult?: string;
  output?: string;
  notes?: string;
}): BuildEntry {
  const db = getDb();
  const id = `build_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = timestamp();
  const filesJson = JSON.stringify(entry.filesGenerated || []);

  db.prepare(`
    INSERT INTO builds (id, spec_file, kind, timestamp, duration_ms, status, files_generated, validation_result, output, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    entry.specFile,
    entry.kind,
    now,
    entry.durationMs || null,
    entry.status,
    filesJson,
    entry.validationResult || '',
    entry.output || '',
    entry.notes || ''
  );

  // Update FTS index
  const rowid = db.prepare('SELECT rowid FROM builds WHERE id = ?').get(id) as { rowid: number };
  db.prepare(`
    INSERT INTO builds_fts (rowid, spec_file, output, notes, files_generated)
    VALUES (?, ?, ?, ?, ?)
  `).run(rowid.rowid, entry.specFile, entry.output || '', entry.notes || '', filesJson);

  return getBuild(id)!;
}

/** Get a specific build entry. */
export function getBuild(id: string): BuildEntry | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM builds WHERE id = ?').get(id) as BuildRow | undefined;
  return row ? mapRow(row) : null;
}

/** Get build history, optionally filtered by spec file. */
export function getHistory(specFile?: string, limit = 50): BuildEntry[] {
  const db = getDb();
  let rows: BuildRow[];

  if (specFile) {
    rows = db.prepare(`
      SELECT * FROM builds WHERE spec_file = ? ORDER BY timestamp DESC LIMIT ?
    `).all(specFile, limit) as BuildRow[];
  } else {
    rows = db.prepare(`
      SELECT * FROM builds ORDER BY timestamp DESC LIMIT ?
    `).all(limit) as BuildRow[];
  }

  return rows.map(mapRow);
}

/** Full-text search over the knowledge base. */
export function searchKnowledge(query: string, limit = 20): BuildEntry[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT builds.* FROM builds_fts
    JOIN builds ON builds.rowid = builds_fts.rowid
    WHERE builds_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(query, limit) as BuildRow[];

  return rows.map(mapRow);
}

/** Get knowledge stats. */
export function getKnowledgeStats(): {
  totalBuilds: number;
  successfulBuilds: number;
  failedBuilds: number;
  uniqueSpecs: number;
} {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) as count FROM builds').get() as { count: number };
  const successful = db.prepare(`SELECT COUNT(*) as count FROM builds WHERE status = 'completed'`).get() as { count: number };
  const failed = db.prepare(`SELECT COUNT(*) as count FROM builds WHERE status = 'failed'`).get() as { count: number };
  const unique = db.prepare('SELECT COUNT(DISTINCT spec_file) as count FROM builds').get() as { count: number };

  return {
    totalBuilds: total.count,
    successfulBuilds: successful.count,
    failedBuilds: failed.count,
    uniqueSpecs: unique.count,
  };
}
