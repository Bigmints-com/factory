/**
 * POST /api/chat — Streaming LLM chat for spec generation
 *
 * Reads the active provider + API key from settings.json,
 * sends a system prompt instructing the LLM to generate Factory-compatible YAML,
 * and returns a streaming response.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const FACTORY_ROOT = resolve(process.cwd(), '..');

/**
 * Read the active project's bridge config (factory.yaml) inline,
 * since importing from the engine is outside Next.js's module boundary.
 */
function getActiveBridgeConfig(): { stack?: Record<string, string> } | null {
  try {
    const projectsPath = join(FACTORY_ROOT, 'projects.json');
    if (!existsSync(projectsPath)) return null;
    const config = JSON.parse(readFileSync(projectsPath, 'utf-8'));
    if (!config.activeProject) return null;
    const project = config.projects?.find((p: any) => p.id === config.activeProject);
    if (!project) return null;

    // Read factory.yaml from the project's .factory dir
    const factoryYaml = join(project.path, '.factory', 'factory.yaml');
    if (existsSync(factoryYaml)) {
      const bridge = parseYaml(readFileSync(factoryYaml, 'utf-8'));
      return { stack: { ...project.stack, ...bridge?.stack } };
    }
    return { stack: project.stack };
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT_NEW_APP = `You are an expert software architect for SaveADay Factory.
Your task is to DECOMPOSE user requirements into modular, buildable specs.

When the user describes an application, you MUST output:
1. ONE app spec (the core project definition with data model)
2. MULTIPLE feature specs (each a focused, independently buildable module)

Use this EXACT output format with delimiters:

=== APP_SPEC: app-name.yaml ===
\`\`\`yaml
appName: "App Name"
description: "Brief description of the overall application"

stack:
  framework: next.js
  packageManager: pnpm
  language: typescript
  linter: eslint
  testing: vitest

data:
  tables:
    - name: table_name
      fields:
        fieldName: { type: string, required: true }
        anotherField: { type: number, default: 0 }

deployment:
  port: 3050

status: draft
\`\`\`
=== END_SPEC ===

=== FEATURE_SPEC: feature-slug.yaml ===
\`\`\`yaml
feature:
  name: "Feature Name"
  slug: feature-slug

target:
  app: app-name

phase: 1

dependsOn: []

description: >
  What this feature does and why it exists.

dependencies:
  - "npm-package-name"

modules:
  - name: ModuleName
    path: src/path/to/module.ts
    description: >
      What this module does. Key functions and interfaces it exposes.

behavior:
  - How the feature behaves in specific scenarios
  - Edge cases and important rules

config:
  settingName: defaultValue

status: draft
\`\`\`
=== END_SPEC ===

RULES:
- Break down the app into SMALL, FOCUSED features. Each feature should be independently buildable.
- Assign phases logically: Phase 1 = core/foundational, Phase 2 = extended capabilities, Phase 3 = polish/optional.
- Each feature spec must include: description, modules (with file paths), behavior rules, and config.
- Use meaningful names and slugs (kebab-case for slugs).
- The app spec contains the data model (tables) and stack config. Features reference the app via target.app.
- Include 3-8 feature specs depending on complexity. Don't make features too large.
- After all spec blocks, write a brief summary explaining the decomposition rationale and phase strategy.
- Data types for fields: string, number, boolean, array.
- Set deployment port between 3050-3099.
- IMPORTANT: Use \`dependsOn\` to list the slugs of other feature specs that MUST be built BEFORE this one. If a feature has no dependencies, use an empty array \`[]\`. The engine enforces this ordering — a spec will NOT build until all its dependencies are completed.
- Example: A "dashboard" feature (phase 2) that needs auth and data-models would have: \`dependsOn: [auth-system, data-models]\`

Be thorough, creative, and production-ready.`;

const SYSTEM_PROMPT_EXISTING_APP = `You are an expert software architect for SaveADay Factory.
The user has an EXISTING application. Your task is to DECOMPOSE their new requirements into modular FEATURE SPECS that integrate with the existing app.

Do NOT generate an app spec — one already exists. Only generate feature specs.

Use this EXACT output format with delimiters:

=== FEATURE_SPEC: feature-slug.yaml ===
\`\`\`yaml
feature:
  name: "Feature Name"
  slug: feature-slug

target:
  app: EXISTING_APP_NAME

phase: 1

dependsOn: []

description: >
  What this feature does and why it exists.

dependencies:
  - "npm-package-name"

modules:
  - name: ModuleName
    path: src/path/to/module.ts
    description: >
      What this module does. Key functions and interfaces it exposes.

behavior:
  - How the feature behaves in specific scenarios
  - Edge cases and important rules

config:
  settingName: defaultValue

status: draft
\`\`\`
=== END_SPEC ===

RULES:
- Break down requirements into SMALL, FOCUSED features. Each feature should be independently buildable.
- Assign phases logically: Phase 1 = core/foundational, Phase 2 = extended capabilities, Phase 3 = polish/optional.
- Each feature spec must include: description, modules (with file paths), behavior rules, and config.
- Use meaningful names and slugs (kebab-case for slugs).
- Reference the existing app name in target.app for every feature spec.
- Include 2-8 feature specs depending on complexity
- After all spec blocks, write a brief summary explaining the decomposition rationale and phase strategy.
- IMPORTANT: Use \`dependsOn\` to list the slugs of other feature specs that MUST be built BEFORE this one. If a feature has no dependencies, use an empty array \`[]\`. The engine enforces this ordering — a spec will NOT build until all its dependencies are completed.
- Example: A "dashboard" feature (phase 2) that needs auth would have: \`dependsOn: [auth-system]\`

Be thorough, creative, and production-ready.`;

function getSettings() {
  const file = resolve(FACTORY_ROOT, 'settings.json');
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const { messages, isExistingApp, existingAppName } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const settings = getSettings();
    if (!settings?.activeProvider) {
      return new Response(
        JSON.stringify({ error: 'No LLM provider configured. Go to Settings to set one up.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const provider = settings.providers?.find(
      (p: any) => p.id === settings.activeProvider
    );
    if (!provider?.enabled) {
      return new Response(
        JSON.stringify({ error: `Provider "${settings.activeProvider}" is not enabled.` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const model = settings.buildModel || provider.defaultModel;

    // Get active project's stack info
    let stackInfo = '';
    const bridge = getActiveBridgeConfig();
    if (bridge?.stack) {
      stackInfo = `\n\nThe target project uses the following stack:
- Framework: ${bridge.stack.framework}
- Database: ${bridge.stack.database || 'Not specified'}
- Cloud: ${bridge.stack.cloud || 'Not specified'}

Tailor your YAML and explanations accordingly. If the database is not Firestore, do not mention Firestore specific IDs.`;
    }

    // Choose the right system prompt based on whether this is a new or existing app
    let systemPrompt: string;
    if (isExistingApp && existingAppName) {
      systemPrompt = SYSTEM_PROMPT_EXISTING_APP.replace(/EXISTING_APP_NAME/g, existingAppName) + stackInfo;
    } else {
      systemPrompt = SYSTEM_PROMPT_NEW_APP + stackInfo;
    }

    // Build the full message list with system prompt
    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    // Route to the right provider
    if (provider.id === 'ollama') {
      return streamOllama(provider, model, fullMessages);
    } else if (provider.id === 'openai') {
      return streamOpenAI(provider, model, fullMessages);
    } else if (provider.id === 'gemini') {
      return streamGemini(provider, model, fullMessages);
    }

    return new Response(
      JSON.stringify({ error: `Unsupported provider: ${provider.id}` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Chat failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ─── Ollama ────────────────────────────────────────────────────────

async function streamOllama(
  provider: any,
  model: string,
  messages: any[]
) {
  const baseUrl = provider.baseUrl || 'http://localhost:11434';

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text();
    return new Response(
      JSON.stringify({ error: `Ollama error: ${text}` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          // Ollama returns newline-delimited JSON
          const lines = chunk.split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.message?.content) {
                controller.enqueue(
                  new TextEncoder().encode(
                    `data: ${JSON.stringify({ content: parsed.message.content })}\n\n`
                  )
                );
              }
              if (parsed.done) {
                controller.enqueue(
                  new TextEncoder().encode('data: [DONE]\n\n')
                );
              }
            } catch {
              // Skip unparseable lines
            }
          }
        }
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

// ─── OpenAI ────────────────────────────────────────────────────────

async function streamOpenAI(
  provider: any,
  model: string,
  messages: any[]
) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({ model, messages, stream: true }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text();
    return new Response(
      JSON.stringify({ error: `OpenAI error: ${text}` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') {
              controller.enqueue(
                new TextEncoder().encode('data: [DONE]\n\n')
              );
              continue;
            }
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                controller.enqueue(
                  new TextEncoder().encode(
                    `data: ${JSON.stringify({ content })}\n\n`
                  )
                );
              }
            } catch {
              // Skip
            }
          }
        }
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

// ─── Gemini ────────────────────────────────────────────────────────

async function streamGemini(
  provider: any,
  model: string,
  messages: any[]
) {
  // Convert messages to Gemini format
  const systemInstruction = messages.find((m: any) => m.role === 'system');
  const chatMessages = messages
    .filter((m: any) => m.role !== 'system')
    .map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const body: any = {
    contents: chatMessages,
  };
  if (systemInstruction) {
    body.system_instruction = {
      parts: [{ text: systemInstruction.content }],
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${provider.apiKey}&alt=sse`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const text = await res.text();
    return new Response(
      JSON.stringify({ error: `Gemini error: ${text}` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.enqueue(
              new TextEncoder().encode('data: [DONE]\n\n')
            );
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            try {
              const parsed = JSON.parse(data);
              const content =
                parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (content) {
                controller.enqueue(
                  new TextEncoder().encode(
                    `data: ${JSON.stringify({ content })}\n\n`
                  )
                );
              }
            } catch {
              // skip
            }
          }
        }
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
