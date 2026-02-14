/**
 * POST /api/feature-build — Build a feature from a feature spec
 * Body: { specFile: "features/filename.yaml" }
 */
import { NextResponse } from 'next/server';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const FACTORY_ROOT = resolve(process.cwd(), '..');

const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');

/**
 * Resolve a feature spec filename to its absolute path.
 */
function resolveFeatureSpecPath(specFile: string): string | null {
  const cleanFile = specFile.replace(/^features\//, '');

  const projectsPath = join(FACTORY_ROOT, 'projects.json');
  if (existsSync(projectsPath)) {
    try {
      const config = JSON.parse(readFileSync(projectsPath, 'utf-8'));
      const activeId = config.activeProject;
      const project = config.projects?.find((p: { id: string }) => p.id === activeId);

      if (project?.path) {
        const candidates = [
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

  return null;
}

export async function POST(request: Request) {
  try {
    const { specFile, action = 'build' } = await request.json();
    if (!specFile) {
      return NextResponse.json({ error: 'specFile is required' }, { status: 400 });
    }

    const specPath = resolveFeatureSpecPath(specFile);
    if (!specPath) {
      return NextResponse.json(
        { success: false, error: `Feature spec not found: ${specFile}` },
        { status: 404 }
      );
    }

    const cmd = action === 'validate' ? 'validate' : 'build';

    const result = stripAnsi(execSync(
      `npx tsx engine/cli.ts feature ${cmd} "${specPath}" 2>&1`,
      { cwd: FACTORY_ROOT, encoding: 'utf-8', timeout: 300000 }
    ));

    const success = result.includes('COMPLETE') || result.includes('PASSED');

    return NextResponse.json({ success, output: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Feature build failed';
    const output = (err as any)?.stdout || (err as any)?.stderr || message;
    return NextResponse.json(
      { success: false, error: message, output: stripAnsi(String(output)) },
      { status: 500 }
    );
  }
}
