/**
 * POST /api/validate — Validate a spec file
 * Body: { specFile: "filename.yaml", quick?: boolean }
 *
 * Resolves spec path from the active project's .factory/specs/apps/ directory,
 * falling back to the factory's own specs/ directory.
 *
 * When `quick` is true, only parses YAML and checks basic structure (fast).
 * When `quick` is false/omitted, runs the full CLI validation (slow).
 */
import { NextResponse } from 'next/server';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

const FACTORY_ROOT = resolve(process.cwd(), '..');

/**
 * Resolve a spec filename to its absolute path.
 */
function resolveSpecFile(specFile: string): string {
  // 1. Try active project's .factory/specs/apps/
  try {
    const projectsPath = join(FACTORY_ROOT, 'projects.json');
    if (existsSync(projectsPath)) {
      const config = JSON.parse(readFileSync(projectsPath, 'utf-8'));
      if (config.activeProject) {
        const project = config.projects?.find(
          (p: any) => p.id === config.activeProject
        );
        if (project) {
          const isFeature = specFile.startsWith('features/');
          const subdir = isFeature ? 'features' : 'apps';
          const cleanFile = isFeature ? specFile.replace(/^features\//, '') : specFile;
          const projectPath = join(project.path, '.factory', 'specs', subdir, cleanFile);
          if (existsSync(projectPath)) return projectPath;
        }
      }
    }
  } catch {}

  // 2. Fallback: factory's own specs/
  const factoryPath = join(FACTORY_ROOT, 'specs', specFile);
  if (existsSync(factoryPath)) return factoryPath;

  const factoryAppsPath = join(FACTORY_ROOT, 'specs', 'apps', specFile);
  if (existsSync(factoryAppsPath)) return factoryAppsPath;

  if (specFile.startsWith('/') && existsSync(specFile)) return specFile;

  throw new Error(`Spec file not found: ${specFile}`);
}

/**
 * Quick validation — parse YAML + basic structure checks.
 * Returns immediately, no subprocess needed.
 */
function quickValidate(specPath: string, specFile: string): { passed: boolean; checks: { passed: boolean; name: string; message: string }[] } {
  const checks: { passed: boolean; name: string; message: string }[] = [];

  // 1. File exists
  if (!existsSync(specPath)) {
    checks.push({ passed: false, name: 'File exists', message: `File not found: ${specFile}` });
    return { passed: false, checks };
  }
  checks.push({ passed: true, name: 'File exists', message: '' });

  // 2. YAML parse
  let parsed: any;
  try {
    const raw = readFileSync(specPath, 'utf-8');
    parsed = parseYaml(raw);
  } catch (err) {
    checks.push({ passed: false, name: 'YAML parse', message: err instanceof Error ? err.message : 'YAML parse error' });
    return { passed: false, checks };
  }
  checks.push({ passed: true, name: 'YAML parse', message: '' });

  // 3. Basic structure
  const isFeature = specFile.startsWith('features/') || !!parsed.feature;
  if (isFeature) {
    if (!parsed.feature?.name) {
      checks.push({ passed: false, name: 'Feature name', message: 'Missing feature.name' });
    } else {
      checks.push({ passed: true, name: 'Feature name', message: parsed.feature.name });
    }
    if (!parsed.target?.app) {
      checks.push({ passed: false, name: 'Target app', message: 'Missing target.app' });
    } else {
      checks.push({ passed: true, name: 'Target app', message: parsed.target.app });
    }
  } else {
    if (!parsed.metadata?.name) {
      checks.push({ passed: false, name: 'App name', message: 'Missing metadata.name' });
    } else {
      checks.push({ passed: true, name: 'App name', message: parsed.metadata.name });
    }
  }

  return { passed: checks.every(c => c.passed), checks };
}

export async function POST(request: Request) {
  try {
    const { specFile, quick } = await request.json();
    if (!specFile) {
      return NextResponse.json({ error: 'specFile is required' }, { status: 400 });
    }

    const specPath = resolveSpecFile(specFile);

    // Quick mode: fast YAML parse only
    if (quick) {
      const result = quickValidate(specPath, specFile);
      return NextResponse.json(result);
    }

    // Full mode: run CLI validation
    const result = execSync(
      `npx tsx engine/cli.ts validate "${specPath}" 2>&1`,
      { cwd: FACTORY_ROOT, encoding: 'utf-8', timeout: 30000 }
    );

    // Strip ANSI escape codes
    const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');
    const cleanResult = stripAnsi(result);

    // Parse the output lines into structured checks
    const checks = cleanResult
      .split('\n')
      .filter((line) => line.includes('✓') || line.includes('✗'))
      .map((line) => {
        const passed = line.includes('✓');
        const cleaned = line.replace(/[✓✗●→!]\s*/g, '').trim();
        const [name, ...rest] = cleaned.split(':');
        return {
          passed,
          name: name?.trim() || cleaned,
          message: rest.join(':').trim() || '',
        };
      });

    const allPassed = checks.every((c) => c.passed);

    return NextResponse.json({ passed: allPassed, checks, raw: cleanResult });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Validation failed';
    return NextResponse.json({ passed: false, error: message }, { status: 500 });
  }
}

