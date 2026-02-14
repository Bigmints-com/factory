/**
 * Scaffold engine — copies the starter template and produces a raw app scaffold.
 *
 * This module handles the file-system level copying. Customization of file
 * contents is handled by customize.ts.
 */

import { cpSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { AppSpec } from './types.ts';
import { PATHS, ensureDir, log } from './utils.ts';

/** Files/directories to skip when copying the template */
const SKIP = new Set(['.next', 'node_modules', 'dist', '.turbo', '.env.local', 'creds', '.DS_Store', 'Dockerfile.bak']);

/**
 * Scaffold a new app from the starter template.
 *
 * @param spec - The parsed app spec
 * @returns Path to the scaffolded output directory
 */
export function scaffoldApp(spec: AppSpec, targetDir?: string): string {
    const templateDir = resolve(PATHS.templates, 'starter');

    if (!existsSync(templateDir)) {
        throw new Error(
            `Starter template not found at ${templateDir}.\n` +
            `Run 'factory sync <repo-path>' first to pull the template.`
        );
    }

    const outputDir = targetDir || resolve(PATHS.output, spec.metadata.slug);

    // Clean previous output if exists
    if (existsSync(outputDir)) {
        log('!', `Cleaning previous output at ${outputDir}`);
        cpSync(outputDir, `${outputDir}.bak`, { recursive: true });
        // Remove old output
        rmSync(outputDir, { recursive: true, force: true });
    }

    ensureDir(outputDir);

    // Copy template files, skipping ignored items
    copyTemplate(templateDir, outputDir);

    log('✓', `Scaffolded ${spec.metadata.slug} at ${outputDir}`);
    return outputDir;
}

/**
 * Recursively copy template directory, skipping ignored files.
 */
function copyTemplate(src: string, dest: string): void {
    const entries = readdirSync(src);

    for (const entry of entries) {
        if (SKIP.has(entry)) continue;

        const srcPath = join(src, entry);
        const destPath = join(dest, entry);
        const stat = statSync(srcPath);

        if (stat.isDirectory()) {
            ensureDir(destPath);
            copyTemplate(srcPath, destPath);
        } else {
            cpSync(srcPath, destPath);
        }
    }
}

/**
 * List all files in a directory recursively (for reporting).
 */
export function listFiles(dir: string, prefix = ''): string[] {
    const results: string[] = [];
    if (!existsSync(dir)) return results;

    const entries = readdirSync(dir);
    for (const entry of entries) {
        const fullPath = join(dir, entry);
        const relPath = prefix ? `${prefix}/${entry}` : entry;
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
            results.push(...listFiles(fullPath, relPath));
        } else {
            results.push(relPath);
        }
    }
    return results;
}
