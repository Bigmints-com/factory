/**
 * PATCH  /api/projects/:id — Set as active project
 * DELETE /api/projects/:id — Remove a project
 */
import { NextResponse } from 'next/server';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const FACTORY_ROOT = resolve(process.cwd(), '..');
const PROJECTS_FILE = join(FACTORY_ROOT, 'projects.json');

function loadProjectsConfig() {
  if (!existsSync(PROJECTS_FILE)) {
    return { activeProject: null, projects: [] };
  }
  return JSON.parse(readFileSync(PROJECTS_FILE, 'utf-8'));
}

function stripAnsi(str: string) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Switch active project via CLI
    const output = stripAnsi(execSync(
      `npx tsx engine/cli.ts project switch "${id}" 2>&1`,
      { cwd: FACTORY_ROOT, encoding: 'utf-8', timeout: 30000 }
    ));

    // Re-read to get the project data
    const config = loadProjectsConfig();
    const project = config.projects.find((p: any) => p.id === id);

    if (project) {
      // Re-sync reference for the new active project
      try {
        execSync(
          `npx tsx engine/cli.ts sync "${project.path}" 2>&1`,
          { cwd: FACTORY_ROOT, encoding: 'utf-8', timeout: 30000 }
        );
      } catch {
        // Sync failure shouldn't block switching
      }
    }

    return NextResponse.json({ success: true, project, output });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to switch project' },
      { status: err.message?.includes('not found') ? 404 : 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const output = stripAnsi(execSync(
      `npx tsx engine/cli.ts project remove "${id}" 2>&1`,
      { cwd: FACTORY_ROOT, encoding: 'utf-8', timeout: 30000 }
    ));

    return NextResponse.json({ success: true, output });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to remove project' },
      { status: err.message?.includes('not found') ? 404 : 500 }
    );
  }
}
