/**
 * GET /api/reports — List all build reports with content
 */
import { NextResponse } from 'next/server';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const FACTORY_ROOT = resolve(process.cwd(), '..');
const REPORTS_DIR = resolve(FACTORY_ROOT, 'reports');

export async function GET() {
  try {
    const files = readdirSync(REPORTS_DIR)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .reverse(); // newest first

    const reports = files.map((file) => {
      const filePath = join(REPORTS_DIR, file);
      const content = readFileSync(filePath, 'utf-8');
      const stat = statSync(filePath);

      // Extract slug and timestamp from filename pattern: slug-timestamp.md
      const match = file.match(/^(.+)-(\d+)\.md$/);
      const slug = match?.[1] || file.replace('.md', '');
      const timestamp = match?.[2] ? new Date(Number(match[2])).toISOString() : stat.mtime.toISOString();

      return { file, slug, timestamp, content, size: stat.size };
    });

    return NextResponse.json({ reports });
  } catch {
    return NextResponse.json({ reports: [], error: 'reports/ directory not found' });
  }
}
