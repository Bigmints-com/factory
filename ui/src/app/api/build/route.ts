/**
 * POST /api/build — Run full build pipeline for a spec
 * Body: { specFile: "filename.yaml" }
 */
import { NextResponse } from 'next/server';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const FACTORY_ROOT = resolve(process.cwd(), '..');

/**
 * Resolve a spec filename to its absolute path.
 * Searches the active project's .factory/specs/apps/ and .factory/specs/features/.
 * Falls back to the factory root specs/ for backward compat.
 */
function resolveSpecPath(specFile: string): string | null {
  // Read active project from projects.json
  const projectsPath = join(FACTORY_ROOT, 'projects.json');
  if (existsSync(projectsPath)) {
    try {
      const config = JSON.parse(readFileSync(projectsPath, 'utf-8'));
      const activeId = config.activeProject;
      const project = config.projects?.find((p: { id: string }) => p.id === activeId);

      if (project?.path) {
        // Check apps/ first, then features/, then root specs/
        const candidates = [
          join(project.path, '.factory', 'specs', 'apps', specFile),
          join(project.path, '.factory', 'specs', 'features', specFile),
          join(project.path, '.factory', 'specs', specFile),
        ];
        for (const candidate of candidates) {
          if (existsSync(candidate)) return candidate;
        }
      }
    } catch { /* fall through */ }
  }

  // Fallback: look in factory root specs/
  const fallback = join(FACTORY_ROOT, 'specs', specFile);
  if (existsSync(fallback)) return fallback;

  return null;
}

export async function POST(request: Request) {
  try {
    const { specFile } = await request.json();
    if (!specFile) {
      return NextResponse.json({ error: 'specFile is required' }, { status: 400 });
    }

    const specPath = resolveSpecPath(specFile);
    if (!specPath) {
      return NextResponse.json(
        { success: false, error: `Spec file not found: ${specFile}` },
        { status: 404 }
      );
    }

    const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');
    const result = stripAnsi(execSync(
      `npx tsx engine/cli.ts build "${specPath}" 2>&1`,
      { cwd: FACTORY_ROOT, encoding: 'utf-8', timeout: 1_200_000 } // 20 min — prioritise quality
    ));

    const success = result.includes('BUILD COMPLETE') || result.includes('All tests passed');

    return NextResponse.json({ success, output: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Build failed';
    const stdout = (err as { stdout?: string })?.stdout || '';
    const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');
    return NextResponse.json(
      { success: false, error: message, output: stripAnsi(stdout) },
      { status: 500 }
    );
  }
}
