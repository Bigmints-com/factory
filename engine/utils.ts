/**
 * Shared utility functions for the SaveADay Factory engine.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import type { AppSpec, AppRegistry } from './types.ts';

/** Root directory of the factory project */
export const FACTORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Paths to key factory directories */
export const PATHS = {
    reference: resolve(FACTORY_ROOT, 'reference'),
    templates: resolve(FACTORY_ROOT, 'reference', 'templates'),
    schemas: resolve(FACTORY_ROOT, 'reference', 'schemas'),
    registry: resolve(FACTORY_ROOT, 'reference', 'registry'),
    conventions: resolve(FACTORY_ROOT, 'reference', 'conventions'),
    skills: resolve(FACTORY_ROOT, 'reference', 'skills'),
    patches: resolve(FACTORY_ROOT, 'reference', 'patches'),
    get specs() {
        try {
            const projectsPath = join(FACTORY_ROOT, 'projects.json');
            if (existsSync(projectsPath)) {
                const config = JSON.parse(readFileSync(projectsPath, 'utf-8'));
                if (config.activeProject) {
                    const project = config.projects.find((p: any) => p.id === config.activeProject);
                    if (project) {
                        return resolve(project.path, '.factory', 'specs');
                    }
                }
            }
        } catch { /* ignore */ }
        return resolve(FACTORY_ROOT, 'specs');
    },
    output: resolve(FACTORY_ROOT, 'output'),
    reports: resolve(FACTORY_ROOT, 'reports'),
} as const;

/**
 * Parse a spec YAML file and return a typed AppSpec object.
 *
 * @param specPath - Absolute or relative path to the spec YAML file
 * @returns Parsed AppSpec
 */
export function loadSpec(specPath: string): AppSpec {
    // If path is relative and doesn't exist, try resolving it from the active specs dir
    let abs = resolve(specPath);
    if (!existsSync(abs)) {
        const potential = resolve(PATHS.specs, 'apps', specPath);
        if (existsSync(potential)) {
            abs = potential;
        } else {
             const featurePotential = resolve(PATHS.specs, 'features', specPath);
             if (existsSync(featurePotential)) {
                 abs = featurePotential;
             }
        }
    }

    if (!existsSync(abs)) {
        throw new Error(`Spec file not found: ${abs}`);
    }
    const raw = readFileSync(abs, 'utf-8');
    return parseYaml(raw) as AppSpec;
}

/**
 * Load the app registry from reference/registry/apps.json.
 *
 * @returns Parsed AppRegistry
 */
export function loadRegistry(): AppRegistry {
    const registryPath = resolve(PATHS.registry, 'apps.json');
    if (!existsSync(registryPath)) {
        throw new Error(`Registry not found: ${registryPath}. Run 'factory sync' first.`);
    }
    return JSON.parse(readFileSync(registryPath, 'utf-8')) as AppRegistry;
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 */
export function ensureDir(dirPath: string): void {
    mkdirSync(dirPath, { recursive: true });
}

/**
 * Write content to a file, creating parent directories as needed.
 */
export function writeFile(filePath: string, content: string): void {
    ensureDir(dirname(filePath));
    writeFileSync(filePath, content, 'utf-8');
}

/**
 * Capitalize the first letter of a string.
 */
export function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert a slug like "my-app" to PascalCase like "MyApp".
 */
export function slugToPascalCase(slug: string): string {
    return slug.split('-').map(capitalize).join('');
}

/**
 * Format a file size in bytes to a human-readable string.
 */
export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Get the current ISO timestamp.
 */
export function timestamp(): string {
    return new Date().toISOString();
}

/**
 * Log with a colored prefix.
 */
export function log(prefix: string, message: string): void {
    const colors: Record<string, string> = {
        '✓': '\x1b[32m',  // green
        '✗': '\x1b[31m',  // red
        '→': '\x1b[36m',  // cyan
        '!': '\x1b[33m',  // yellow
        '●': '\x1b[35m',  // magenta
    };
    const reset = '\x1b[0m';
    const color = colors[prefix] || '';
    console.log(`${color}${prefix}${reset} ${message}`);
}
