/**
 * LLM Generation Engine — generates a full Next.js app from an AppSpec
 * using the configured AI model (Gemini, OpenAI, or Ollama).
 *
 * This replaces the template-based scaffold + customize flow when no
 * starter template is available.
 */

import { resolve } from 'node:path';
import type { AppSpec } from './types.ts';
import { specSlug, specPort } from './types.ts';
import { PATHS, ensureDir, writeFile, log } from './utils.ts';
import type { LLMProvider, FactorySettings } from './llm-config.ts';
import { loadSettings, getActiveProvider } from './llm-config.ts';

// ─── Types ────────────────────────────────────────────────

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

/**
 * Require an active, enabled provider with a build model set.
 * Throws with a user-friendly message if not configured.
 */
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

// ─── Prompt Builder ───────────────────────────────────────

function buildPrompt(spec: AppSpec): string {
    const slug = specSlug(spec);
    const port = specPort(spec);
    const tables = spec.data?.tables || [];

    const tableDefs = tables.map(t => {
        const fields = Object.entries(t.fields)
            .map(([name, def]) => `      ${name}: ${def.type}${def.required ? ' (required)' : ''}${def.default !== undefined ? ` [default: ${def.default}]` : ''}`)
            .join('\n');
        return `    - ${t.name}\n${fields}`;
    }).join('\n');

    const dashboardPages = spec.pages?.dashboard?.map(p => `    - ${p}`).join('\n') || '    - Overview with key metrics';
    const customPages = spec.pages?.custom?.map(p => `    - ${p}`).join('\n') || '';
    const crudTables = spec.pages?.crud?.map(c => c.table).join(', ') || tables.map(t => t.name).join(', ');

    const layoutInfo = spec.layout
        ? `- Sidebar: ${spec.layout.sidebar ? 'yes' : 'no'}\n- Topbar: ${spec.layout.topbar ? 'yes' : 'no'}\n- Bottombar: ${spec.layout.bottombar ? 'yes' : 'no'}`
        : '- Include a navigation sidebar';

    const uiLib = spec.frontend?.ui || 'tailwind';
    const theme = spec.frontend?.theme || 'light';
    const fonts = spec.frontend?.fonts?.join(', ') || 'Inter';

    const authInfo = spec.auth
        ? `- Auth provider: ${spec.auth.provider}\n- Methods: ${Object.entries(spec.auth.methods || {}).filter(([,v]) => v).map(([k]) => k).join(', ') || 'email'}\n- Pages: ${Object.entries(spec.auth.pages || {}).filter(([,v]) => v).map(([k]) => k).join(', ') || 'login, signup'}`
        : '- No auth required';

    return `You are a senior full-stack developer. Generate a complete, production-ready Next.js 14+ application based on the following specification.

## Application Specification

- **Name**: ${spec.appName}
- **Slug**: ${slug}
- **Description**: ${spec.description}
- **Port**: ${port}

### Stack
- Framework: ${spec.stack.framework}
- Package Manager: ${spec.stack.packageManager}
- Language: ${spec.stack.language || 'typescript'}
- Database: ${spec.stack.database || 'none'}
- Cloud: ${spec.stack.cloud || 'none'}

### Frontend
- UI Library: ${uiLib}
- Theme: ${theme}
- Fonts: ${fonts}

### Layout
${layoutInfo}

### Authentication
${authInfo}

### Data Model
${tableDefs || '    No tables defined — use in-memory state.'}

### Pages
Dashboard pages:
${dashboardPages}
${crudTables ? `\nCRUD pages for: ${crudTables}` : ''}
${customPages ? `\nCustom pages:\n${customPages}` : ''}

## Requirements

1. Use **Next.js 14+ App Router** with TypeScript
2. Use **${uiLib}** for styling
3. Create a modern, beautiful UI with **${theme}** theme
4. Use **${fonts}** font family
5. Include full CRUD pages for each data table (list, create, edit, delete)
6. Use **local state** (React useState/useReducer) for data storage — no external database needed
7. Include proper TypeScript types for all models
8. Add a \`package.json\` with all necessary dependencies
9. Add \`tsconfig.json\`, \`next.config.ts\`, and relevant config files
10. The app should be fully functional out of the box with \`npm install && npm run dev\`

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
- src/app/layout.tsx (with navigation)
- src/app/page.tsx (dashboard)
- src/app/globals.css
- Type definitions for each data table
- CRUD pages for each table
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
    const slug = specSlug(spec);
    const { provider, model } = requireActiveProvider();

    log('●', `Using ${provider.name} → ${model}`);
    log('  ', `  Generating ${spec.appName} (${slug})...`);

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
    const outputDir = targetDir || resolve(PATHS.output, slug);
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
