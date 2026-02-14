/**
 * LLM Generation Engine — generates a full Next.js app from an AppSpec
 * using the configured AI model (Gemini, OpenAI, or Ollama).
 *
 * This replaces the template-based scaffold + customize flow when no
 * starter template is available.
 */

import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import type { AppSpec } from './types.ts';
import { PATHS, ensureDir, writeFile, log, FACTORY_ROOT } from './utils.ts';

// ─── Types ────────────────────────────────────────────────

interface LLMProvider {
    id: string;
    name: string;
    enabled: boolean;
    apiKey?: string;
    baseUrl?: string;
    models: { id: string; name: string }[];
    defaultModel?: string;
}

interface FactorySettings {
    providers: LLMProvider[];
    activeProvider: string;
    buildModel: string;
}

export interface GeneratedFile {
    filename: string;
    content: string;
}

export interface GenerationResult {
    outputDir: string;
    files: string[];
    model: string;
    provider: string;
    tokensUsed?: number;
}

// ─── Settings ─────────────────────────────────────────────

const SETTINGS_FILE = resolve(FACTORY_ROOT, 'settings.json');

function loadSettings(): FactorySettings {
    if (!existsSync(SETTINGS_FILE)) {
        throw new Error(
            'No LLM model configured.\n' +
            'Go to Settings in the Factory UI to configure a provider (Gemini, OpenAI, or Ollama).'
        );
    }
    return JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8'));
}

function getActiveProvider(): { provider: LLMProvider; model: string } {
    const settings = loadSettings();
    if (!settings.activeProvider || !settings.buildModel) {
        throw new Error(
            'No active model set.\n' +
            'Go to Settings → enable a provider → click "Set as Default".'
        );
    }
    const provider = settings.providers.find(
        p => p.id === settings.activeProvider && p.enabled
    );
    if (!provider) {
        throw new Error(`Provider "${settings.activeProvider}" is not enabled.`);
    }
    return { provider, model: settings.buildModel };
}

// ─── Prompt Builder ───────────────────────────────────────

function buildPrompt(spec: AppSpec): string {
    const resourceDefs = (spec.api?.resources || []).map(r => {
        const fields = Object.entries(r.fields)
            .map(([name, def]) => `      ${name}: ${def.type}${def.required ? ' (required)' : ''}${def.default !== undefined ? ` [default: ${def.default}]` : ''}`)
            .join('\n');
        return `    - ${r.name} (collection: ${r.collection})\n${fields}`;
    }).join('\n');

    return `You are a senior full-stack developer. Generate a complete, production-ready Next.js 14+ application based on the following specification.

## Application Specification

- **Name**: ${spec.metadata.name}
- **Slug**: ${spec.metadata.slug}
- **Description**: ${spec.metadata.description}
- **Port**: ${spec.deployment.port}
- **Color/Brand**: ${spec.metadata.color}

### Data Model
${resourceDefs || '    No resources defined.'}

## Requirements

1. Use **Next.js 14+ App Router** with TypeScript
2. Use **Tailwind CSS** for styling
3. Create a modern, beautiful UI with the brand color ${spec.metadata.color}
4. Include a dashboard/home page showing a summary
5. Include full CRUD pages for each resource (list, create, edit, delete)
6. Use **local state** (React useState/useReducer) for data storage — no external database needed
7. Include proper TypeScript types for all models
8. Include a layout with navigation sidebar
9. Add a \`package.json\` with all necessary dependencies (next, react, typescript, tailwindcss, etc.)
10. Add \`tsconfig.json\`, \`next.config.ts\`, \`tailwind.config.ts\`, and \`postcss.config.mjs\`
11. The app should be fully functional out of the box with \`npm install && npm run dev\`

## Output Format

Output EVERY file with this exact delimiter format:

===FILE: path/to/file.ext===
(file content here)
===END_FILE===

For example:
===FILE: package.json===
{
  "name": "my-app",
  "version": "1.0.0"
}
===END_FILE===

===FILE: src/app/page.tsx===
export default function Home() { ... }
===END_FILE===

Generate ALL files needed for a working application. Include at minimum:
- package.json
- tsconfig.json
- next.config.ts
- tailwind.config.ts
- postcss.config.mjs
- src/app/layout.tsx (with sidebar navigation)
- src/app/page.tsx (dashboard)
- src/app/globals.css (with Tailwind directives + custom styles)
- Type definitions for each resource
- CRUD pages for each resource
- A reusable data store (React context or simple state management)

Do NOT include any explanatory text outside of the file delimiters. Output ONLY the files.`;
}

// ─── Provider API Calls ───────────────────────────────────

async function callGemini(apiKey: string, model: string, prompt: string): Promise<string> {
    log('→', `Calling Gemini (${model})...`);

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    maxOutputTokens: 65536,
                    temperature: 0.2,
                },
            }),
        }
    );

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Gemini API error (${res.status}): ${body.slice(0, 300)}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
        throw new Error('Gemini returned empty response');
    }

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
    if (!text) {
        throw new Error('OpenAI returned empty response');
    }

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
            options: {
                temperature: 0.2,
                num_predict: 16384,
            },
        }),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Ollama error (${res.status}): ${body.slice(0, 300)}`);
    }

    const data = await res.json();
    const text = data.response;
    if (!text) {
        throw new Error('Ollama returned empty response');
    }

    if (data.eval_count) {
        log('  ', `  Tokens generated: ${data.eval_count}`);
    }

    return text;
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

// ─── Response Parser ──────────────────────────────────────

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
        // Fallback: try to find code blocks with file paths
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

// ─── Main Entry Point ─────────────────────────────────────

/**
 * Generate a full app using the configured LLM provider.
 */
export async function generateWithLLM(
    spec: AppSpec,
    targetDir?: string,
): Promise<GenerationResult> {
    const { provider, model } = getActiveProvider();

    log('●', `Using ${provider.name} → ${model}`);
    log('  ', `  Generating ${spec.metadata.name} (${spec.metadata.slug})...`);

    // Build prompt
    const prompt = buildPrompt(spec);
    log('  ', `  Prompt: ${prompt.length} chars`);

    // Call LLM
    const raw = await callProvider(provider, model, prompt);
    log('✓', `Response received (${raw.length} chars)`);

    // Parse files
    const generatedFiles = parseGeneratedFiles(raw);
    if (generatedFiles.length === 0) {
        throw new Error(
            'LLM response did not contain any parseable files.\n' +
            'The model may not have followed the output format. Try again or use a different model.'
        );
    }
    log('✓', `Parsed ${generatedFiles.length} files from response`);

    // Write to target directory (project repo) or fallback to output/
    const outputDir = targetDir || resolve(PATHS.output, spec.metadata.slug);
    ensureDir(outputDir);

    const writtenFiles: string[] = [];
    for (const file of generatedFiles) {
        const filePath = resolve(outputDir, file.filename);
        writeFile(filePath, file.content);
        writtenFiles.push(file.filename);
        log('  ', `  ✓ ${file.filename}`);
    }

    return {
        outputDir,
        files: writtenFiles,
        model,
        provider: provider.id,
    };
}
