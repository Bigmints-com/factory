/**
 * GET /api/specs — List all spec files (app specs + feature specs)
 *
 * Reads specs from the active project's .factory/specs/ directory.
 * Falls back to the factory's own specs/ directory if no project is active.
 */
import { NextResponse } from 'next/server';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const FACTORY_ROOT = resolve(process.cwd(), '..');

/**
 * Resolve the specs directories — active project's .factory/specs/ or factory's own.
 */
function getSpecsDirs(): { apps: string; features: string; source: string } {
  try {
    // Try to load from active project
    const projectsPath = join(FACTORY_ROOT, 'projects.json');
    if (existsSync(projectsPath)) {
      const config = JSON.parse(readFileSync(projectsPath, 'utf-8'));
      if (config.activeProject) {
        const project = config.projects?.find(
          (p: any) => p.id === config.activeProject
        );
        if (project) {
          const projectApps = join(project.path, '.factory', 'specs', 'apps');
          const projectFeatures = join(project.path, '.factory', 'specs', 'features');
          const hasAppSpecs = existsSync(projectApps) &&
            readdirSync(projectApps).some(f => (f.endsWith('.yaml') || f.endsWith('.yml')) && !f.startsWith('_'));
          const hasFeatureSpecs = existsSync(projectFeatures) &&
            readdirSync(projectFeatures).some(f => (f.endsWith('.yaml') || f.endsWith('.yml')) && !f.startsWith('_'));
          if (hasAppSpecs || hasFeatureSpecs) {
            return {
              apps: projectApps,
              features: projectFeatures,
              source: project.name,
            };
          }
        }
      }
    }
  } catch {
    // Fall through to factory specs
  }

  // Fallback: factory's own specs/
  return {
    apps: resolve(FACTORY_ROOT, 'specs', 'apps'),
    features: resolve(FACTORY_ROOT, 'specs', 'features'),
    source: 'factory',
  };
}

export async function GET() {
  try {
    const { apps: APPS_DIR, features: FEATURES_DIR, source } = getSpecsDirs();

    // App specs
    let specs: any[] = [];
    if (existsSync(APPS_DIR)) {
      const appFiles = readdirSync(APPS_DIR).filter(
        (f) => (f.endsWith('.yaml') || f.endsWith('.yml')) && !f.startsWith('.') && !f.startsWith('_')
      );

      specs = appFiles.map((file) => {
        try {
          const raw = readFileSync(join(APPS_DIR, file), 'utf-8');
          const parsed = parseYaml(raw);
          return {
            file,
            kind: 'AppSpec' as const,
            valid: true,
            metadata: parsed.metadata || {},
            status: parsed.status || 'unknown',
            deployment: parsed.deployment || {},
            database: parsed.database || {},
            api: parsed.api || {},
            features: parsed.features || {},
          };
        } catch {
          return { file, kind: 'AppSpec' as const, valid: false, error: 'Failed to parse' };
        }
      });
    }

    // Feature specs
    let featureSpecs: any[] = [];
    if (existsSync(FEATURES_DIR)) {
      const featureFiles = readdirSync(FEATURES_DIR).filter(
        (f) => (f.endsWith('.yaml') || f.endsWith('.yml')) && !f.startsWith('.') && !f.startsWith('_')
      );

      featureSpecs = featureFiles.map((file) => {
        try {
          const raw = readFileSync(join(FEATURES_DIR, file), 'utf-8');
          const parsed = parseYaml(raw);
          return {
            file: `features/${file}`,
            kind: 'FeatureSpec' as const,
            valid: true,
            feature: parsed.feature || {},
            target: parsed.target || {},
            status: parsed.status || 'unknown',
            pages: parsed.pages || [],
            model: parsed.model || {},
            navigation: parsed.navigation || {},
          };
        } catch {
          return { file: `features/${file}`, kind: 'FeatureSpec' as const, valid: false, error: 'Failed to parse' };
        }
      });
    }

    return NextResponse.json({ specs, featureSpecs, source });
  } catch {
    return NextResponse.json({ specs: [], featureSpecs: [], source: 'error', error: 'specs directory not found' });
  }
}
