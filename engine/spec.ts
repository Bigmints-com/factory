/**
 * Spec loading and validation.
 * Loads YAML specs from .factory/specs/ and validates them.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { AppSpec, FeatureSpec, SpecStatus, ValidationResult } from './types.ts';
import { specSlug, specPort } from './types.ts';

// ─── Load ────────────────────────────────────────────────

/** Load an app spec from a YAML file */
export function loadSpec(specPath: string): AppSpec {
    const absPath = resolve(specPath);
    if (!existsSync(absPath)) {
        throw new Error(`Spec file not found: ${absPath}`);
    }
    const raw = readFileSync(absPath, 'utf-8');
    return parseYaml(raw) as AppSpec;
}

/** Load a feature spec from a YAML file */
export function loadFeatureSpec(specPath: string): FeatureSpec {
    const absPath = resolve(specPath);
    if (!existsSync(absPath)) {
        throw new Error(`Feature spec not found: ${absPath}`);
    }
    const raw = readFileSync(absPath, 'utf-8');
    return parseYaml(raw) as FeatureSpec;
}

/** List all spec files in a repo's .factory/specs/ directory */
export function listSpecs(repoPath: string): { apps: string[]; features: string[] } {
    const appsDir = join(repoPath, '.factory', 'specs', 'apps');
    const featuresDir = join(repoPath, '.factory', 'specs', 'features');

    const apps = existsSync(appsDir)
        ? readdirSync(appsDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
        : [];

    const features = existsSync(featuresDir)
        ? readdirSync(featuresDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
        : [];

    return { apps, features };
}

// ─── Validate ────────────────────────────────────────────

/** Validate an app spec */
export function validateSpec(spec: AppSpec): ValidationResult {
    const errors: string[] = [];

    // Required: appName
    if (!spec.appName || spec.appName.trim().length === 0) {
        errors.push('appName is required');
    }

    // Required: description
    if (!spec.description || spec.description.trim().length === 0) {
        errors.push('description is required');
    }

    // Slug must be valid
    const slug = specSlug(spec);
    if (slug && !/^[a-z][a-z0-9-]*$/.test(slug)) {
        errors.push(`Invalid slug "${slug}" — must be lowercase alphanumeric with hyphens`);
    }

    // Required: stack.framework
    if (!spec.stack?.framework) {
        errors.push('stack.framework is required');
    }

    // Port range (if specified)
    const port = specPort(spec);
    if (spec.deployment?.port && (port < 1024 || port > 65535)) {
        errors.push(`Port ${port} is out of range (1024–65535)`);
    }

    // Data tables: each must have a name and at least one field
    if (spec.data?.tables) {
        for (const table of spec.data.tables) {
            if (!table.name) {
                errors.push('Each data table must have a name');
            }
            if (!table.fields || Object.keys(table.fields).length === 0) {
                errors.push(`Table "${table.name}" must have at least one field`);
            }
        }
    }

    // Auth: if provider is set, check it's a known value
    if (spec.auth?.provider) {
        const known = ['firebase', 'nextauth', 'supabase', 'clerk', 'none'];
        if (!known.includes(spec.auth.provider)) {
            errors.push(`Unknown auth provider "${spec.auth.provider}". Known: ${known.join(', ')}`);
        }
    }

    return { passed: errors.length === 0, errors };
}

/** Validate a feature spec */
export function validateFeatureSpec(spec: FeatureSpec): ValidationResult {
    const errors: string[] = [];

    if (!spec.feature?.name) {
        errors.push('feature.name is required');
    }
    if (!spec.feature?.slug) {
        errors.push('feature.slug is required');
    }
    if (!spec.target?.app) {
        errors.push('target.app is required');
    }

    return { passed: errors.length === 0, errors };
}

// ─── Status Update ───────────────────────────────────────

/**
 * Update a spec YAML file's status field in-place.
 * Preserves all other content — only changes the `status:` line.
 */
export function updateSpecStatus(specPath: string, status: SpecStatus): void {
    const absPath = resolve(specPath);
    if (!existsSync(absPath)) return;

    const raw = readFileSync(absPath, 'utf-8');
    const spec = parseYaml(raw);
    spec.status = status;
    writeFileSync(absPath, stringifyYaml(spec, { lineWidth: 120 }));
}
