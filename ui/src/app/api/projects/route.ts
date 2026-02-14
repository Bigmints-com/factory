/**
 * GET  /api/projects — List all connected projects + active project
 * POST /api/projects — Add a new project (body: { path: string })
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

export async function GET() {
  try {
    const config = loadProjectsConfig();
    return NextResponse.json({
      projects: config.projects,
      activeId: config.activeProject,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const repoPath = body.path;

    if (!repoPath || typeof repoPath !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: path' },
        { status: 400 }
      );
    }

    const absPath = resolve(repoPath);
    if (!existsSync(absPath)) {
      return NextResponse.json(
        { error: `Path does not exist: ${absPath}` },
        { status: 400 }
      );
    }

    const stack = body.stack || {};
    let flags = '';
    if (stack.framework) flags += ` --framework "${stack.framework}"`;
    if (stack.packageManager) flags += ` --pm "${stack.packageManager}"`;
    if (stack.linter) flags += ` --linter "${stack.linter}"`;
    if (stack.testing) flags += ` --testing "${stack.testing}"`;

    // Run engine CLI to add project (this handles bridge init + project registration)
    const output = stripAnsi(execSync(
      `npx tsx engine/cli.ts project add "${absPath}"${flags} 2>&1`,
      { cwd: FACTORY_ROOT, encoding: 'utf-8', timeout: 30000 }
    ));

    // Now sync reference from the new project
    const syncOutput = stripAnsi(execSync(
      `npx tsx engine/cli.ts sync "${absPath}" 2>&1`,
      { cwd: FACTORY_ROOT, encoding: 'utf-8', timeout: 30000 }
    ));

    // Re-read projects.json to get the result
    const config = loadProjectsConfig();
    const project = config.projects.find((p: any) => p.path === absPath);

    // Read bridge config if available
    let bridge = null;
    const bridgePath = join(absPath, '.factory', 'factory.yaml');
    if (existsSync(bridgePath)) {
      const { parse: parseYaml } = require('yaml');
      bridge = parseYaml(readFileSync(bridgePath, 'utf-8'));
    }

    return NextResponse.json({
      success: true,
      project,
      bridge,
      output: output + '\n' + syncOutput,
    });
  } catch (err: any) {
    const stdout = (err as { stdout?: string })?.stdout || '';
    return NextResponse.json(
      { error: err.message || 'Failed to add project', output: stdout },
      { status: 500 }
    );
  }
}
