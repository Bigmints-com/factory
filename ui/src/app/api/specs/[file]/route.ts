/**
 * GET  /api/specs/[file] — Read raw YAML content of a spec file
 * PUT  /api/specs/[file] — Write updated YAML content back to the spec file
 */
import { NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const FACTORY_ROOT = resolve(process.cwd(), '..');

/**
 * Resolve the specs base directory — active project or factory fallback.
 */
function getSpecsBase(): string {
  try {
    const projectsPath = join(FACTORY_ROOT, 'projects.json');
    if (existsSync(projectsPath)) {
      const config = JSON.parse(readFileSync(projectsPath, 'utf-8'));
      if (config.activeProject) {
        const project = config.projects?.find(
          (p: any) => p.id === config.activeProject
        );
        if (project) {
          return join(project.path, '.factory', 'specs');
        }
      }
    }
  } catch {}
  return '';
}

function resolveSpecPath(file: string): string | null {
  const base = getSpecsBase();

  // Direct match in apps/
  const appsPath = join(base, 'apps', file);
  if (existsSync(appsPath)) return appsPath;

  // Match in features/
  const cleaned = file.replace(/^features\//, '');
  const featuresPath = join(base, 'features', cleaned);
  if (existsSync(featuresPath)) return featuresPath;

  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  try {
    const { file } = await params;
    const specPath = resolveSpecPath(decodeURIComponent(file));

    if (!specPath) {
      return NextResponse.json(
        { error: `Spec not found: ${file}` },
        { status: 404 }
      );
    }

    const content = readFileSync(specPath, 'utf-8');
    return NextResponse.json({ file, content, path: specPath });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to read spec' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  try {
    const { file } = await params;
    const body = await request.json();
    const content = body.content;

    if (typeof content !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: content' },
        { status: 400 }
      );
    }

    const specPath = resolveSpecPath(decodeURIComponent(file));

    if (!specPath) {
      return NextResponse.json(
        { error: `Spec not found: ${file}` },
        { status: 404 }
      );
    }

    // Validate YAML before saving
    try {
      const { parse: parseYaml } = require('yaml');
      parseYaml(content);
    } catch (yamlErr: any) {
      return NextResponse.json(
        { error: `Invalid YAML: ${yamlErr.message}` },
        { status: 422 }
      );
    }

    writeFileSync(specPath, content, 'utf-8');
    return NextResponse.json({ success: true, file, path: specPath });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to save spec' },
      { status: 500 }
    );
  }
}
