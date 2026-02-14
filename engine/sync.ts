/**
 * Sync engine — pulls the reference layer from a connected project.
 *
 * If the repo has a .factory/factory.yaml, uses it as the manifest.
 * Otherwise falls back to legacy scanning.
 *
 * Creates **symlinks** in reference/ pointing to the actual repo files,
 * so docs remain living documents.
 */

import {
    cpSync, existsSync, readFileSync, rmSync,
    readdirSync, symlinkSync, lstatSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { PATHS, ensureDir, writeFile, log } from './utils.ts';
import { hasBridge, loadBridgeConfig, type BridgeConfig } from './bridge.ts';

/** Files/directories to skip when copying the starter template */
const SKIP_TEMPLATE = new Set([
    '.next', 'node_modules', 'dist', '.turbo', '.env.local',
    'creds', '.DS_Store', 'Dockerfile.bak',
]);

/**
 * Sync the factory reference from a repo path.
 * Prefers .factory/factory.yaml if available.
 */
export function syncFromRepo(repoPath: string): void {
    if (!existsSync(repoPath)) {
        throw new Error(`Repo not found at: ${repoPath}`);
    }

    log('●', `Syncing from ${repoPath}...`);

    if (hasBridge(repoPath)) {
        log('●', 'Using .factory/factory.yaml manifest');
        const config = loadBridgeConfig(repoPath);
        syncFromBridge(repoPath, config);
    } else {
        log('●', 'No .factory bridge found — using legacy scan');
        syncLegacy(repoPath);
    }

    // Always regenerate ports.json
    generatePortsJson();

    log('✓', 'Sync complete!');
}

// ─── Bridge-based sync (symlinks) ─────────────────────────

function syncFromBridge(repoPath: string, config: BridgeConfig): void {
    // 1. Registry
    if (config.registry?.apps) {
        ensureDir(PATHS.registry);
        createSymlink(
            join(repoPath, config.registry.apps),
            join(PATHS.registry, 'apps.json')
        );
        log('✓', 'Linked registry (apps.json)');
    }

    // 2. Conventions
    if (config.conventions) {
        ensureDir(PATHS.conventions);

        // Rules directory
        if (config.conventions.rules) {
            const rulesDir = join(repoPath, config.conventions.rules);
            if (existsSync(rulesDir)) {
                const ruleFiles = readdirSync(rulesDir).filter(f => f.endsWith('.md'));
                for (const file of ruleFiles) {
                    createSymlink(
                        join(rulesDir, file),
                        join(PATHS.conventions, file)
                    );
                }
                log('✓', `Linked ${ruleFiles.length} convention files`);
            }
        }

        // AGENTS.md
        if (config.conventions.agents) {
            const agentsPath = join(repoPath, config.conventions.agents);
            if (existsSync(agentsPath)) {
                createSymlink(
                    agentsPath,
                    join(PATHS.conventions, 'AGENTS.md')
                );
            }
        }
    }

    // 3. Skills
    if (config.skills && config.skills.length > 0) {
        ensureDir(PATHS.skills);
        // Clean existing
        cleanDir(PATHS.skills);

        for (const skill of config.skills) {
            const src = join(repoPath, skill.path);
            if (existsSync(src)) {
                const filename = skill.path.split('/').pop() || 'unknown.md';
                const dest = join(PATHS.skills, `${skill.app}-${filename}`);
                createSymlink(src, dest);
            }
        }
        log('✓', `Linked ${config.skills.length} skill files`);
    }

    // 4. Templates
    if (config.templates?.starter) {
        const starterPath = join(repoPath, config.templates.starter);
        if (existsSync(starterPath)) {
            const destPath = resolve(PATHS.templates, 'starter');
            // For template dirs we still copy (they need to be modified during scaffold)
            if (existsSync(destPath)) {
                rmSync(destPath, { recursive: true, force: true });
            }
            ensureDir(destPath);
            copyRecursive(starterPath, destPath, SKIP_TEMPLATE);
            log('✓', 'Synced starter template (copy)');
        }
    }
}

// ─── Legacy scan (backward compat) ────────────────────────

function syncLegacy(repoPath: string): void {
    // Verify it has the expected structure
    const appsJsonPath = join(repoPath, 'apps.json');
    if (!existsSync(appsJsonPath)) {
        throw new Error(`Missing apps.json at ${repoPath}`);
    }

    syncTemplateLegacy(repoPath);
    syncRegistryLegacy(repoPath);
    syncConventionsLegacy(repoPath);
    syncSkillsLegacy(repoPath);
}

function syncTemplateLegacy(repoPath: string): void {
    const starterPath = join(repoPath, 'apps', 'starter');
    const destPath = resolve(PATHS.templates, 'starter');

    if (!existsSync(starterPath)) {
        log('!', 'Warning: apps/starter not found in repo');
        return;
    }

    if (existsSync(destPath)) {
        rmSync(destPath, { recursive: true, force: true });
    }
    ensureDir(destPath);
    copyRecursive(starterPath, destPath, SKIP_TEMPLATE);
    log('✓', 'Synced starter template');
}

function syncRegistryLegacy(repoPath: string): void {
    const appsJsonPath = join(repoPath, 'apps.json');
    const destPath = resolve(PATHS.registry, 'apps.json');

    ensureDir(PATHS.registry);
    cpSync(appsJsonPath, destPath);
    log('✓', 'Synced apps.json registry');
}

function syncConventionsLegacy(repoPath: string): void {
    const rulesDir = join(repoPath, '.agent', 'rules');

    if (!existsSync(rulesDir)) {
        log('!', 'Warning: .agent/rules not found in repo');
        return;
    }

    ensureDir(PATHS.conventions);

    const ruleFiles = readdirSync(rulesDir).filter(f => f.endsWith('.md'));
    for (const file of ruleFiles) {
        cpSync(join(rulesDir, file), join(PATHS.conventions, file));
    }

    const agentsPath = join(repoPath, 'AGENTS.md');
    if (existsSync(agentsPath)) {
        cpSync(agentsPath, join(PATHS.conventions, 'AGENTS.md'));
    }

    log('✓', `Synced ${ruleFiles.length} convention files`);
}

function syncSkillsLegacy(repoPath: string): void {
    const appsDir = join(repoPath, 'apps');
    if (!existsSync(appsDir)) return;

    ensureDir(PATHS.skills);
    cleanDir(PATHS.skills);

    const SKILL_FILES = ['skills.md', 'SKILL.md', 'agents.md', 'AGENTS.md'];
    const appDirs = readdirSync(appsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

    let count = 0;
    for (const appName of appDirs) {
        const appPath = join(appsDir, appName);
        for (const skillFile of SKILL_FILES) {
            const src = join(appPath, skillFile);
            if (existsSync(src)) {
                cpSync(src, join(PATHS.skills, `${appName}-${skillFile}`));
                count++;
            }
        }
    }

    log('✓', `Synced ${count} skill/agent files from apps/`);
}

// ─── Shared helpers ───────────────────────────────────────

function generatePortsJson(): void {
    const registryPath = resolve(PATHS.registry, 'apps.json');
    if (!existsSync(registryPath)) return;

    // Follow symlink to read actual content
    const content = readFileSync(registryPath, 'utf-8');
    const registry = JSON.parse(content);
    const usedPorts = registry.apps.map((a: { port: number; name: string }) => ({
        port: a.port,
        app: a.name,
    }));

    usedPorts.sort((a: { port: number }, b: { port: number }) => a.port - b.port);

    const allPorts = new Set(usedPorts.map((p: { port: number }) => p.port));
    let nextPort = 3030;
    while (allPorts.has(nextPort)) {
        nextPort++;
    }

    const portsData = {
        usedPorts,
        nextAvailable: nextPort,
        updatedAt: new Date().toISOString(),
    };

    writeFile(
        resolve(PATHS.registry, 'ports.json'),
        JSON.stringify(portsData, null, 2) + '\n'
    );

    log('✓', `Generated ports.json (next available: ${nextPort})`);
}

/**
 * Create a symlink, removing any existing file/link at dest.
 */
function createSymlink(src: string, dest: string): void {
    // Remove existing
    if (existsSync(dest) || isSymlink(dest)) {
        rmSync(dest, { force: true });
    }
    symlinkSync(src, dest);
}

function isSymlink(path: string): boolean {
    try {
        return lstatSync(path).isSymbolicLink();
    } catch {
        return false;
    }
}

function cleanDir(dir: string): void {
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir)) {
        rmSync(join(dir, f), { force: true });
    }
}

/**
 * Recursively copy a directory, skipping entries in the skip set.
 */
function copyRecursive(src: string, dest: string, skip: Set<string>): void {
    const entries = readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        if (skip.has(entry.name)) continue;

        const srcPath = join(src, entry.name);
        const destPath = join(dest, entry.name);

        if (entry.isDirectory()) {
            ensureDir(destPath);
            copyRecursive(srcPath, destPath, skip);
        } else {
            cpSync(srcPath, destPath);
        }
    }
}
