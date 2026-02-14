/**
 * Validation engine — checks that a spec or generated output meets all requirements.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import Ajv from 'ajv';
import type { AppSpec, ValidationResult, ValidationCheck } from './types.ts';
import { specSlug, specPort } from './types.ts';
import { PATHS, loadRegistry, log } from './utils.ts';
import { getActiveBridgeConfig } from './projects.ts';

/**
 * Validate a spec YAML against the JSON schema.
 *
 * @param spec - Parsed app spec
 * @returns Validation result
 */
export function validateSpec(spec: AppSpec): ValidationResult {
    const checks: ValidationCheck[] = [];
    const slug = specSlug(spec);
    const port = specPort(spec);

    // 1. Schema validation
    const schemaPath = resolve(PATHS.schemas, 'app-spec.schema.json');
    if (existsSync(schemaPath)) {
        const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
        const ajv = new Ajv({ allErrors: true });
        const valid = ajv.validate(schema, spec);

        checks.push({
            name: 'Schema validation',
            passed: !!valid,
            message: valid
                ? 'Spec matches app-spec.schema.json'
                : `Schema errors: ${ajv.errorsText()}`,
        });
    } else {
        checks.push({
            name: 'Schema validation',
            passed: true,
            message: 'Schema file not found — skipped (run factory sync to enable)',
        });
    }

    // 2. Required fields
    checks.push({
        name: 'App name present',
        passed: !!spec.appName && spec.appName.length > 0,
        message: spec.appName
            ? `App name: "${spec.appName}"`
            : 'App name is missing',
    });

    checks.push({
        name: 'Slug format valid',
        passed: /^[a-z][a-z0-9_-]*$/.test(slug),
        message: slug
            ? `Slug "${slug}" is valid`
            : 'Slug is missing or invalid (must be lowercase alphanumeric with hyphens/underscores)',
    });

    checks.push({
        name: 'Stack framework specified',
        passed: !!spec.stack?.framework,
        message: spec.stack?.framework
            ? `Framework: ${spec.stack.framework}`
            : 'No framework specified in stack',
    });

    // 3. Data tables (optional but checked)
    const tables = spec.data?.tables || [];
    checks.push({
        name: 'Data tables defined',
        passed: tables.length > 0,
        message: tables.length > 0
            ? `${tables.length} table(s) defined: ${tables.map(t => t.name).join(', ')}`
            : 'No data tables defined (app will have no data layer)',
    });

    // 4. Port range (if deployment specified)
    if (spec.deployment?.port) {
        checks.push({
            name: 'Port in valid range',
            passed: port >= 3000 && port <= 9999,
            message: `Port ${port} is ${port >= 3000 && port <= 9999 ? 'valid' : 'out of range (3000-9999)'}`,
        });
    }

    // 5. Check for conflicts with existing registry
    try {
        const registry = loadRegistry();

        if (spec.deployment?.port) {
            const portConflict = registry.apps.find(a => a.port === port);
            checks.push({
                name: 'No port conflict',
                passed: !portConflict,
                message: portConflict
                    ? `Port ${port} already used by "${portConflict.name}"`
                    : `Port ${port} is available`,
            });
        }

        const slugConflict = registry.apps.find(
            a => a.path === `apps/${slug}` || a.container === slug
        );
        checks.push({
            name: 'No slug conflict',
            passed: !slugConflict,
            message: slugConflict
                ? `Slug "${slug}" conflicts with existing app "${slugConflict.name}"`
                : `Slug "${slug}" is available`,
        });
    } catch {
        checks.push({
            name: 'Registry conflict check',
            passed: true,
            message: 'No registry available — skipped (run factory sync to enable)',
        });
    }

    const passed = checks.every(c => c.passed);
    return { passed, checks };
}

/**
 * Validate a generated output directory.
 *
 * @param slug - App slug (output directory name)
 * @returns Validation result
 */
export function validateOutput(slug: string, customOutputDir?: string): ValidationResult {
    const outputDir = customOutputDir || resolve(PATHS.output, slug);
    const checks: ValidationCheck[] = [];

    // 1. Output exists
    checks.push({
        name: 'Output directory exists',
        passed: existsSync(outputDir),
        message: existsSync(outputDir) ? `Found ${outputDir}` : `Not found: ${outputDir}`,
    });

    if (!existsSync(outputDir)) {
        return { passed: false, checks };
    }

    // 2. Required files — use minimal set if template-specific files aren't present
    const templateFiles = [
        'app.config.json',
        'middleware.ts',
        '.env.example',
        'deploy.sh',
        'src/components/HomeClient.tsx',
        'src/lib/api-client.ts',
    ];
    const isTemplateOutput = templateFiles.some(f => existsSync(join(outputDir, f)));

    const requiredFiles = isTemplateOutput
        ? [
            'package.json',
            'app.config.json',
            'next.config.ts',
            'middleware.ts',
            'tsconfig.json',
            '.env.example',
            'deploy.sh',
            'src/app/layout.tsx',
            'src/app/page.tsx',
            'src/app/globals.css',
            'src/components/HomeClient.tsx',
            'src/lib/api-client.ts',
          ]
        : [
            // Minimal checks for LLM-generated apps
            'package.json',
            'tsconfig.json',
          ];

    for (const file of requiredFiles) {
        const filePath = join(outputDir, file);
        checks.push({
            name: `File: ${file}`,
            passed: existsSync(filePath),
            message: existsSync(filePath) ? '✓ exists' : '✗ missing',
        });
    }

    // 3. package.json validity
    const pkgPath = join(outputDir, 'package.json');
    if (existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

            checks.push({
                name: 'package.json: valid JSON',
                passed: true,
                message: `Name is "${pkg.name}"`,
            });

            if (isTemplateOutput) {
                // Check namespace prefix if configured
                let namespace = '';
                try {
                    const bridge = getActiveBridgeConfig();
                    namespace = bridge.namespace || '';
                } catch { /* no active project */ }

                if (namespace) {
                    checks.push({
                        name: `package.json: name starts with ${namespace}/`,
                        passed: pkg.name?.startsWith(`${namespace}/`),
                        message: `Name is "${pkg.name}"`,
                    });
                }
            }
        } catch {
            checks.push({
                name: 'package.json: valid JSON',
                passed: false,
                message: 'Failed to parse package.json',
            });
        }
    }

    // 4. app.config.json validity (template builds only)
    if (isTemplateOutput) {
        const configPath = join(outputDir, 'app.config.json');
        if (existsSync(configPath)) {
            try {
                const config = JSON.parse(readFileSync(configPath, 'utf-8'));

                checks.push({
                    name: 'app.config.json: has metadata',
                    passed: !!config.metadata?.slug,
                    message: config.metadata?.slug ? `Slug: ${config.metadata.slug}` : 'Missing slug',
                });
            } catch {
                checks.push({
                    name: 'app.config.json: valid JSON',
                    passed: false,
                    message: 'Failed to parse app.config.json',
                });
            }
        }
    }

    // 5. Patches directory (template builds only)
    if (isTemplateOutput) {
        const patchesDir = join(outputDir, 'patches');
        checks.push({
            name: 'Patches directory exists',
            passed: existsSync(patchesDir),
            message: existsSync(patchesDir)
                ? '✓ patches/ directory found'
                : '✗ patches/ not found — run factory patch first',
        });
    }

    const passed = checks.every(c => c.passed);
    return { passed, checks };
}

/**
 * Print validation results to console.
 */
export function printValidation(result: ValidationResult): void {
    for (const check of result.checks) {
        const prefix = check.passed ? '✓' : '✗';
        log(prefix, `${check.name}: ${check.message}`);
    }

    console.log('');
    if (result.passed) {
        log('✓', 'All checks passed!');
    } else {
        const failed = result.checks.filter(c => !c.passed).length;
        log('✗', `${failed} check(s) failed.`);
    }
}
