/**
 * LLM Configuration — manages AI provider settings for code generation.
 *
 * Supports Gemini, OpenAI, and Ollama (local).
 * Settings are persisted to settings.json at the factory root.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { writeFile, log } from './utils.ts';

// ─── Types ────────────────────────────────────────────────

export interface ModelConfig {
    id: string;
    name: string;
    contextWindow?: number;
    capabilities?: string[];
}

export interface LLMProvider {
    id: 'gemini' | 'openai' | 'ollama';
    name: string;
    enabled: boolean;
    apiKey?: string;
    baseUrl?: string;
    models: ModelConfig[];
    defaultModel?: string;
}

export interface FactorySettings {
    providers: LLMProvider[];
    activeProvider: string;
    buildModel: string;
    updatedAt?: string;
}

// ─── Defaults ─────────────────────────────────────────────

const SETTINGS_FILE = resolve(import.meta.dirname || '.', '..', 'settings.json');

const GEMINI_MODELS: ModelConfig[] = [
    { id: 'gemini-2.5-pro-preview-05-06', name: 'Gemini 2.5 Pro', contextWindow: 1048576, capabilities: ['code', 'reasoning'] },
    { id: 'gemini-2.5-flash-preview-04-17', name: 'Gemini 2.5 Flash', contextWindow: 1048576, capabilities: ['code', 'fast'] },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextWindow: 1048576, capabilities: ['code', 'fast'] },
];

const OPENAI_MODELS: ModelConfig[] = [
    { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, capabilities: ['code', 'reasoning'] },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000, capabilities: ['code', 'fast'] },
    { id: 'o3-mini', name: 'o3-mini', contextWindow: 200000, capabilities: ['code', 'reasoning'] },
];

function defaultSettings(): FactorySettings {
    return {
        providers: [
            {
                id: 'gemini',
                name: 'Google Gemini',
                enabled: false,
                apiKey: '',
                models: GEMINI_MODELS,
                defaultModel: 'gemini-2.5-flash-preview-04-17',
            },
            {
                id: 'openai',
                name: 'OpenAI',
                enabled: false,
                apiKey: '',
                models: OPENAI_MODELS,
                defaultModel: 'gpt-4o-mini',
            },
            {
                id: 'ollama',
                name: 'Ollama (Local)',
                enabled: false,
                baseUrl: 'http://localhost:11434',
                models: [],
                defaultModel: '',
            },
        ],
        activeProvider: '',
        buildModel: '',
    };
}

// ─── Load / Save ──────────────────────────────────────────

export function loadSettings(): FactorySettings {
    if (!existsSync(SETTINGS_FILE)) {
        return defaultSettings();
    }
    try {
        const raw = readFileSync(SETTINGS_FILE, 'utf-8');
        const saved = JSON.parse(raw) as Partial<FactorySettings>;
        // Merge with defaults to pick up new providers/models
        const defaults = defaultSettings();
        const providers = defaults.providers.map(defProvider => {
            const savedProvider = saved.providers?.find(p => p.id === defProvider.id);
            if (!savedProvider) return defProvider;
            return {
                ...defProvider,
                ...savedProvider,
                // Keep built-in models but merge any custom ones
                models: defProvider.models.length > 0
                    ? defProvider.models
                    : savedProvider.models || [],
            };
        });
        return {
            providers,
            activeProvider: saved.activeProvider || '',
            buildModel: saved.buildModel || '',
            updatedAt: saved.updatedAt,
        };
    } catch {
        return defaultSettings();
    }
}

export function saveSettings(settings: FactorySettings): void {
    settings.updatedAt = new Date().toISOString();
    writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n');
    log('✓', 'Settings saved');
}

// ─── Provider Operations ──────────────────────────────────

export function getActiveProvider(settings?: FactorySettings): LLMProvider | null {
    const s = settings || loadSettings();
    if (!s.activeProvider) return null;
    return s.providers.find(p => p.id === s.activeProvider && p.enabled) || null;
}

/**
 * Test connection to a provider.
 * - Gemini: calls models.list with API key
 * - OpenAI: calls /v1/models
 * - Ollama: calls /api/tags
 */
export async function testConnection(
    providerId: string,
    settings?: FactorySettings,
): Promise<{ ok: boolean; message: string; models?: ModelConfig[] }> {
    const s = settings || loadSettings();
    const provider = s.providers.find(p => p.id === providerId);
    if (!provider) {
        return { ok: false, message: `Unknown provider: ${providerId}` };
    }

    try {
        switch (provider.id) {
            case 'gemini': {
                if (!provider.apiKey) {
                    return { ok: false, message: 'API key is required' };
                }
                const res = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models?key=${provider.apiKey}`
                );
                if (!res.ok) {
                    const body = await res.text();
                    return { ok: false, message: `API error (${res.status}): ${body.slice(0, 200)}` };
                }
                const data = await res.json();
                const models = (data.models || [])
                    .filter((m: any) => m.name?.includes('gemini'))
                    .slice(0, 10)
                    .map((m: any) => ({
                        id: m.name?.replace('models/', '') || m.name,
                        name: m.displayName || m.name,
                    }));
                return { ok: true, message: `Connected — ${models.length} models available`, models };
            }

            case 'openai': {
                if (!provider.apiKey) {
                    return { ok: false, message: 'API key is required' };
                }
                const res = await fetch('https://api.openai.com/v1/models', {
                    headers: { Authorization: `Bearer ${provider.apiKey}` },
                });
                if (!res.ok) {
                    const body = await res.text();
                    return { ok: false, message: `API error (${res.status}): ${body.slice(0, 200)}` };
                }
                const data = await res.json();
                const models = (data.data || [])
                    .filter((m: any) => m.id?.startsWith('gpt-') || m.id?.startsWith('o'))
                    .slice(0, 15)
                    .map((m: any) => ({
                        id: m.id,
                        name: m.id,
                    }));
                return { ok: true, message: `Connected — ${models.length} models available`, models };
            }

            case 'ollama': {
                const baseUrl = provider.baseUrl || 'http://localhost:11434';
                const res = await fetch(`${baseUrl}/api/tags`, {
                    signal: AbortSignal.timeout(5000),
                });
                if (!res.ok) {
                    return { ok: false, message: `Ollama responded with ${res.status}` };
                }
                const data = await res.json();
                const models = (data.models || []).map((m: any) => ({
                    id: m.name || m.model,
                    name: m.name || m.model,
                }));
                return { ok: true, message: `Connected — ${models.length} models pulled`, models };
            }

            default:
                return { ok: false, message: `Unknown provider: ${providerId}` };
        }
    } catch (err: any) {
        const msg = err.code === 'ECONNREFUSED'
            ? 'Connection refused — is the service running?'
            : err.message || 'Connection failed';
        return { ok: false, message: msg };
    }
}
