'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
    Sparkles,
    Bot,
    Server,
    Eye,
    EyeOff,
    CheckCircle2,
    XCircle,
    Loader2,
    RefreshCw,
    Star,
    Zap,
    Save,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────

interface ModelConfig {
    id: string;
    name: string;
}

interface LLMProvider {
    id: 'gemini' | 'openai' | 'ollama';
    name: string;
    enabled: boolean;
    apiKey?: string;
    baseUrl?: string;
    models: ModelConfig[];
    defaultModel?: string;
}

interface FactorySettings {
    providers: LLMProvider[];
    activeProvider: string;
    buildModel: string;
    updatedAt?: string;
}

// ─── Provider metadata ───────────────────────────────────

const PROVIDER_META: Record<string, { icon: React.ReactNode; color: string; description: string }> = {
    gemini: {
        icon: <Sparkles className="h-5 w-5" />,
        color: 'text-blue-500',
        description: 'Google\'s most capable AI models for code generation.',
    },
    openai: {
        icon: <Bot className="h-5 w-5" />,
        color: 'text-green-500',
        description: 'GPT models with strong code generation capabilities.',
    },
    ollama: {
        icon: <Server className="h-5 w-5" />,
        color: 'text-orange-500',
        description: 'Run models locally — no API key needed, fully private.',
    },
};

// ─── Component ───────────────────────────────────────────

export function SettingsView() {
    const [settings, setSettings] = useState<FactorySettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testingProvider, setTestingProvider] = useState<string | null>(null);
    const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});
    const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
    const [dirty, setDirty] = useState(false);

    // Load settings
    const loadSettings = useCallback(async () => {
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();
            setSettings(data);
        } catch {
            toast.error('Failed to load settings');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadSettings(); }, [loadSettings]);

    // Auto-save when settings change
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!dirty || !settings) return;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(async () => {
            setSaving(true);
            try {
                const res = await fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(settings),
                });
                const data = await res.json();
                if (data.ok) {
                    toast.success('Settings saved');
                    setDirty(false);
                } else {
                    toast.error(data.error || 'Failed to save');
                }
            } catch {
                toast.error('Failed to save settings');
            } finally {
                setSaving(false);
            }
        }, 500);
        return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    }, [dirty, settings]);

    // Update a provider field
    const updateProvider = (id: string, updates: Partial<LLMProvider>) => {
        if (!settings) return;
        setSettings({
            ...settings,
            providers: settings.providers.map(p =>
                p.id === id ? { ...p, ...updates } : p
            ),
        });
        setDirty(true);
    };

    // Test connection
    const testConnection = async (providerId: string) => {
        if (!settings) return;
        const provider = settings.providers.find(p => p.id === providerId);
        if (!provider) return;

        setTestingProvider(providerId);
        setTestResults(prev => ({ ...prev, [providerId]: { ok: false, message: 'Testing...' } }));

        try {
            const res = await fetch('/api/settings/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: providerId,
                    apiKey: provider.apiKey,
                    baseUrl: provider.baseUrl,
                }),
            });
            const result = await res.json();
            setTestResults(prev => ({ ...prev, [providerId]: result }));

            if (result.ok) {
                toast.success(result.message);
                // Update models if returned
                if (result.models?.length) {
                    updateProvider(providerId, { models: result.models });
                }
            } else {
                toast.error(result.message);
            }
        } catch {
            setTestResults(prev => ({
                ...prev,
                [providerId]: { ok: false, message: 'Connection failed' },
            }));
            toast.error('Connection test failed');
        } finally {
            setTestingProvider(null);
        }
    };

    // Set as active provider
    const setActiveProvider = (providerId: string, modelId: string) => {
        if (!settings) return;
        setSettings({
            ...settings,
            activeProvider: providerId,
            buildModel: modelId,
        });
        setDirty(true);
    };

    if (loading || !settings) {
        return (
            <div className="space-y-4">
                {[1, 2, 3].map(i => (
                    <Card key={i}>
                        <CardContent className="py-8">
                            <div className="h-24 bg-muted/30 animate-pulse rounded-lg" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    const activeProvider = settings.providers.find(
        p => p.id === settings.activeProvider && p.enabled
    );

    return (
        <div className="space-y-6">
            {/* Active model banner */}
            {activeProvider && settings.buildModel ? (
                <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg bg-background border ${PROVIDER_META[activeProvider.id]?.color}`}>
                                {PROVIDER_META[activeProvider.id]?.icon}
                            </div>
                            <div>
                                <p className="text-sm font-medium">Active Build Model</p>
                                <p className="text-xs text-muted-foreground">
                                    {activeProvider.name} → <span className="font-mono">{settings.buildModel}</span>
                                </p>
                            </div>
                        </div>
                        <Badge variant="outline" className="gap-1.5">
                            <Zap className="h-3 w-3" />
                            Ready
                        </Badge>
                    </CardContent>
                </Card>
            ) : (
                <Card className="border-amber-500/20 bg-amber-500/5">
                    <CardContent className="py-4 flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-background border text-amber-500">
                            <Zap className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-sm font-medium">No Model Configured</p>
                            <p className="text-xs text-muted-foreground">
                                Enable a provider and set it as default to start generating code with AI.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Provider cards */}
            {settings.providers.map(provider => {
                const meta = PROVIDER_META[provider.id];
                const result = testResults[provider.id];
                const isActive = settings.activeProvider === provider.id;
                const isTesting = testingProvider === provider.id;

                return (
                    <Card
                        key={provider.id}
                        className={`transition-all ${isActive ? 'ring-2 ring-primary/30' : ''} ${!provider.enabled ? 'opacity-60' : ''}`}
                    >
                        <CardHeader className="pb-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg border ${meta?.color}`}>
                                        {meta?.icon}
                                    </div>
                                    <div>
                                        <CardTitle className="text-base flex items-center gap-2">
                                            {provider.name}
                                            {isActive && (
                                                <Badge className="text-[10px] gap-1">
                                                    <Star className="h-2.5 w-2.5" /> Default
                                                </Badge>
                                            )}
                                        </CardTitle>
                                        <CardDescription className="text-xs mt-0.5">
                                            {meta?.description}
                                        </CardDescription>
                                    </div>
                                </div>
                                <Switch
                                    checked={provider.enabled}
                                    onCheckedChange={(checked) => updateProvider(provider.id, { enabled: checked })}
                                />
                            </div>
                        </CardHeader>

                        {provider.enabled && (
                            <CardContent className="space-y-4 pt-0">
                                <Separator />

                                {/* API Key — Gemini & OpenAI */}
                                {(provider.id === 'gemini' || provider.id === 'openai') && (
                                    <div className="space-y-2">
                                        <Label htmlFor={`${provider.id}-key`} className="text-xs font-medium">API Key</Label>
                                        <div className="flex gap-2">
                                            <div className="relative flex-1">
                                                <Input
                                                    id={`${provider.id}-key`}
                                                    type={showKeys[provider.id] ? 'text' : 'password'}
                                                    placeholder={provider.id === 'gemini' ? 'AIza...' : 'sk-...'}
                                                    value={provider.apiKey || ''}
                                                    onChange={(e) => updateProvider(provider.id, { apiKey: e.target.value })}
                                                    className="pr-10 font-mono text-xs"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowKeys(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                                >
                                                    {showKeys[provider.id]
                                                        ? <EyeOff className="h-3.5 w-3.5" />
                                                        : <Eye className="h-3.5 w-3.5" />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Base URL — Ollama */}
                                {provider.id === 'ollama' && (
                                    <div className="space-y-2">
                                        <Label htmlFor="ollama-url" className="text-xs font-medium">Base URL</Label>
                                        <Input
                                            id="ollama-url"
                                            placeholder="http://localhost:11434"
                                            value={provider.baseUrl || ''}
                                            onChange={(e) => updateProvider(provider.id, { baseUrl: e.target.value })}
                                            className="font-mono text-xs"
                                        />
                                    </div>
                                )}

                                {/* Model selector */}
                                <div className="space-y-2">
                                    <Label className="text-xs font-medium">Model</Label>
                                    {provider.models.length > 0 ? (
                                        <Select
                                            value={provider.defaultModel || ''}
                                            onValueChange={(val) => updateProvider(provider.id, { defaultModel: val })}
                                        >
                                            <SelectTrigger className="font-mono text-xs">
                                                <SelectValue placeholder="Select a model" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {provider.models.map(model => (
                                                    <SelectItem key={model.id} value={model.id} className="font-mono text-xs">
                                                        {model.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <p className="text-xs text-muted-foreground py-2">
                                            No models available — test connection to discover models.
                                        </p>
                                    )}
                                </div>

                                {/* Connection test result */}
                                {result && (
                                    <div className={`flex items-center gap-2 text-xs p-2.5 rounded-md border ${result.ok
                                        ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-600'
                                        : 'bg-red-500/5 border-red-500/20 text-red-600'
                                    }`}>
                                        {result.ok
                                            ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                            : <XCircle className="h-3.5 w-3.5 shrink-0" />
                                        }
                                        {result.message}
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex items-center gap-2 pt-1">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => testConnection(provider.id)}
                                        disabled={isTesting}
                                        className="text-xs gap-1.5"
                                    >
                                        {isTesting
                                            ? <Loader2 className="h-3 w-3 animate-spin" />
                                            : <RefreshCw className="h-3 w-3" />
                                        }
                                        Test Connection
                                    </Button>
                                    {provider.defaultModel && !isActive && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setActiveProvider(provider.id, provider.defaultModel!)}
                                            className="text-xs gap-1.5"
                                        >
                                            <Star className="h-3 w-3" />
                                            Set as Default
                                        </Button>
                                    )}
                                </div>
                            </CardContent>
                        )}
                    </Card>
                );
            })}

            {/* Auto-save indicator */}
            {saving && (
                <div className="flex justify-end sticky bottom-4">
                    <Badge variant="outline" className="gap-1.5 bg-background shadow-lg">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Saving...
                    </Badge>
                </div>
            )}
        </div>
    );
}
