import { NextResponse } from 'next/server';
import { resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { homedir } from 'node:os';

const FACTORY_ROOT = resolve(homedir(), '.factory');
const SETTINGS_FILE = resolve(FACTORY_ROOT, 'settings.json');

function defaultSettings() {
    return {
        providers: [
            {
                id: 'gemini',
                name: 'Google Gemini',
                enabled: false,
                apiKey: '',
                models: [
                    { id: 'gemini-2.5-pro-preview-05-06', name: 'Gemini 2.5 Pro' },
                    { id: 'gemini-2.5-flash-preview-04-17', name: 'Gemini 2.5 Flash' },
                    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
                ],
                defaultModel: 'gemini-2.5-flash-preview-04-17',
            },
            {
                id: 'openai',
                name: 'OpenAI',
                enabled: false,
                apiKey: '',
                models: [
                    { id: 'gpt-4o', name: 'GPT-4o' },
                    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
                    { id: 'o3-mini', name: 'o3-mini' },
                ],
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

export async function GET() {
    try {
        if (!existsSync(SETTINGS_FILE)) {
            return NextResponse.json(defaultSettings());
        }
        const raw = readFileSync(SETTINGS_FILE, 'utf-8');
        const saved = JSON.parse(raw);
        // Merge with defaults
        const defaults = defaultSettings();
        const providers = defaults.providers.map((def: any) => {
            const s = saved.providers?.find((p: any) => p.id === def.id);
            if (!s) return def;
            return { ...def, ...s, models: s.models?.length ? s.models : def.models };
        });
        return NextResponse.json({
            providers,
            activeProvider: saved.activeProvider || '',
            buildModel: saved.buildModel || '',
            updatedAt: saved.updatedAt,
        });
    } catch {
        return NextResponse.json(defaultSettings());
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        body.updatedAt = new Date().toISOString();
        const dir = dirname(SETTINGS_FILE);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(SETTINGS_FILE, JSON.stringify(body, null, 2) + '\n');
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
    }
}
