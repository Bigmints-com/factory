/**
 * Feature validation — validates a FeatureSpec YAML against schema and checks.
 */
import Ajv from 'ajv';
import type { FeatureSpec, ValidationResult, ValidationCheck } from './types.ts';
import { PATHS, log } from './utils.ts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadSchema(name: string) {
    return JSON.parse(readFileSync(resolve(PATHS.schemas, name), 'utf-8'));
}

/**
 * Validate a FeatureSpec against the JSON schema and run additional checks.
 */
export function validateFeatureSpec(spec: FeatureSpec): ValidationResult {
    const checks: ValidationCheck[] = [];

    // 1. Schema validation
    const ajv = new Ajv();
    const schema = loadSchema('feature-spec.schema.json');
    const validateSchema = ajv.compile(schema);
    const schemaPassed = validateSchema(spec);
    checks.push({
        name: 'Schema validation',
        passed: !!schemaPassed,
        message: schemaPassed ? 'Spec matches feature-spec.schema.json' : validateSchema.errors?.[0]?.message || '',
    });

    // 2. Feature slug format
    const slugValid = /^[a-z][a-z0-9-]*$/.test(spec.feature?.slug || '');
    checks.push({
        name: 'Feature slug format',
        passed: slugValid,
        message: slugValid ? `Slug "${spec.feature.slug}" is valid` : `Invalid slug: "${spec.feature?.slug}"`,
    });

    // 3. At least one page
    const hasPages = spec.pages && spec.pages.length > 0;
    checks.push({
        name: 'At least one page defined',
        passed: !!hasPages,
        message: hasPages ? `${spec.pages.length} page(s) defined` : 'No pages defined',
    });

    // 4. Pages reference valid routes
    const routesValid = spec.pages?.every(p => p.route.startsWith('/'));
    checks.push({
        name: 'Page routes start with /',
        passed: !!routesValid,
        message: routesValid ? 'All routes are valid' : 'Some routes do not start with /',
    });

    // 5. Model has fields
    const hasFields = spec.model?.fields && Object.keys(spec.model.fields).length > 0;
    checks.push({
        name: 'Model has fields',
        passed: !!hasFields,
        message: hasFields ? `${Object.keys(spec.model.fields).length} field(s) defined` : 'No fields defined',
    });

    // 6. Collection name is valid
    const collectionValid = /^[a-z][a-z0-9_]*$/.test(spec.model?.collection || '');
    checks.push({
        name: 'Collection name format',
        passed: collectionValid,
        message: collectionValid ? `Collection "${spec.model.collection}" is valid` : `Invalid collection: "${spec.model?.collection}"`,
    });

    // 7. Target app is specified
    const hasTarget = !!spec.target?.app;
    checks.push({
        name: 'Target app specified',
        passed: hasTarget,
        message: hasTarget ? `Target app: ${spec.target.app}` : 'No target app specified',
    });

    return {
        passed: checks.every(c => c.passed),
        checks,
    };
}

/**
 * Pretty-print validation results.
 */
export function printFeatureValidation(result: ValidationResult): void {
    console.log('');
    log(result.passed ? '✓' : '!', `Feature Validation: ${result.passed ? 'PASSED' : 'FAILED'}`);
    console.log('─'.repeat(40));
    for (const check of result.checks) {
        log(check.passed ? '✓' : '✗', `${check.name}: ${check.message}`);
    }
    console.log('');
}
