/**
 * Gemini CLI Engine — delegates code generation to Google's Gemini CLI agent.
 *
 * Instead of Factory's Plan → Build → Test → Iterate pipeline,
 * this engine hands the spec to `gemini` CLI and lets it handle everything:
 * reading the codebase, writing files, running tests, and iterating.
 *
 * Factory remains the orchestrator — it manages specs, queues, and git.
 * Gemini CLI does the actual coding.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import type { AppSpec, FeatureSpec, ProjectContext, BuildResult, GeneratedFile } from './types.ts';
import { specSlug } from './types.ts';
import { log, logStep, logError } from './log.ts';

// ─── Availability Check ──────────────────────────────────

/** Check if Gemini CLI is installed and accessible. */
export function isGeminiCLIAvailable(): { available: boolean; version?: string; error?: string } {
    try {
        const result = execSync('gemini --version 2>&1', {
            timeout: 10_000,
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: '/bin/bash',
        });
        const version = result.toString().trim();
        return { available: true, version };
    } catch (err: any) {
        return {
            available: false,
            error: err.message?.includes('not found') || err.message?.includes('ENOENT')
                ? 'Gemini CLI is not installed. Install with: npm install -g @anthropic-ai/gemini-cli or see https://github.com/anthropics/claude-code'
                : `Gemini CLI check failed: ${err.message?.slice(0, 200)}`,
        };
    }
}

// ─── Prompt Builder ──────────────────────────────────────

/** Build a prompt for Gemini CLI to generate an app from a spec. */
function buildGeminiPrompt(spec: AppSpec, context: ProjectContext, targetDir: string): string {
    const tables = spec.data?.tables || [];
    const tableDefs = tables.map(t => {
        const fields = Object.entries(t.fields)
            .map(([name, def]) => `  - ${name}: ${def.type}${def.required ? ' (required)' : ''}`)
            .join('\n');
        return `- ${t.name}\n${fields}`;
    }).join('\n');

    const conventions = context.conventions.length > 0
        ? `\n## Project Conventions\n${context.conventions.join('\n')}`
        : '';

    const knowledge = context.knowledgeFiles.length > 0
        ? `\n## Existing Knowledge\n${context.knowledgeFiles.map(k => `### ${k.app}\n${k.content}`).join('\n\n')}`
        : '';

    return `You are building a complete, production-ready application. Generate ALL necessary files.

## Application Specification

- **Name**: ${spec.appName}
- **Description**: ${spec.description}
- **Framework**: ${spec.stack.framework}
- **Package Manager**: ${spec.stack.packageManager || 'npm'}
- **Language**: ${spec.stack.language || 'typescript'}
- **Database**: ${spec.stack.database || 'local state'}
- **Linter**: ${spec.stack.linter || 'none'}
- **Testing**: ${spec.stack.testing || 'none'}

### Frontend
- UI Library: ${spec.frontend?.ui || 'tailwind'}
- Theme: ${spec.frontend?.theme || 'light'}

### Layout
- Sidebar: ${spec.layout?.sidebar !== false ? 'yes' : 'no'}
- Topbar: ${spec.layout?.topbar !== false ? 'yes' : 'no'}

### Data Model
${tableDefs || 'No tables — use in-memory state.'}

${spec.dependencies?.length ? `### Required Packages\n${spec.dependencies.map(d => `- ${d}`).join('\n')}` : ''}
${conventions}
${knowledge}

## Output Directory
Write all files to: ${targetDir}

## Requirements
1. Generate ALL files needed for a working application
2. Include proper TypeScript types
3. The app must work with: ${spec.stack.packageManager || 'npm'} install && ${spec.stack.packageManager || 'npm'} run dev
4. Use clean, modern code with proper error handling
5. Install dependencies after generating files
6. Run any available linters/type checks and fix errors
7. Make sure the application compiles and starts without errors`;
}

/** Build a prompt for Gemini CLI to build a feature. */
function buildGeminiFeaturePrompt(spec: FeatureSpec, context: ProjectContext, targetDir: string): string {
    const conventions = context.conventions.length > 0
        ? `\n## Project Conventions\n${context.conventions.join('\n')}`
        : '';

    return `You are adding a new feature to an existing application.

## Feature
- **Name**: ${spec.feature.name}
- **Slug**: ${spec.feature.slug}
- **Target App**: ${spec.target.app}

${spec.model ? `## Data Model
- Collection: ${spec.model.collection}
- Fields:
${spec.model.fields.map(f => `  - ${f.name}: ${f.type}${f.required ? ' (required)' : ''}`).join('\n')}` : ''}

${spec.pages ? `## Pages
${spec.pages.map(p => `- ${p.title} (${p.type}) at /${p.slug}`).join('\n')}` : ''}

${spec.dependencies?.length ? `## Required Packages
${spec.dependencies.map(d => `- ${d}`).join('\n')}` : ''}
${conventions}

## Target Directory
The existing application is at: ${targetDir}
Read the existing code to understand the patterns and conventions used.

## Requirements
1. Add new files that integrate cleanly with the existing codebase
2. Follow the same patterns, imports, and conventions as existing code
3. Do NOT break or overwrite existing functionality
4. Install any new dependencies needed
5. Run type checks and fix any errors
6. Make sure the application still compiles and starts after your changes`;
}

// ─── Engine Execution ────────────────────────────────────

export interface GeminiCLIResult {
    success: boolean;
    filesGenerated: string[];
    output: string;
    durationMs: number;
    error?: string;
}

/**
 * Run Gemini CLI to generate an app from a spec.
 * 
 * This spawns `gemini` in the target directory and lets it handle
 * file creation, dependency installation, and error fixing.
 */
export async function runGeminiCLIBuild(
    spec: AppSpec,
    context: ProjectContext,
    targetDir: string,
): Promise<BuildResult> {
    const check = isGeminiCLIAvailable();
    if (!check.available) {
        throw new Error(check.error || 'Gemini CLI is not available');
    }

    log('→', `Using Gemini CLI engine (${check.version || 'unknown version'})`);

    // Ensure target directory exists
    if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
    }

    const prompt = buildGeminiPrompt(spec, context, targetDir);
    const result = await executeGeminiCLI(prompt, targetDir);

    // Scan what files were created/modified
    const files = scanGeneratedFiles(targetDir);

    return {
        success: result.success,
        files,
        plan: {
            files: files.map(f => f.filename),
            architecture: 'Generated by Gemini CLI',
            decisions: ['engine:gemini-cli'],
        },
        iterations: 1, // Gemini CLI handles its own iteration
        errors: result.error ? [result.error] : undefined,
        provider: 'gemini-cli',
        model: 'gemini-cli',
    };
}

/**
 * Run Gemini CLI to build a feature for an existing app.
 */
export async function runGeminiCLIFeatureBuild(
    spec: FeatureSpec,
    context: ProjectContext,
    targetDir: string,
): Promise<BuildResult> {
    const check = isGeminiCLIAvailable();
    if (!check.available) {
        throw new Error(check.error || 'Gemini CLI is not available');
    }

    log('→', `Using Gemini CLI engine for feature: ${spec.feature.name}`);

    if (!existsSync(targetDir)) {
        throw new Error(`Target app directory does not exist: ${targetDir}`);
    }

    // Snapshot existing files before the build
    const beforeFiles = new Set(scanAllFiles(targetDir));

    const prompt = buildGeminiFeaturePrompt(spec, context, targetDir);
    const result = await executeGeminiCLI(prompt, targetDir);

    // Find newly created/modified files
    const afterFiles = scanAllFiles(targetDir);
    const newOrChanged = afterFiles.filter(f => !beforeFiles.has(f));
    const files = newOrChanged.map(f => ({
        filename: f,
        content: readFileSync(resolve(targetDir, f), 'utf-8'),
    }));

    return {
        success: result.success,
        files,
        plan: {
            files: files.map(f => f.filename),
            architecture: 'Feature generated by Gemini CLI',
            decisions: ['engine:gemini-cli', `feature:${spec.feature.slug}`],
        },
        iterations: 1,
        errors: result.error ? [result.error] : undefined,
        provider: 'gemini-cli',
        model: 'gemini-cli',
    };
}

// ─── Core Execution ──────────────────────────────────────

/**
 * Execute Gemini CLI with a prompt, working in the given directory.
 * Writes the prompt to a temp file and passes it via the --prompt flag.
 */
async function executeGeminiCLI(prompt: string, workDir: string): Promise<GeminiCLIResult> {
    const startTime = Date.now();

    // Write prompt to a temp file
    const promptFile = join(tmpdir(), `factory-gemini-${Date.now()}.md`);
    writeFileSync(promptFile, prompt);

    return new Promise((resolvePromise) => {
        log('→', 'Spawning Gemini CLI...');

        const child = spawn('gemini', ['--prompt', `@${promptFile}`, '--sandbox', 'false'], {
            cwd: workDir,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env },
            shell: '/bin/bash',
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data: Buffer) => {
            const chunk = data.toString();
            stdout += chunk;
            // Log progress markers
            const lines = chunk.split('\n').filter(Boolean);
            for (const line of lines) {
                if (line.includes('✓') || line.includes('Created') || line.includes('Writing') || line.includes('Installing')) {
                    log('  ', `  [gemini] ${line.trim().slice(0, 120)}`);
                }
            }
        });

        child.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
        });

        child.on('close', (code: number | null) => {
            const durationMs = Date.now() - startTime;

            // Clean up temp file
            try { execSync(`rm -f '${promptFile}'`, { stdio: 'pipe' }); } catch { /* ignore */ }

            if (code === 0) {
                log('✓', `Gemini CLI completed in ${(durationMs / 1000).toFixed(1)}s`);
                resolvePromise({
                    success: true,
                    filesGenerated: [],
                    output: stdout,
                    durationMs,
                });
            } else {
                const errorMsg = stderr.trim() || `Gemini CLI exited with code ${code}`;
                logError(`Gemini CLI failed: ${errorMsg.slice(0, 200)}`);
                resolvePromise({
                    success: false,
                    filesGenerated: [],
                    output: stdout + '\n' + stderr,
                    durationMs,
                    error: errorMsg.slice(0, 500),
                });
            }
        });

        child.on('error', (err: Error) => {
            const durationMs = Date.now() - startTime;
            try { execSync(`rm -f '${promptFile}'`, { stdio: 'pipe' }); } catch { /* ignore */ }
            resolvePromise({
                success: false,
                filesGenerated: [],
                output: '',
                durationMs,
                error: `Failed to spawn Gemini CLI: ${err.message}`,
            });
        });
    });
}

// ─── File Scanning ───────────────────────────────────────

/** Scan all files in a directory (relative paths), excluding node_modules/.git */
function scanAllFiles(dir: string, prefix = ''): string[] {
    const results: string[] = [];
    if (!existsSync(dir)) return results;

    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.factory') continue;
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            results.push(...scanAllFiles(join(dir, entry.name), relPath));
        } else {
            results.push(relPath);
        }
    }
    return results;
}

/** Scan generated files and read their content. */
function scanGeneratedFiles(dir: string): GeneratedFile[] {
    const paths = scanAllFiles(dir);
    return paths.map(p => ({
        filename: p,
        content: readFileSync(join(dir, p), 'utf-8'),
    }));
}
