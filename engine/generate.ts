/**
 * LLM Generation Pipeline — the core of the factory.
 *
 * Autonomous loop: Plan → Build → Test → Iterate → Done
 *
 * Reuses proven provider calls (Gemini, OpenAI, Ollama) from the
 * original engine. New: planning step, test step, iteration loop.
 */

import type {
    AppSpec, FeatureSpec, ProjectContext,
    GeneratedFile, BuildPlan, BuildResult,
    LLMProvider,
} from './types.ts';
import { specSlug, specPort } from './types.ts';
import { loadSettings, getActiveProvider } from './config.ts';
import { log, logStep, logError } from './log.ts';

const MAX_ITERATIONS = 3;

// ─── Main Pipeline ───────────────────────────────────────

/**
 * Run the full autonomous build pipeline for an app spec.
 *
 * Gather context → Plan → Build → Test → Iterate → Return files
 */
export async function runPipeline(
    spec: AppSpec,
    context: ProjectContext,
): Promise<BuildResult> {
    const { provider, model } = requireActiveProvider();
    const slug = specSlug(spec);

    log('●', `Using ${provider.name} → ${model}`);

    // Step 1: Plan
    logStep(1, 5, 'Planning build...');
    const plan = await planBuild(spec, context, provider, model);
    log('✓', `Plan: ${plan.files.length} files, ${plan.decisions.length} decisions`);

    // Step 2: Build (first attempt)
    logStep(2, 5, 'Generating code...');
    let files = await executeBuild(spec, context, plan, provider, model);
    log('✓', `Generated ${files.length} files`);

    // Step 3+4: Test → Iterate loop
    let iteration = 0;
    let errors: string[] = [];

    while (iteration < MAX_ITERATIONS) {
        logStep(3 + Math.min(iteration, 1), 5, iteration === 0 ? 'Testing build...' : `Iterating (attempt ${iteration + 1}/${MAX_ITERATIONS})...`);
        errors = testBuild(files, spec.stack);

        if (errors.length === 0) {
            log('✓', 'All tests passed!');
            break;
        }

        log('!', `${errors.length} error(s) found`);
        for (const err of errors.slice(0, 5)) {
            log('  ', `  ${err}`);
        }

        if (iteration + 1 >= MAX_ITERATIONS) {
            logError(`Max iterations (${MAX_ITERATIONS}) reached. Returning best effort.`);
            break;
        }

        iteration++;
        log('●', `Feeding errors back to LLM...`);
        files = await iterateBuild(spec, context, plan, files, errors, provider, model);
        log('✓', `Regenerated ${files.length} files`);
    }

    return {
        success: errors.length === 0,
        files,
        plan,
        iterations: iteration + 1,
        errors: errors.length > 0 ? errors : undefined,
    };
}

/**
 * Run the pipeline for a feature spec.
 * Similar flow but with a feature-specific prompt.
 */
export async function runFeaturePipeline(
    spec: FeatureSpec,
    context: ProjectContext,
): Promise<BuildResult> {
    const { provider, model } = requireActiveProvider();

    log('●', `Feature build: ${spec.feature.name} → ${spec.target.app}`);

    // Build prompt for feature generation
    const prompt = buildFeaturePrompt(spec, context);
    const raw = await callProvider(provider, model, prompt);
    const files = parseGeneratedFiles(raw);

    if (files.length === 0) {
        throw new Error('LLM response did not contain any parseable files.');
    }

    return {
        success: true,
        files,
        plan: {
            files: files.map(f => f.filename),
            architecture: `Feature: ${spec.feature.name}`,
            decisions: [],
        },
        iterations: 1,
    };
}

// ─── Plan ────────────────────────────────────────────────

/**
 * Ask the LLM to create a build plan before generating code.
 */
async function planBuild(
    spec: AppSpec,
    context: ProjectContext,
    provider: LLMProvider,
    model: string,
): Promise<BuildPlan> {
    const contextBlock = formatContext(context);
    const specBlock = formatSpec(spec);

    const prompt = `You are a senior architect planning a new application build.

Given the following spec and project context, create a build plan.

${specBlock}

${contextBlock}

Respond in this exact JSON format only:
{
  "files": ["list", "of", "file", "paths", "to", "generate"],
  "architecture": "Brief description of the architecture approach",
  "decisions": ["Key decision 1", "Key decision 2"]
}

Output ONLY the JSON. No markdown, no explanation.`;

    const raw = await callProvider(provider, model, prompt);

    try {
        // Strip markdown code fences if present
        const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        return JSON.parse(cleaned) as BuildPlan;
    } catch {
        // If parsing fails, create a sensible default plan
        log('!', 'Could not parse plan JSON — using default plan');
        return {
            files: ['package.json', 'tsconfig.json', 'src/app/layout.tsx', 'src/app/page.tsx'],
            architecture: `${spec.stack.framework} app with ${spec.stack.database || 'local state'}`,
            decisions: ['Using spec defaults'],
        };
    }
}

// ─── Build ───────────────────────────────────────────────

/**
 * Generate code files from spec + plan + context.
 */
async function executeBuild(
    spec: AppSpec,
    context: ProjectContext,
    plan: BuildPlan,
    provider: LLMProvider,
    model: string,
): Promise<GeneratedFile[]> {
    const prompt = buildAppPrompt(spec, context, plan);

    log('  ', `  Prompt: ${prompt.length} chars`);

    const raw = await callProvider(provider, model, prompt);
    log('✓', `Response received (${raw.length} chars)`);

    const files = parseGeneratedFiles(raw);
    if (files.length === 0) {
        throw new Error(
            'LLM response contained no parseable files.\n' +
            'Try a different model or check the spec.'
        );
    }

    return files;
}

// ─── Test ────────────────────────────────────────────────

import { mkdtempSync, writeFileSync as fsWrite, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import type { StackConfig } from './types.ts';

/**
 * Map user-facing tool names to actual commands.
 */
function lintCommand(linter: string | undefined): string | null {
    if (!linter) return null;
    const map: Record<string, string> = {
        'eslint': 'npx eslint . --max-warnings=0',
        'biome': 'npx @biomejs/biome check .',
        'oxlint': 'npx oxlint .',
        'prettier': 'npx prettier --check .',
        'none': '',
    };
    return map[linter.toLowerCase()] || `npx ${linter}`;
}

function testCommand(testing: string | undefined): string | null {
    if (!testing) return null;
    const map: Record<string, string> = {
        'vitest': 'npx vitest run --reporter=verbose',
        'jest': 'npx jest --forceExit',
        'playwright': 'npx playwright test',
        'cypress': 'npx cypress run',
        'none': '',
    };
    return map[testing.toLowerCase()] || `npx ${testing}`;
}

function packageInstallCommand(pm: string | undefined): string {
    switch (pm?.toLowerCase()) {
        case 'pnpm': return 'pnpm install --no-frozen-lockfile';
        case 'yarn': return 'yarn install --no-immutable';
        case 'bun': return 'bun install';
        default: return 'npm install --legacy-peer-deps';
    }
}

/**
 * Test the generated files for real.
 *
 * Phase 1: Structural checks (fast, no I/O)
 * Phase 2: Write to temp dir, npm install, tsc, lint, test
 *
 * Returns a list of error messages. Empty = all good.
 */
function testBuild(files: GeneratedFile[], stack: StackConfig): string[] {
    const errors: string[] = [];

    // ── Phase 1: Structural checks ──

    const pkg = files.find(f => f.filename === 'package.json');
    if (!pkg) {
        errors.push('Missing package.json');
    } else {
        try { JSON.parse(pkg.content); }
        catch { errors.push('package.json is not valid JSON'); }
    }

    // Only require tsconfig for TypeScript projects
    const isTS = (stack.language?.toLowerCase() ?? 'typescript') !== 'javascript';
    if (isTS) {
        const tsconfig = files.find(f => f.filename === 'tsconfig.json');
        if (!tsconfig) errors.push('Missing tsconfig.json');
    }

    for (const file of files) {
        if (file.content.trim().length === 0) {
            errors.push(`Empty file: ${file.filename}`);
        }
    }

    for (const file of files) {
        if (file.filename.endsWith('.json')) {
            try { JSON.parse(file.content); }
            catch { errors.push(`Invalid JSON: ${file.filename}`); }
        }
    }

    // Bail early on structural failures — no point running tools
    if (errors.length > 0) return errors;

    // ── Phase 2: Real toolchain validation ──

    const tmpDir = mkdtempSync(join(tmpdir(), 'factory-test-'));
    log('●', `Testing in ${tmpDir}`);

    // Write all generated files to temp dir
    for (const file of files) {
        const absPath = join(tmpDir, file.filename);
        const dir = dirname(absPath);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        fsWrite(absPath, file.content);
    }

    // Step 1: Package install
    const installCmd = packageInstallCommand(stack.packageManager);
    try {
        logStep(0, 0, `Running ${installCmd}...`);
        execSync(installCmd, { cwd: tmpDir, stdio: 'pipe', timeout: 120_000 });
        log('✓', 'Package install succeeded');
    } catch (err) {
        const msg = err instanceof Error ? (err as any).stderr?.toString() || err.message : String(err);
        errors.push(`Package install failed: ${msg.slice(0, 300)}`);
        return errors; // Can't continue without deps
    }

    // Step 2: TypeScript check
    if (isTS) {
        try {
            logStep(0, 0, 'Running tsc --noEmit...');
            execSync('npx tsc --noEmit', { cwd: tmpDir, stdio: 'pipe', timeout: 60_000 });
            log('✓', 'TypeScript check passed');
        } catch (err) {
            const msg = err instanceof Error ? (err as any).stdout?.toString() || err.message : String(err);
            // Extract just the error lines
            const tsErrors = msg.split('\n')
                .filter((l: string) => l.includes('error TS'))
                .slice(0, 10)
                .join('\n');
            errors.push(`TypeScript errors:\n${tsErrors || msg.slice(0, 500)}`);
        }
    }

    // Step 3: Lint (if configured)
    const lint = lintCommand(stack.linter);
    if (lint) {
        try {
            logStep(0, 0, `Running ${stack.linter} linter...`);
            execSync(lint, { cwd: tmpDir, stdio: 'pipe', timeout: 60_000 });
            log('✓', 'Lint passed');
        } catch (err) {
            const msg = err instanceof Error ? (err as any).stdout?.toString() || err.message : String(err);
            errors.push(`Lint errors (${stack.linter}):\n${msg.slice(0, 500)}`);
        }
    }

    // Step 4: Test (if configured)
    const test = testCommand(stack.testing);
    if (test) {
        try {
            logStep(0, 0, `Running ${stack.testing} tests...`);
            execSync(test, { cwd: tmpDir, stdio: 'pipe', timeout: 120_000 });
            log('✓', 'Tests passed');
        } catch (err) {
            const msg = err instanceof Error ? (err as any).stdout?.toString() || err.message : String(err);
            errors.push(`Test failures (${stack.testing}):\n${msg.slice(0, 500)}`);
        }
    }

    return errors;
}

// ─── Iterate ─────────────────────────────────────────────

/**
 * Feed errors back to the LLM and ask it to fix the files.
 */
async function iterateBuild(
    spec: AppSpec,
    context: ProjectContext,
    plan: BuildPlan,
    previousFiles: GeneratedFile[],
    errors: string[],
    provider: LLMProvider,
    model: string,
): Promise<GeneratedFile[]> {
    const filesSummary = previousFiles.map(f => `- ${f.filename} (${f.content.length} chars)`).join('\n');

    const prompt = `You previously generated code for an application. There were errors that need fixing.

## Original Spec
- App: ${spec.appName}
- Framework: ${spec.stack.framework}
- Database: ${spec.stack.database || 'local state'}

## Files Generated
${filesSummary}

## Errors Found
${errors.map(e => `- ${e}`).join('\n')}

## Instructions
Fix ALL the errors listed above. Regenerate the complete set of files with corrections applied.
Maintain the same architecture and file structure.

Output EVERY file using this exact format:

===FILE: path/to/file.ext===
(file content here)
===END_FILE===

Output ONLY the files. No explanations.`;

    const raw = await callProvider(provider, model, prompt);
    const files = parseGeneratedFiles(raw);

    if (files.length === 0) {
        log('!', 'Iteration produced no files — keeping previous version');
        return previousFiles;
    }

    return files;
}

// ─── Prompt Builders ─────────────────────────────────────

function buildAppPrompt(spec: AppSpec, context: ProjectContext, plan: BuildPlan): string {
    const specBlock = formatSpec(spec);
    const contextBlock = formatContext(context);
    const planBlock = `## Build Plan\n- Architecture: ${plan.architecture}\n- Files to generate: ${plan.files.join(', ')}\n- Decisions: ${plan.decisions.join('; ')}`;

    return `You are a senior full-stack developer. Generate a complete, production-ready application based on the following specification, plan, and project context.

${specBlock}

${planBlock}

${contextBlock}

## Requirements

1. Follow the framework and stack specified
2. Generate ALL files needed for a working application
3. Include proper TypeScript types for all models
4. The app should work out of the box with package install + dev server
5. Follow the conventions and patterns from the project context if provided
6. Use modern, clean code with proper error handling

## Output Format

Output EVERY file with this exact delimiter format:

===FILE: path/to/file.ext===
(file content here)
===END_FILE===

Do NOT include any explanatory text outside of the file delimiters. Output ONLY the files.`;
}

function buildFeaturePrompt(spec: FeatureSpec, context: ProjectContext): string {
    const contextBlock = formatContext(context);

    return `You are a senior full-stack developer. Generate a new feature for an existing application.

## Feature
- Name: ${spec.feature.name}
- Slug: ${spec.feature.slug}
- Target App: ${spec.target.app}

${spec.model ? `## Data Model
- Collection: ${spec.model.collection}
- Fields:
${spec.model.fields.map(f => `  - ${f.name}: ${f.type}${f.required ? ' (required)' : ''}`).join('\n')}` : ''}

${spec.pages ? `## Pages
${spec.pages.map(p => `- ${p.title} (${p.type}) at /${p.slug}`).join('\n')}` : ''}

${contextBlock}

## Output Format

===FILE: path/to/file.ext===
(file content here)
===END_FILE===

Output ONLY the files. No explanations.`;
}

function formatSpec(spec: AppSpec): string {
    const slug = specSlug(spec);
    const port = specPort(spec);
    const tables = spec.data?.tables || [];

    const tableDefs = tables.map(t => {
        const fields = Object.entries(t.fields)
            .map(([name, def]) => `      ${name}: ${def.type}${def.required ? ' (required)' : ''}${def.default !== undefined ? ` [default: ${def.default}]` : ''}`)
            .join('\n');
        return `    - ${t.name}\n${fields}`;
    }).join('\n');

    const layoutInfo = spec.layout
        ? `- Sidebar: ${spec.layout.sidebar ? 'yes' : 'no'}\n- Topbar: ${spec.layout.topbar ? 'yes' : 'no'}`
        : '- Include a navigation sidebar';

    const authInfo = spec.auth
        ? `- Auth provider: ${spec.auth.provider}\n- Methods: ${Object.entries(spec.auth.methods || {}).filter(([, v]) => v).map(([k]) => k).join(', ') || 'email'}`
        : '- No auth required';

    return `## Application Specification

- **Name**: ${spec.appName}
- **Slug**: ${slug}
- **Description**: ${spec.description}
- **Port**: ${port}

### Stack
- Framework: ${spec.stack.framework}
- Package Manager: ${spec.stack.packageManager || 'npm'}
- Language: ${spec.stack.language || 'typescript'}
- Database: ${spec.stack.database || 'none'}
- Cloud: ${spec.stack.cloud || 'none'}

### Frontend
- UI: ${spec.frontend?.ui || 'tailwind'}
- Theme: ${spec.frontend?.theme || 'light'}

### Layout
${layoutInfo}

### Authentication
${authInfo}

### Data Model
${tableDefs || '    No tables defined — use in-memory state.'}`;
}

function formatContext(context: ProjectContext): string {
    if (context.knowledgeFiles.length === 0 && context.conventions.length === 0) {
        return '';
    }

    let block = '## Project Context\n\n';

    if (context.stack) {
        block += `### Stack: ${context.stack.framework}, ${context.stack.packageManager || 'npm'}\n\n`;
    }

    if (context.conventions.length > 0) {
        block += '### Conventions\n\n';
        for (const conv of context.conventions) {
            block += conv + '\n\n';
        }
    }

    if (context.knowledgeFiles.length > 0) {
        block += '### Existing App Knowledge\n\n';
        for (const kf of context.knowledgeFiles) {
            block += `#### ${kf.app} (${kf.filename})\n\n${kf.content}\n\n`;
        }
    }

    return block;
}

// ─── Provider Calls ──────────────────────────────────────

function requireActiveProvider(): { provider: LLMProvider; model: string } {
    const settings = loadSettings();
    if (!settings.activeProvider || !settings.buildModel) {
        throw new Error(
            'No active model set.\n' +
            'Go to Settings → enable a provider → click "Set as Default".'
        );
    }
    const provider = getActiveProvider(settings);
    if (!provider) {
        throw new Error(`Provider "${settings.activeProvider}" is not enabled.`);
    }
    return { provider, model: settings.buildModel };
}

async function callProvider(provider: LLMProvider, model: string, prompt: string): Promise<string> {
    switch (provider.id) {
        case 'gemini':
            if (!provider.apiKey) throw new Error('Gemini API key not configured');
            return callGemini(provider.apiKey, model, prompt);
        case 'openai':
            if (!provider.apiKey) throw new Error('OpenAI API key not configured');
            return callOpenAI(provider.apiKey, model, prompt);
        case 'ollama':
            return callOllama(provider.baseUrl || 'http://localhost:11434', model, prompt);
        default:
            throw new Error(`Unknown provider: ${provider.id}`);
    }
}

async function callGemini(apiKey: string, model: string, prompt: string): Promise<string> {
    log('→', `Calling Gemini (${model})...`);

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { maxOutputTokens: 65536, temperature: 0.2 },
            }),
        }
    );

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Gemini API error (${res.status}): ${body.slice(0, 300)}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini returned empty response');

    const usage = data.usageMetadata;
    if (usage) {
        log('  ', `  Tokens: ${usage.promptTokenCount || '?'} in / ${usage.candidatesTokenCount || '?'} out`);
    }

    return text;
}

async function callOpenAI(apiKey: string, model: string, prompt: string): Promise<string> {
    log('→', `Calling OpenAI (${model})...`);

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: 'You are a senior full-stack developer who generates complete, working code. Output only file contents in the exact format requested.' },
                { role: 'user', content: prompt },
            ],
            max_tokens: 16384,
            temperature: 0.2,
        }),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`OpenAI API error (${res.status}): ${body.slice(0, 300)}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('OpenAI returned empty response');

    const usage = data.usage;
    if (usage) {
        log('  ', `  Tokens: ${usage.prompt_tokens || '?'} in / ${usage.completion_tokens || '?'} out`);
    }

    return text;
}

async function callOllama(baseUrl: string, model: string, prompt: string): Promise<string> {
    log('→', `Calling Ollama (${model}) at ${baseUrl}...`);

    const res = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            prompt,
            stream: false,
            options: { temperature: 0.2, num_predict: 16384 },
        }),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Ollama error (${res.status}): ${body.slice(0, 300)}`);
    }

    const data = await res.json();
    const text = data.response;
    if (!text) throw new Error('Ollama returned empty response');

    if (data.eval_count) {
        log('  ', `  Tokens generated: ${data.eval_count}`);
    }

    return text;
}

// ─── Response Parser ─────────────────────────────────────

/** Parse ===FILE: path=== ... ===END_FILE=== blocks from LLM output */
export function parseGeneratedFiles(raw: string): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    const regex = /===FILE:\s*(.+?)===\n([\s\S]*?)===END_FILE===/g;
    let match;

    while ((match = regex.exec(raw)) !== null) {
        const filename = match[1].trim();
        let content = match[2];

        // Remove trailing newline before END_FILE
        if (content.endsWith('\n')) {
            content = content.slice(0, -1);
        }

        files.push({ filename, content });
    }

    if (files.length === 0) {
        // Fallback: try code blocks with file paths
        const codeBlockRegex = /```(?:\w+)?\n\/\/\s*(.+?)\n([\s\S]*?)```/g;
        while ((match = codeBlockRegex.exec(raw)) !== null) {
            files.push({
                filename: match[1].trim(),
                content: match[2].trim(),
            });
        }
    }

    return files;
}
