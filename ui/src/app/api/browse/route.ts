/**
 * GET /api/browse?path=/some/path — List directories at the given path
 * POST /api/browse — Create a new directory { path: string, name: string }
 */
import { NextResponse } from 'next/server';
import { resolve, join, basename, dirname } from 'node:path';
import { existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    let browsePath = url.searchParams.get('path') || homedir();

    // Resolve ~ to home directory
    if (browsePath.startsWith('~')) {
      browsePath = join(homedir(), browsePath.slice(1));
    }

    const absPath = resolve(browsePath);

    if (!existsSync(absPath)) {
      return NextResponse.json(
        { error: `Path does not exist: ${absPath}` },
        { status: 404 }
      );
    }

    const stat = statSync(absPath);
    if (!stat.isDirectory()) {
      return NextResponse.json(
        { error: 'Not a directory' },
        { status: 400 }
      );
    }

    // List only directories (not files), skip hidden and system dirs
    const SKIP = new Set(['node_modules', '.Trash', 'Library', '.cache', '.npm', '.nvm']);
    const entries = readdirSync(absPath, { withFileTypes: true })
      .filter(e => e.isDirectory() && !SKIP.has(e.name))
      .sort((a, b) => {
        // Hidden dirs last
        const aHidden = a.name.startsWith('.');
        const bHidden = b.name.startsWith('.');
        if (aHidden !== bHidden) return aHidden ? 1 : -1;
        return a.name.localeCompare(b.name);
      })
      .map(e => ({
        name: e.name,
        path: join(absPath, e.name),
        hasFactory: existsSync(join(absPath, e.name, '.factory')),
        hasGit: existsSync(join(absPath, e.name, '.git')),
        hidden: e.name.startsWith('.'),
      }));

    return NextResponse.json({
      path: absPath,
      name: basename(absPath),
      parent: dirname(absPath) !== absPath ? dirname(absPath) : null,
      entries,
      hasFactory: existsSync(join(absPath, '.factory')),
      hasGit: existsSync(join(absPath, '.git')),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to browse' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { path: parentPath, name } = await request.json();

    if (!parentPath || !name) {
      return NextResponse.json(
        { error: 'path and name are required' },
        { status: 400 }
      );
    }

    const newDir = join(resolve(parentPath), name);

    if (existsSync(newDir)) {
      return NextResponse.json(
        { error: `Directory already exists: ${newDir}` },
        { status: 409 }
      );
    }

    mkdirSync(newDir, { recursive: true });

    return NextResponse.json({
      success: true,
      path: newDir,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to create directory' },
      { status: 500 }
    );
  }
}
