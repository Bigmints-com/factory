'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  ArrowUp,
  Bot,
  User,
  Save,
  Loader2,
  Sparkles,
  Copy,
  Check,
  X,
  FileText,
  Terminal,
  Zap,
  Package,
  Layers,
  SaveAll,
  ScanSearch,
  FolderTree,
  Blocks,
  FileCode,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ParsedSpec {
  kind: 'app' | 'feature';
  filename: string;
  yaml: string;
  name: string;
  phase?: number;
  dependsOn?: string[];
  saved?: boolean;
}

interface SpecChatProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSpecSaved: () => void;
}


// ─── Multi-spec parser ─────────────────────────────────────

function extractAllSpecs(content: string): ParsedSpec[] {
  const specs: ParsedSpec[] = [];

  // Match === APP_SPEC: filename.yaml === ... === END_SPEC ===
  const appPattern = /=== APP_SPEC:\s*(\S+)\s*===\s*```yaml\n([\s\S]*?)```\s*=== END_SPEC ===/g;
  let match;
  while ((match = appPattern.exec(content)) !== null) {
    const yaml = match[2].trim();
    const name = extractNameFromYaml(yaml) || match[1].replace('.yaml', '');
    specs.push({ kind: 'app', filename: match[1], yaml, name });
  }

  // Match === FEATURE_SPEC: filename.yaml === ... === END_SPEC ===
  const featurePattern = /=== FEATURE_SPEC:\s*(\S+)\s*===\s*```yaml\n([\s\S]*?)```\s*=== END_SPEC ===/g;
  while ((match = featurePattern.exec(content)) !== null) {
    const yaml = match[2].trim();
    const name = extractNameFromYaml(yaml) || match[1].replace('.yaml', '');
    const phaseMatch = yaml.match(/^phase:\s*(\d+)/m);
    const phase = phaseMatch ? parseInt(phaseMatch[1]) : undefined;
    // Extract dependsOn
    const depsMatch = yaml.match(/^dependsOn:\s*\[([^\]]*)]$/m);
    let dependsOn: string[] | undefined;
    if (depsMatch) {
      const raw = depsMatch[1].trim();
      dependsOn = raw.length > 0 ? raw.split(',').map(s => s.trim().replace(/["']/g, '')).filter(Boolean) : [];
    }
    specs.push({ kind: 'feature', filename: match[1], yaml, name, phase, dependsOn });
  }

  // Fallback: if no delimited specs found, try the old single-YAML format
  if (specs.length === 0) {
    const yamlMatch = content.match(/```yaml\n([\s\S]*?)```/);
    if (yamlMatch) {
      const yaml = yamlMatch[1].trim();
      const name = extractNameFromYaml(yaml) || 'Untitled App';
      specs.push({ kind: 'app', filename: slugify(name) + '.yaml', yaml, name });
    }
  }

  return specs;
}

function extractNameFromYaml(yaml: string): string | null {
  // Try appName first (app specs)
  const appNameMatch = yaml.match(/appName:\s*"([^"]+)"/);
  if (appNameMatch) return appNameMatch[1];

  // Try feature.name (feature specs)
  const featureNameMatch = yaml.match(/name:\s*"([^"]+)"/);
  if (featureNameMatch) return featureNameMatch[1];

  return null;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ─── Component ─────────────────────────────────────────────

export function SpecChat({ open, onOpenChange, onSpecSaved }: SpecChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [savedSpecs, setSavedSpecs] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Existing app detection
  const [isExistingApp, setIsExistingApp] = useState(false);
  const [existingAppName, setExistingAppName] = useState('');

  // Repo scan context
  const [repoContext, setRepoContext] = useState<any>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');

  // Check for existing app specs and run repo scan on dialog open
  useEffect(() => {
    if (open) {
      // Check existing specs
      fetch('/api/specs')
        .then((r) => r.json())
        .then((data) => {
          if (data.specs && data.specs.length > 0) {
            setIsExistingApp(true);
            const firstApp = data.specs[0];
            const name = firstApp.metadata?.name || firstApp.metadata?.slug || firstApp.file?.replace('.yaml', '') || 'app';
            setExistingAppName(name);
          } else {
            setIsExistingApp(false);
            setExistingAppName('');
          }
        })
        .catch(() => {
          setIsExistingApp(false);
          setExistingAppName('');
        });

      // Run repo scan
      setScanning(true);
      setScanError('');
      fetch('/api/repo-scan')
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            setScanError(data.error);
          } else {
            setRepoContext(data);
          }
        })
        .catch((err) => setScanError(err.message || 'Scan failed'))
        .finally(() => setScanning(false));
    }
  }, [open]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when dialog opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const target = e.target;
    target.style.height = 'auto';
    target.style.height = Math.min(target.scrollHeight, 160) + 'px';
  };

  const handleSend = async (text?: string) => {
    const content = text || input.trim();
    if (!content || streaming) return;

    const userMsg: Message = { role: 'user', content };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setStreaming(true);
    setActiveTab(0);
    setSavedSpecs(new Set());

    if (inputRef.current) inputRef.current.style.height = 'auto';

    const assistantMsg: Message = { role: 'assistant', content: '' };
    setMessages([...newMessages, assistantMsg]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          isExistingApp,
          existingAppName,
          repoContext,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Chat request failed');
      }
      if (!res.body) throw new Error('No response stream');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              accumulated += parsed.content;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: accumulated };
                return updated;
              });
            }
          } catch {
            // Skip
          }
        }
      }
    } catch (err: any) {
      toast.error('Chat failed', { description: err.message });
      setMessages(newMessages);
    } finally {
      setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Get all parsed specs from the latest assistant message
  const allSpecs: ParsedSpec[] = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        const specs = extractAllSpecs(messages[i].content);
        if (specs.length > 0) return specs;
      }
    }
    return [];
  })();

  const activeSpec = allSpecs[activeTab] || null;
  const hasSpecs = allSpecs.length > 0;
  const allSaved = allSpecs.length > 0 && allSpecs.every((s) => savedSpecs.has(s.filename));

  // Save a single spec
  const handleSaveSpec = async (spec: ParsedSpec) => {
    setSaving(true);
    try {
      const res = await fetch('/api/specs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: spec.name,
          content: spec.yaml,
          kind: spec.kind === 'feature' ? 'feature' : 'app',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Saved ${spec.kind === 'feature' ? 'feature' : 'app'} spec`, { description: data.file });
        setSavedSpecs((prev) => new Set(prev).add(spec.filename));
        onSpecSaved();
      } else {
        toast.error('Save failed', { description: data.error });
      }
    } catch {
      toast.error('Failed to save spec');
    } finally {
      setSaving(false);
    }
  };

  // Save all specs (sorted by phase: app spec first, then phase 1, 2, 3...)
  const handleSaveAll = async () => {
    setSavingAll(true);
    let successCount = 0;
    let failCount = 0;

    // Sort: app specs first (phase 0), then by phase ascending
    const sortedSpecs = [...allSpecs].sort((a, b) => {
      const phaseA = a.kind === 'app' ? 0 : (a.phase ?? 99);
      const phaseB = b.kind === 'app' ? 0 : (b.phase ?? 99);
      return phaseA - phaseB;
    });

    for (const spec of sortedSpecs) {
      if (savedSpecs.has(spec.filename)) continue;
      try {
        const res = await fetch('/api/specs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: spec.name,
            content: spec.yaml,
            kind: spec.kind === 'feature' ? 'feature' : 'app',
          }),
        });
        const data = await res.json();
        if (res.ok) {
          successCount++;
          setSavedSpecs((prev) => new Set(prev).add(spec.filename));

          // Auto-enqueue feature specs with phase/dependency info
          if (spec.kind === 'feature' && data.file) {
            try {
              await fetch('/api/queue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  specFile: data.file,
                  kind: 'FeatureSpec',
                  phase: spec.phase ?? 0,
                  dependsOn: spec.dependsOn ?? [],
                }),
              });
            } catch { /* non-critical — queue add is best-effort */ }
          }
        } else {
          failCount++;
          toast.error(`Failed: ${spec.filename}`, { description: data.error });
        }
      } catch {
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`Saved ${successCount} spec${successCount > 1 ? 's' : ''}`, {
        description: failCount > 0 ? `${failCount} failed` : 'Auto-enqueued for build',
      });
      onSpecSaved();
    }
    setSavingAll(false);
  };

  const handleCopy = async () => {
    if (!activeSpec) return;
    await navigator.clipboard.writeText(activeSpec.yaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isEmpty = messages.length === 0;

  const phaseColor = (phase?: number) => {
    switch (phase) {
      case 1: return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 2: return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 3: return 'bg-violet-500/10 text-violet-500 border-violet-500/20';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="fixed inset-0 z-50 flex flex-col w-screen h-screen max-w-none m-0 rounded-none border-0 p-0 gap-0 overflow-hidden outline-none bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 translate-x-0 translate-y-0 sm:max-w-none top-0 left-0 [&>button]:hidden">
        {/* Top Header Section */}
        <DialogHeader className="border-b px-6 py-4 mb-0 flex-row items-center justify-between space-y-0 h-16 shrink-0 bg-card/50 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center space-x-4">
            <div className="inline-flex shrink-0 items-center justify-center rounded-xl bg-primary/10 p-2.5">
              <Zap className="size-5 text-primary" aria-hidden={true} />
            </div>
            <div className="space-y-0.5">
              <DialogTitle className="text-base font-semibold tracking-tight">
                Spec Generator
              </DialogTitle>
              <p className="text-xs text-muted-foreground font-medium">
                {isExistingApp
                  ? `Adding features to ${existingAppName}`
                  : 'AI-powered spec decomposition'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasSpecs && !streaming && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-4 text-xs font-semibold gap-2 border-primary/20 hover:bg-primary/5 hover:border-primary/40 transition-all"
                  onClick={handleCopy}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy YAML'}
                </Button>
                {!allSaved && (
                  <Button
                    size="sm"
                    className="h-9 px-4 text-xs font-semibold gap-2 shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    onClick={handleSaveAll}
                    disabled={savingAll}
                  >
                    {savingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SaveAll className="h-3.5 w-3.5" />}
                    Save All ({allSpecs.length - savedSpecs.size})
                  </Button>
                )}
                {allSaved && (
                  <Badge variant="outline" className="h-9 px-4 text-xs font-semibold gap-2 border-emerald-500/30 text-emerald-500">
                    <Check className="h-3.5 w-3.5" />
                    All Saved
                  </Badge>
                )}
              </>
            )}
            <Separator orientation="vertical" className="h-6 mx-2" />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full hover:bg-destructive/10 hover:text-destructive transition-colors"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </DialogHeader>

        {/* Main Split Content Area */}
        <div className="flex flex-1 overflow-hidden relative">

          {/* Left Pane: Chat Interface */}
          <div className="flex flex-col w-[35%] min-w-[380px] max-w-[500px] border-r bg-card/30 backdrop-blur-sm z-20">
            {/* Existing app badge */}
            {isExistingApp && isEmpty && (
              <div className="mx-6 mt-4 px-3 py-2 rounded-xl bg-amber-500/5 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-medium flex items-center gap-2">
                <Layers className="h-3.5 w-3.5" />
                Existing app detected: <strong>{existingAppName}</strong> — will generate feature specs only
              </div>
            )}

            {/* Repo scan status */}
            {isEmpty && (
              <div className="mx-6 mt-3 px-3 py-2 rounded-xl border text-xs font-medium flex items-center gap-2" style={{ borderColor: scanning ? 'rgba(59, 130, 246, 0.2)' : repoContext ? 'rgba(16, 185, 129, 0.2)' : scanError ? 'rgba(239, 68, 68, 0.2)' : 'transparent', background: scanning ? 'rgba(59, 130, 246, 0.05)' : repoContext ? 'rgba(16, 185, 129, 0.05)' : scanError ? 'rgba(239, 68, 68, 0.05)' : 'transparent' }}>
                {scanning ? (
                  <><ScanSearch className="h-3.5 w-3.5 text-blue-500 animate-pulse" /> <span className="text-blue-600 dark:text-blue-400">Scanning repo...</span></>
                ) : repoContext ? (
                  <><ScanSearch className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">
                      Repo scanned: {repoContext.stack?.framework} · {Object.keys(repoContext.dependencies || {}).length} deps · {repoContext.fileTree?.length || 0} files
                      {repoContext.existingSpecs?.features?.length > 0 && ` · ${repoContext.existingSpecs.features.length} existing features`}
                      {repoContext.agentInstructions ? ' · ✓ agents.md' : ''}
                    </span>
                    {!repoContext.agentInstructions && (
                      <span className="text-amber-500 ml-1">⚠️ no agents.md</span>
                    )}
                  </>
                ) : scanError ? (
                  <><ScanSearch className="h-3.5 w-3.5 text-red-500" /> <span className="text-red-600 dark:text-red-400">Scan failed: {scanError}</span></>
                ) : null}
              </div>
            )}

            {/* Messages Scroll Area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-8 space-y-8 scrollbar-thin scrollbar-thumb-muted-foreground/10 hover:scrollbar-thumb-muted-foreground/20">
              {isEmpty ? (
                <div className="flex flex-col items-center justify-center h-full text-center gap-6 py-10">
                  <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary shadow-2xl shadow-primary/20 ring-4 ring-primary/5 transition-transform hover:scale-110">
                    <Bot className="h-10 w-10 text-primary-foreground" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold tracking-tight">
                      {repoContext ? 'Project Context Loaded' : scanning ? 'Scanning Project...' : 'What shall we build today?'}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed max-w-[280px]">
                      {repoContext
                        ? 'Describe the feature or app you want and I\'ll generate specs aligned with your codebase.'
                        : 'Describe your app and I\'ll break it down into modular, buildable specs.'}
                    </p>
                  </div>

                  {/* Scan Summary — replaces old template buttons */}
                  {repoContext && (
                    <div className="w-full pt-4 space-y-2">
                      {/* agents.md */}
                      <div className={cn(
                        "flex items-center gap-3 rounded-xl px-4 py-3 text-sm border",
                        repoContext.agentInstructions
                          ? "border-emerald-500/20 bg-emerald-500/5"
                          : "border-amber-500/20 bg-amber-500/5"
                      )}>
                        <FileCode className={cn("h-4 w-4 shrink-0", repoContext.agentInstructions ? "text-emerald-500" : "text-amber-500")} />
                        <span className="font-medium">
                          {repoContext.agentInstructions
                            ? '✓ agents.md loaded'
                            : '⚠️ No agents.md found'}
                        </span>
                      </div>

                      {/* Stack */}
                      {repoContext.stack && (
                        <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm border border-border/50 bg-muted/30">
                          <Blocks className="h-4 w-4 shrink-0 text-blue-500" />
                          <span className="text-muted-foreground">
                            <strong className="text-foreground">{repoContext.stack.framework}</strong>
                            {repoContext.stack.language && ` · ${repoContext.stack.language}`}
                            {repoContext.stack.database && ` · ${repoContext.stack.database}`}
                            {repoContext.stack.packageManager && ` · ${repoContext.stack.packageManager}`}
                          </span>
                        </div>
                      )}

                      {/* Deps + files */}
                      <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm border border-border/50 bg-muted/30">
                        <Package className="h-4 w-4 shrink-0 text-purple-500" />
                        <span className="text-muted-foreground">
                          <strong className="text-foreground">{Object.keys(repoContext.dependencies || {}).length}</strong> deps
                          {Object.keys(repoContext.devDependencies || {}).length > 0 && (
                            <> · <strong className="text-foreground">{Object.keys(repoContext.devDependencies || {}).length}</strong> dev deps</>
                          )}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm border border-border/50 bg-muted/30">
                        <FolderTree className="h-4 w-4 shrink-0 text-cyan-500" />
                        <span className="text-muted-foreground">
                          <strong className="text-foreground">{repoContext.fileTree?.length || 0}</strong> files scanned
                        </span>
                      </div>

                      {/* Existing specs */}
                      {(repoContext.existingSpecs?.apps?.length > 0 || repoContext.existingSpecs?.features?.length > 0) && (
                        <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm border border-border/50 bg-muted/30">
                          <Layers className="h-4 w-4 shrink-0 text-orange-500" />
                          <span className="text-muted-foreground">
                            {repoContext.existingSpecs.apps?.length > 0 && (
                              <><strong className="text-foreground">{repoContext.existingSpecs.apps.length}</strong> app spec{repoContext.existingSpecs.apps.length > 1 ? 's' : ''}</>
                            )}
                            {repoContext.existingSpecs.apps?.length > 0 && repoContext.existingSpecs.features?.length > 0 && ' · '}
                            {repoContext.existingSpecs.features?.length > 0 && (
                              <><strong className="text-foreground">{repoContext.existingSpecs.features.length}</strong> feature spec{repoContext.existingSpecs.features.length > 1 ? 's' : ''}</>
                            )}
                          </span>
                        </div>
                      )}

                      {/* Conventions + Knowledge */}
                      {(repoContext.conventions?.length > 0 || repoContext.knowledgeFiles?.length > 0) && (
                        <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm border border-border/50 bg-muted/30">
                          <FileText className="h-4 w-4 shrink-0 text-teal-500" />
                          <span className="text-muted-foreground">
                            {repoContext.conventions?.length > 0 && (
                              <><strong className="text-foreground">{repoContext.conventions.length}</strong> convention{repoContext.conventions.length > 1 ? 's' : ''}</>
                            )}
                            {repoContext.conventions?.length > 0 && repoContext.knowledgeFiles?.length > 0 && ' · '}
                            {repoContext.knowledgeFiles?.length > 0 && (
                              <><strong className="text-foreground">{repoContext.knowledgeFiles.length}</strong> knowledge file{repoContext.knowledgeFiles.length > 1 ? 's' : ''}</>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-8">
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300",
                        msg.role === 'assistant' ? "flex-row" : "flex-row-reverse"
                      )}
                    >
                      <Avatar className={cn(
                        "h-8 w-8 shrink-0 mt-0.5 border ring-2 ring-offset-2 ring-transparent",
                        msg.role === 'assistant' ? "ring-primary/10" : "ring-muted"
                      )}>
                        <AvatarFallback
                          className={cn(
                            'text-[10px] font-bold',
                            msg.role === 'assistant'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {msg.role === 'assistant' ? 'AI' : 'YOU'}
                        </AvatarFallback>
                      </Avatar>
                      <div className={cn(
                        "flex-1 flex flex-col min-w-0 group",
                        msg.role === 'user' ? "items-end text-right" : "items-start text-left"
                      )}>
                        <span className="text-[10px] font-bold text-muted-foreground/60 mb-2 uppercase tracking-widest px-1">
                          {msg.role === 'assistant' ? 'Architect Engine' : 'You'}
                        </span>
                        <div className={cn(
                          "max-w-[95%] text-sm rounded-2xl p-4 leading-relaxed",
                          msg.role === 'assistant'
                            ? "bg-card border border-border/50 text-foreground shadow-sm"
                            : "bg-primary text-primary-foreground shadow-md shadow-primary/10"
                        )}>
                          {msg.role === 'assistant'
                            ? <div className="prose prose-sm dark:prose-invert max-w-none">{renderAssistantContent(msg.content, allSpecs.length)}</div>
                            : <p className="whitespace-pre-wrap">{msg.content}</p>
                          }
                          {streaming && i === messages.length - 1 && msg.role === 'assistant' && (
                            <div className="flex gap-1 mt-3 h-4 items-center">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce delay-0" />
                              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce delay-150" />
                              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce delay-300" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Input Floating Wrapper */}
            <div className="p-6 shrink-0 bg-transparent relative z-30">
              <div className="relative flex flex-col rounded-3xl bg-card/80 backdrop-blur-xl border border-border/50 shadow-2xl ring-4 ring-primary/5 overflow-hidden transition-all focus-within:ring-primary/10 focus-within:border-primary/30">
                <Textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={isExistingApp ? "Describe the features to add..." : "Describe the app you want to build..."}
                  className="w-full border-0 p-4 min-h-[60px] max-h-[160px] outline-none text-sm leading-relaxed text-foreground resize-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent pr-14"
                  rows={1}
                  disabled={streaming}
                />
                <div className="flex items-center justify-between p-3 pt-0">
                  <div className="flex items-center gap-1.5 opacity-40 hover:opacity-100 transition-opacity">
                    <Terminal className="h-3 w-3" />
                    <span className="text-[10px] font-medium tracking-tight">DECOMPOSITION ENGINE v2.0</span>
                  </div>
                  <div className="absolute right-3 bottom-3">
                    <Button
                      size="icon"
                      className={cn(
                        'rounded-2xl h-9 w-9 p-0 shadow-lg transition-all',
                        input.trim()
                          ? 'bg-primary text-primary-foreground hover:scale-105 active:scale-95'
                          : 'bg-muted text-muted-foreground'
                      )}
                      disabled={!input.trim() || streaming}
                      onClick={() => handleSend()}
                    >
                      {streaming ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowUp className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Pane: Multi-Spec Preview */}
          <div className="flex flex-1 flex-col bg-slate-950 text-slate-300 relative overflow-hidden group/preview">

            {/* Tab Bar */}
            <div className="border-b border-white/5 bg-slate-900/50 shrink-0">
              <div className="flex items-center h-12 px-4 justify-between">
                {/* Spec tabs */}
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-none flex-1 mr-4">
                  {allSpecs.length > 0 ? (
                    allSpecs.map((spec, idx) => (
                      <button
                        key={spec.filename}
                        onClick={() => setActiveTab(idx)}
                        className={cn(
                          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all shrink-0',
                          idx === activeTab
                            ? 'bg-white/10 text-white'
                            : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                        )}
                      >
                        {spec.kind === 'app' ? (
                          <Package className="h-3 w-3 text-blue-400" />
                        ) : (
                          <Layers className="h-3 w-3 text-emerald-400" />
                        )}
                        <span className="max-w-[120px] truncate">{spec.name}</span>
                        {spec.phase && (
                          <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full border font-bold', phaseColor(spec.phase))}>
                            P{spec.phase}
                          </span>
                        )}
                        {spec.dependsOn && spec.dependsOn.length > 0 && (
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded-full border bg-sky-500/10 text-sky-400 border-sky-500/20 font-bold"
                            title={`Depends on: ${spec.dependsOn.join(', ')}`}
                          >
                            ←{spec.dependsOn.length}
                          </span>
                        )}
                        {savedSpecs.has(spec.filename) && (
                          <Check className="h-3 w-3 text-emerald-400" />
                        )}
                      </button>
                    ))
                  ) : (
                    <div className="flex items-center gap-2 text-slate-500">
                      <FileText className="h-4 w-4 text-emerald-400/30" />
                      <span className="text-[11px] font-bold tracking-widest uppercase">
                        {streaming ? 'generating specs...' : 'awaiting specs'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-3 shrink-0">
                  {allSpecs.length > 0 && (
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                      <span className="bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded font-bold">
                        {allSpecs.filter(s => s.kind === 'app').length} app
                      </span>
                      <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-bold">
                        {allSpecs.filter(s => s.kind === 'feature').length} features
                      </span>
                    </div>
                  )}
                  {streaming && (
                    <div className="px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-bold tracking-tighter animate-pulse">
                      LIVE
                    </div>
                  )}
                  <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded">
                    <Check className="h-3 w-3 text-emerald-500" /> YAML v1.2
                  </div>
                </div>
              </div>
            </div>

            {/* Preview Pane Content */}
            <div className="flex-1 overflow-auto bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.03),transparent)]">
              {activeSpec ? (
                <div className="p-10 font-mono text-sm leading-relaxed selection:bg-emerald-500/30">
                  {/* Spec header */}
                  <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
                    <div className="flex items-center gap-3">
                      {activeSpec.kind === 'app' ? (
                        <div className="p-2 rounded-lg bg-blue-500/10">
                          <Package className="h-4 w-4 text-blue-400" />
                        </div>
                      ) : (
                        <div className="p-2 rounded-lg bg-emerald-500/10">
                          <Layers className="h-4 w-4 text-emerald-400" />
                        </div>
                      )}
                      <div>
                        <h3 className="text-white text-sm font-bold">{activeSpec.name}</h3>
                        <p className="text-slate-500 text-[10px] font-mono">{activeSpec.filename}</p>
                      </div>
                      {activeSpec.phase && (
                        <span className={cn('text-[10px] px-2 py-1 rounded-full border font-bold ml-2', phaseColor(activeSpec.phase))}>
                          Phase {activeSpec.phase}
                        </span>
                      )}
                    </div>
                    {!savedSpecs.has(activeSpec.filename) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-3 text-[10px] font-bold gap-1.5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/50"
                        onClick={() => handleSaveSpec(activeSpec)}
                        disabled={saving || streaming}
                      >
                        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        Save this spec
                      </Button>
                    ) : (
                      <span className="text-emerald-400 text-[10px] font-bold flex items-center gap-1.5">
                        <Check className="h-3 w-3" /> Saved
                      </span>
                    )}
                  </div>
                  <pre className="relative z-10 whitespace-pre-wrap">
                    <code className="text-emerald-300/90">{activeSpec.yaml}</code>
                  </pre>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center gap-6 p-10">
                  <div className="relative">
                    <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-150 animate-pulse" />
                    <div className="relative flex h-24 w-24 items-center justify-center rounded-[2.5rem] bg-slate-900 border border-white/5 shadow-2xl">
                      <Terminal className="h-10 w-10 text-emerald-400/20" />
                    </div>
                  </div>
                  <div className="space-y-2 relative">
                    <h4 className="text-slate-100 font-bold tracking-tight">Awaiting Architecture</h4>
                    <p className="text-xs text-slate-500 leading-relaxed max-w-[320px]">
                      Your specs will appear here as tabs — one app spec and multiple feature specs, organized by phase.
                    </p>
                  </div>

                  {/* Decorative terminal lines */}
                  <div className="flex flex-col gap-2 opacity-5 mt-4">
                     <div className="w-64 h-2 bg-white rounded-full" />
                     <div className="w-48 h-2 bg-white rounded-full ml-8" />
                     <div className="w-56 h-2 bg-white rounded-full ml-4" />
                  </div>
                </div>
              )}
            </div>

            {/* Footer Bar */}
            <div className="h-10 border-t border-white/5 bg-slate-900/80 shrink-0 px-6 flex items-center justify-between text-[10px] font-mono text-slate-500 uppercase tracking-widest">
               <div className="flex items-center gap-4">
                  <span>UTF-8</span>
                  <span>{allSpecs.length > 0 ? `${allSpecs.length} specs generated` : 'YAML Schema Validated'}</span>
               </div>
               <div className="flex items-center gap-4">
                  <span>Lines: {activeSpec?.yaml.split('\n').length || 0}</span>
                  <span>LF</span>
               </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Render assistant content — collapse spec blocks (shown in preview pane)
function renderAssistantContent(content: string, specCount: number) {
  // Regex to match the delimited spec blocks
  const specBlockPattern = /=== (?:APP_SPEC|FEATURE_SPEC):\s*\S+\s*===[\s\S]*?=== END_SPEC ===/g;

  // Also match any old-style yaml code blocks
  const yamlBlockPattern = /```yaml[\s\S]*?(?:```|$)/g;

  // Replace spec blocks with a collapsed indicator
  let cleaned = content.replace(specBlockPattern, '___SPEC_BLOCK___');
  cleaned = cleaned.replace(yamlBlockPattern, '___SPEC_BLOCK___');

  const parts = cleaned.split('___SPEC_BLOCK___');

  return parts.map((part, i) => {
    const elements: React.ReactNode[] = [];

    if (part.trim()) {
      elements.push(<p key={`text-${i}`} className="mb-4 last:mb-0">{part.trim()}</p>);
    }

    // Add a collapsed spec indicator between text parts (not after the last one)
    if (i < parts.length - 1) {
      elements.push(
        <div
          key={`spec-${i}`}
          className="my-4 px-4 py-3 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-3 group transition-all hover:bg-emerald-500/10"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 shrink-0">
             <FileText className="h-4 w-4" />
          </div>
          <div className="flex flex-col gap-0.5">
             <span className="font-bold tracking-tight uppercase tracking-widest text-[9px]">Spec Generated</span>
             <span className="font-medium opacity-80">View in the preview panel →</span>
          </div>
          <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
             <Check className="h-4 w-4" />
          </div>
        </div>
      );
    }

    return elements;
  });
}
