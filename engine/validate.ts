/**
 * Validation engine — checks that a spec or generated output meets all requirements.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import Ajv from 'ajv';
import type { AppSpec, ValidationResult, ValidationCheck } from './types.ts';
import { PATHS, loadRegistry, log } from './utils.ts';

/**
 * Validate a spec YAML against the JSON schema.
 *
 * @param spec - Parsed app spec
 * @returns Validation result
 */
export function validateSpec(spec: AppSpec): ValidationResult {
    const checks: ValidationCheck[] = [];

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
            passed: false,
            message: 'Schema file not found. Run factory sync first.',
        });
    }

    // 2. Required fields
    checks.push({
        name: 'Metadata slug format',
        passed: /^[a-z][a-z0-9-]*$/.test(spec.metadata.slug),
        message: spec.metadata.slug
            ? `Slug "${spec.metadata.slug}" is valid`
            : 'Slug is missing or invalid (must be lowercase alphanumeric with hyphens)',
    });

    checks.push({
        name: 'At least one API resource',
        passed: spec.api.resources.length > 0,
        message: spec.api.resources.length > 0
            ? `${spec.api.resources.length} resource(s) defined`
            : 'No API resources defined',
    });

    checks.push({
        name: 'At least one database collection',
        passed: spec.database.collections.length > 0,
        message: spec.database.collections.length > 0
            ? `${spec.database.collections.length} collection(s) defined`
            : 'No database collections defined',
    });

    // 3. Port range
    checks.push({
        name: 'Port in valid range',
        passed: spec.deployment.port >= 3000 && spec.deployment.port <= 9999,
        message: `Port ${spec.deployment.port} is ${spec.deployment.port >= 3000 && spec.deployment.port <= 9999 ? 'valid' : 'out of range (3000-9999)'}`,
    });

    // 4. Check for conflicts with existing registry
    try {
        const registry = loadRegistry();

        const portConflict = registry.apps.find(a => a.port === spec.deployment.port);
        checks.push({
            name: 'No port conflict',
            passed: !portConflict,
            message: portConflict
                ? `Port ${spec.deployment.port} already used by "${portConflict.name}"`
                : `Port ${spec.deployment.port} is available`,
        });

        const slugConflict = registry.apps.find(
            a => a.path === `apps/${spec.metadata.slug}` || a.container === spec.metadata.slug
        );
        checks.push({
            name: 'No slug conflict',
            passed: !slugConflict,
            message: slugConflict
                ? `Slug "${spec.metadata.slug}" conflicts with existing app "${slugConflict.name}"`
                : `Slug "${spec.metadata.slug}" is available`,
        });

        const dbConflict = registry.apps.find(a => a.database === spec.database.firestoreId);
        checks.push({
            name: 'No database ID conflict',
            passed: !dbConflict,
            message: dbConflict
                ? `Database ID "${spec.database.firestoreId}" already used by "${dbConflict.name}"`
                : `Database ID "${spec.database.firestoreId}" is available`,
        });
    } catch {
        checks.push({
            name: 'Registry conflict check',
            passed: false,
            message: 'Could not load registry. Run factory sync first.',
        });
    }

    // 5. Brand accent format
    if (spec.metadata.brandAccent) {
        checks.push({
            name: 'Brand accent format',
            passed: /^#[0-9a-fA-F]{6}$/.test(spec.metadata.brandAccent),
            message: /^#[0-9a-fA-F]{6}$/.test(spec.metadata.brandAccent)
                ? `Brand accent "${spec.metadata.brandAccent}" is valid hex`
                : `Brand accent "${spec.metadata.brandAccent}" is not valid hex (expected #RRGGBB)`,
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
export function validateOutput(slug: string): ValidationResult {
    const outputDir = resolve(PATHS.output, slug);
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

    // 2. Required files
    const requiredFiles = [
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
                name: 'package.json: name starts with @saveaday/',
                passed: pkg.name?.startsWith('@saveaday/'),
                message: `Name is "${pkg.name}"`,
            });

            const hasSharedDeps = ['@saveaday/shared-ui', '@saveaday/shared-auth'].every(
                dep => pkg.dependencies?.[dep]
            );
            checks.push({
                name: 'package.json: shared deps present',
                passed: hasSharedDeps,
                message: hasSharedDeps ? 'shared-ui and shared-auth found' : 'Missing shared dependencies',
            });
        } catch {
            checks.push({
                name: 'package.json: valid JSON',
                passed: false,
                message: 'Failed to parse package.json',
            });
        }
    }

    // 4. app.config.json validity
    const configPath = join(outputDir, 'app.config.json');
    if (existsSync(configPath)) {
        try {
            const config = JSON.parse(readFileSync(configPath, 'utf-8'));

            checks.push({
                name: 'app.config.json: has metadata',
                passed: !!config.metadata?.slug,
                message: config.metadata?.slug ? `Slug: ${config.metadata.slug}` : 'Missing slug',
            });

            checks.push({
                name: 'app.config.json: has firestore config',
                passed: !!config.firestore?.databaseId,
                message: config.firestore?.databaseId
                    ? `DB: ${config.firestore.databaseId}`
                    : 'Missing firestore config',
            });
        } catch {
            checks.push({
                name: 'app.config.json: valid JSON',
                passed: false,
                message: 'Failed to parse app.config.json',
            });
        }
    }

    // 5. Patches directory
    const patchesDir = join(outputDir, 'patches');
    checks.push({
        name: 'Patches directory exists',
        passed: existsSync(patchesDir),
        message: existsSync(patchesDir)
            ? '✓ patches/ directory found'
            : '✗ patches/ not found — run factory patch first',
    });

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
