/**
 * Context gathering — reads knowledge files and conventions from the target repo.
 *
 * Only reads from paths declared in factory.yaml. No filesystem scanning.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { BridgeConfig, ProjectContext, KnowledgeFile, ProjectStack } from './types.ts';
import { log } from './log.ts';

/**
 * Gather all context from a target repo for the LLM prompt.
 *
 * Reads:
 *  - Knowledge/skill files declared in factory.yaml
 *  - Convention files declared in factory.yaml
 *  - Stack information from factory.yaml
 */
export function gatherContext(repoPath: string, bridge: BridgeConfig): ProjectContext {
    const knowledgeFiles = gatherKnowledgeFiles(repoPath, bridge);
    const conventions = gatherConventions(repoPath, bridge);

    log('✓', `Gathered ${knowledgeFiles.length} knowledge files, ${conventions.length} convention files`);

    return {
        bridge,
        knowledgeFiles,
        conventions,
        stack: bridge.stack,
    };
}

// ─── Knowledge Files ─────────────────────────────────────

/**
 * Read knowledge files (agents.md, skills.md, etc.) from paths in factory.yaml.
 */
function gatherKnowledgeFiles(repoPath: string, bridge: BridgeConfig): KnowledgeFile[] {
    const files: KnowledgeFile[] = [];

    // Skills: declared file list in factory.yaml
    if (bridge.skills?.files) {
        for (const filePath of bridge.skills.files) {
            const absPath = join(repoPath, filePath);
            if (existsSync(absPath)) {
                files.push({
                    app: extractAppName(filePath),
                    filename: filePath.split('/').pop() || filePath,
                    path: filePath,
                    content: readFileSync(absPath, 'utf-8'),
                });
            }
        }
    }

    // Auto discovery - if configured, walk apps_dir and look for standard files
    if (bridge.skills?.discovery === 'auto' && bridge.apps_dir) {
        const appsDir = join(repoPath, bridge.apps_dir);
        if (existsSync(appsDir)) {
            const SKILL_FILES = ['agents.md', 'AGENTS.md', 'skills.md', 'SKILL.md'];
            const appDirs = readdirSync(appsDir, { withFileTypes: true })
                .filter(d => d.isDirectory())
                .map(d => d.name);

            for (const appName of appDirs) {
                for (const skillFile of SKILL_FILES) {
                    const filePath = join(appsDir, appName, skillFile);
                    if (existsSync(filePath)) {
                        // Check we didn't already add it from the explicit list
                        const relPath = `${bridge.apps_dir}/${appName}/${skillFile}`;
                        if (!files.some(f => f.path === relPath)) {
                            files.push({
                                app: appName,
                                filename: skillFile,
                                path: relPath,
                                content: readFileSync(filePath, 'utf-8'),
                            });
                        }
                    }
                }
            }
        }
    }

    // Build knowledge - auto-discover .factory/knowledge/builds/ summaries
    const knowledgeBuildsDir = join(repoPath, '.factory', 'knowledge', 'builds');
    if (existsSync(knowledgeBuildsDir)) {
        const buildFiles = readdirSync(knowledgeBuildsDir)
            .filter(f => f.endsWith('.md'))
            .sort();
        for (const buildFile of buildFiles) {
            const relPath = `.factory/knowledge/builds/${buildFile}`;
            if (!files.some(f => f.path === relPath)) {
                files.push({
                    app: buildFile.replace('.md', ''),
                    filename: buildFile,
                    path: relPath,
                    content: readFileSync(join(knowledgeBuildsDir, buildFile), 'utf-8'),
                });
            }
        }
    }

    return files;
}

// ─── Conventions ─────────────────────────────────────────

/**
 * Read convention/rule files from paths in factory.yaml.
 */
function gatherConventions(repoPath: string, bridge: BridgeConfig): string[] {
    const contents: string[] = [];

    // Agents.md
    if (bridge.conventions?.agents) {
        const agentsPath = join(repoPath, bridge.conventions.agents);
        if (existsSync(agentsPath)) {
            contents.push(readFileSync(agentsPath, 'utf-8'));
        }
    }

    // Rules directory
    if (bridge.conventions?.rules) {
        const rulesDir = join(repoPath, bridge.conventions.rules);
        if (existsSync(rulesDir)) {
            const ruleFiles = readdirSync(rulesDir)
                .filter(f => f.endsWith('.md'))
                .sort();
            for (const file of ruleFiles) {
                contents.push(readFileSync(join(rulesDir, file), 'utf-8'));
            }
        }
    }

    return contents;
}

// ─── Helpers ─────────────────────────────────────────────

/** Extract an app name from a file path like "apps/invoicer/agents.md" → "invoicer" */
function extractAppName(filePath: string): string {
    const parts = filePath.split('/');
    // Look for the directory before the file name
    return parts.length >= 2 ? parts[parts.length - 2] : 'root';
}
