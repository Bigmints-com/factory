'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Play,
  Trash2,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Zap,
  FileCode2,
  Brain,
  FlaskConical,
  Wrench,
  ShieldCheck,
  FolderOpen,
  Terminal,
  Sparkles,
  RefreshCw,
} from 'lucide-react';

interface QueueItem {
  id: string;
  spec_file: string;
  kind: string;
  status: string;
  priority: number;
  added_at: string;
  started_at: string | null;
  completed_at: string | null;
  output: string;
  error: string | null;
  duration_ms: number | null;
}

interface QueueStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  'needs-attention': number;
  total: number;
}

/** Parsed pipeline activity step */
interface ActivityStep {
  id: string;
  label: string;
  status: 'success' | 'error' | 'running' | 'info' | 'warning';
  icon: typeof CheckCircle2;
  details: string[];
  substeps: { text: string; status: 'success' | 'error' | 'info' }[];
}

const statusConfig: Record<string, {
  label: string;
  color: string;
  icon: typeof CheckCircle2;
  bg: string;
}> = {
  pending: { label: 'Pending', color: 'text-muted-foreground', icon: Clock, bg: 'bg-muted' },
  running: { label: 'Running', color: 'text-blue-400', icon: Loader2, bg: 'bg-blue-500/10' },
  completed: { label: 'Completed', color: 'text-emerald-400', icon: CheckCircle2, bg: 'bg-emerald-500/10' },
  failed: { label: 'Failed', color: 'text-red-400', icon: XCircle, bg: 'bg-red-500/10' },
  'needs-attention': { label: 'Attention', color: 'text-amber-400', icon: AlertTriangle, bg: 'bg-amber-500/10' },
};

/* ── Parse engine output into structured steps ── */

function parseActivities(output: string): ActivityStep[] {
  if (!output || output.trim().length === 0) return [];

  const lines = output.split('\n');
  const steps: ActivityStep[] = [];
  let current: ActivityStep | null = null;
  let stepCounter = 0;

  const pushCurrent = () => {
    if (current) steps.push(current);
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Main step: ● [1/7] Validating spec...
    const stepMatch = line.match(/^●\s*\[(\d+)\/(\d+)\]\s*(.+)/);
    if (stepMatch) {
      pushCurrent();
      stepCounter++;
      const label = stepMatch[3].replace(/\.{3}$/, '');
      current = {
        id: `step-${stepCounter}`,
        label,
        status: 'running',
        icon: getStepIcon(label),
        details: [],
        substeps: [],
      };
      continue;
    }

    // Pipeline sub-steps: ● [1/5] Planning build...
    const pipelineMatch = line.match(/^●\s*\[(\d+)\/(\d+)\]\s*(.+)/);
    if (pipelineMatch && !stepMatch) {
      pushCurrent();
      stepCounter++;
      const label = pipelineMatch[3].replace(/\.{3}$/, '');
      current = {
        id: `step-${stepCounter}`,
        label,
        status: 'running',
        icon: getStepIcon(label),
        details: [],
        substeps: [],
      };
      continue;
    }

    // Generic step marker: ● Testing in /path/...  or  ● Using Ollama...  or  ● Feeding errors...
    const genericStepMatch = line.match(/^●\s+(.+)/);
    if (genericStepMatch) {
      const text = genericStepMatch[1];
      // Check if this is a major phase marker
      if (text.startsWith('Testing in ') || text.startsWith('Feeding errors') || text.startsWith('Using ')) {
        if (current) {
          current.substeps.push({ text, status: 'info' });
        }
      } else {
        pushCurrent();
        stepCounter++;
        current = {
          id: `step-${stepCounter}`,
          label: text.replace(/\.{3}$/, ''),
          status: 'running',
          icon: getStepIcon(text),
          details: [],
          substeps: [],
        };
      }
      continue;
    }

    // Success marker: ✓ ...
    const successMatch = line.match(/^✓\s+(.+)/);
    if (successMatch) {
      if (current) {
        current.status = 'success';
        current.substeps.push({ text: successMatch[1], status: 'success' });
      }
      continue;
    }

    // Error marker: ✗ ...
    const errorMatch = line.match(/^[✗✘]\s+(.+)/);
    if (errorMatch) {
      if (current) {
        current.status = 'error';
        current.substeps.push({ text: errorMatch[1], status: 'error' });
      }
      continue;
    }

    // Warning/error count: ! N error(s) found
    const warningMatch = line.match(/^!\s+(.+)/);
    if (warningMatch) {
      if (current) {
        current.status = 'error';
        current.substeps.push({ text: warningMatch[1], status: 'error' });
      }
      continue;
    }

    // Arrow info: → Calling Ollama...  or  → App: ... 
    const arrowMatch = line.match(/^→\s+(.+)/);
    if (arrowMatch) {
      if (current) {
        current.substeps.push({ text: arrowMatch[1], status: 'info' });
      }
      continue;
    }

    // Build header: 🏭 Build: ...
    if (line.startsWith('🏭')) {
      continue; // skip header
    }

    // Separator lines
    if (/^[═─]{5,}/.test(line)) continue;

    // Token / file counts
    const tokenMatch = line.match(/^\s*Tokens\s+generated:\s*(\d+)/i);
    if (tokenMatch && current) {
      current.substeps.push({ text: `${tokenMatch[1]} tokens generated`, status: 'info' });
      continue;
    }

    // Indented detail lines
    if (line.length > 0 && current) {
      current.details.push(line);
    }
  }

  pushCurrent();

  // If the last step is still "running", and the overall build is done, mark accordingly
  return steps;
}

function getStepIcon(label: string): typeof CheckCircle2 {
  const l = label.toLowerCase();
  if (l.includes('validat')) return ShieldCheck;
  if (l.includes('gather') || l.includes('context')) return FolderOpen;
  if (l.includes('plan')) return Brain;
  if (l.includes('generat') || l.includes('code')) return FileCode2;
  if (l.includes('test') || l.includes('running')) return FlaskConical;
  if (l.includes('writ') || l.includes('file')) return FileCode2;
  if (l.includes('commit') || l.includes('push') || l.includes('git')) return Sparkles;
  if (l.includes('feed') || l.includes('iterat') || l.includes('fix')) return RefreshCw;
  if (l.includes('install') || l.includes('npm') || l.includes('pnpm')) return Terminal;
  if (l.includes('lint') || l.includes('eslint')) return Wrench;
  if (l.includes('tsc') || l.includes('typescript')) return Wrench;
  if (l.includes('jest') || l.includes('test')) return FlaskConical;
  return Zap;
}

const stepStatusStyles: Record<string, { border: string; text: string; bg: string }> = {
  success: { border: 'border-emerald-500/30', text: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  error: { border: 'border-red-500/30', text: 'text-red-400', bg: 'bg-red-500/10' },
  running: { border: 'border-blue-500/30', text: 'text-blue-400', bg: 'bg-blue-500/10' },
  info: { border: 'border-muted', text: 'text-muted-foreground', bg: 'bg-muted/50' },
  warning: { border: 'border-amber-500/30', text: 'text-amber-400', bg: 'bg-amber-500/10' },
};

/* ── Activity Timeline Component ── */

function ActivityTimeline({ output, error, itemStatus }: { output: string; error: string | null; itemStatus: string }) {
  const [showRaw, setShowRaw] = useState(false);

  const activities = useMemo(() => {
    const steps = parseActivities(output);
    // If item is failed, mark the last running step as error
    if (itemStatus === 'failed' && steps.length > 0) {
      const lastStep = steps[steps.length - 1];
      if (lastStep.status === 'running') lastStep.status = 'error';
    }
    // If item is completed, mark all running steps as success
    if (itemStatus === 'completed') {
      for (const s of steps) {
        if (s.status === 'running') s.status = 'success';
      }
    }
    return steps;
  }, [output, itemStatus]);

  if (activities.length === 0 && !error) {
    return output ? (
      <div className="rounded-md bg-card border p-3 max-h-64 overflow-y-auto">
        <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap">{output}</pre>
      </div>
    ) : null;
  }

  return (
    <div className="space-y-2">
      {/* Activity Steps */}
      <div className="relative">
        {/* Vertical connector line */}
        <div className="absolute left-[13px] top-3 bottom-3 w-px bg-border" />

        <div className="space-y-1">
          {activities.map((step, idx) => {
            const style = stepStatusStyles[step.status] || stepStatusStyles.info;
            const StepIcon = step.icon;
            const isLast = idx === activities.length - 1;

            return (
              <div key={step.id} className="relative pl-9">
                {/* Step dot / icon */}
                <div className={`absolute left-0 top-1 w-7 h-7 rounded-full flex items-center justify-center z-10 ${style.bg} border ${style.border}`}>
                  {step.status === 'running' && itemStatus === 'running' ? (
                    <Loader2 className={`h-3.5 w-3.5 ${style.text} animate-spin`} />
                  ) : step.status === 'success' ? (
                    <CheckCircle2 className={`h-3.5 w-3.5 ${style.text}`} />
                  ) : step.status === 'error' ? (
                    <XCircle className={`h-3.5 w-3.5 ${style.text}`} />
                  ) : (
                    <StepIcon className={`h-3.5 w-3.5 ${style.text}`} />
                  )}
                </div>

                {/* Step content */}
                <div className={`rounded-lg border px-3 py-2 ${isLast && step.status === 'error' ? style.border + ' ' + style.bg : 'border-border/50'}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-medium ${step.status === 'error' ? style.text : 'text-foreground'}`}>
                      {step.label}
                    </span>
                    {step.status === 'success' && (
                      <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-400 h-4 px-1">
                        Done
                      </Badge>
                    )}
                    {step.status === 'error' && (
                      <Badge variant="outline" className="text-[9px] border-red-500/30 text-red-400 h-4 px-1">
                        Failed
                      </Badge>
                    )}
                  </div>

                  {/* Sub-steps */}
                  {step.substeps.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {step.substeps.map((sub, si) => (
                        <div key={si} className="flex items-start gap-1.5 text-[11px]">
                          {sub.status === 'success' && <CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />}
                          {sub.status === 'error' && <XCircle className="h-3 w-3 text-red-400 mt-0.5 shrink-0" />}
                          {sub.status === 'info' && <ChevronRight className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />}
                          <span className={sub.status === 'error' ? 'text-red-300' : 'text-muted-foreground'}>
                            {sub.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Error details (indented lines) */}
                  {step.details.length > 0 && step.status === 'error' && (
                    <div className="mt-2 rounded bg-red-500/5 border border-red-500/10 p-2 max-h-32 overflow-y-auto">
                      <pre className="text-[10px] font-mono text-red-300/80 whitespace-pre-wrap">
                        {step.details.join('\n')}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-md bg-red-500/10 border border-red-500/20 p-3 ml-9">
          <p className="text-xs text-red-400 font-medium mb-1">Error</p>
          <p className="text-[11px] text-red-300 font-mono whitespace-pre-wrap line-clamp-6">{error}</p>
        </div>
      )}

      {/* Raw output toggle */}
      {output && (
        <div className="ml-9">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowRaw(!showRaw)}
            className="text-[10px] text-muted-foreground h-6 px-2"
          >
            <Terminal className="h-3 w-3 mr-1" />
            {showRaw ? 'Hide' : 'Show'} Raw Output
          </Button>
          {showRaw && (
            <div className="rounded-md bg-card border p-3 max-h-64 overflow-y-auto mt-1">
              <pre className="text-[10px] font-mono text-foreground/70 whitespace-pre-wrap">{output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main Queue View ── */

export function QueueView() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [stats, setStats] = useState<QueueStats>({
    pending: 0, running: 0, completed: 0, failed: 0, 'needs-attention': 0, total: 0,
  });
  const [isRunning, setIsRunning] = useState(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/queue');
      const data = await res.json();
      setItems(data.items || []);
      setStats(data.stats || { pending: 0, running: 0, completed: 0, failed: 0, 'needs-attention': 0, total: 0 });
      setIsRunning(data.isRunning || false);
    } catch {
      console.error('Failed to fetch queue');
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 3000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  const handleStart = async () => {
    try {
      await fetch('/api/queue/start', { method: 'POST' });
      // Immediately poll to pick up the running state
      await fetchQueue();
    } catch {
      console.error('Failed to start queue');
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await fetch('/api/queue', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      await fetchQueue();
    } catch {
      console.error('Failed to remove item');
    }
  };

  const handleRetry = async (id: string) => {
    try {
      await fetch(`/api/queue/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry' }),
      });
      await fetchQueue();
    } catch {
      console.error('Failed to retry item');
    }
  };

  const handleClearCompleted = async () => {
    const completed = items.filter(i => i.status === 'completed');
    for (const item of completed) {
      await handleRemove(item.id);
    }
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const specName = (path: string) => {
    return path.split('/').pop()?.replace('.yaml', '') || path;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Build Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage and execute your build pipeline
          </p>
        </div>
        <div className="flex items-center gap-3">
          {stats.completed > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearCompleted}
              className="text-xs"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Clear Done ({stats.completed})
            </Button>
          )}
          <Button
            onClick={handleStart}
            disabled={isRunning || stats.pending === 0}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isRunning ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 mr-1.5" />
                Start Queue ({stats.pending})
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-5 gap-3">
        {(['pending', 'running', 'completed', 'failed', 'needs-attention'] as const).map((status) => {
          const cfg = statusConfig[status];
          const Icon = cfg.icon;
          return (
            <Card key={status} className={stats[status] > 0 ? '' : 'opacity-50'}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${cfg.color} ${status === 'running' ? 'animate-spin' : ''}`} />
                  <span className="text-lg font-bold">{stats[status]}</span>
                  <span className="text-xs text-muted-foreground">{cfg.label}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Process result banner */}
      {processResult && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3 text-sm">
              <Zap className="h-4 w-4 text-emerald-400" />
              <span>
                Processed <strong>{processResult.processed}</strong> items:
                <span className="text-emerald-400 ml-2">{processResult.completed} completed</span>
                {processResult.failed > 0 && (
                  <span className="text-red-400 ml-2">{processResult.failed} failed</span>
                )}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Queue items */}
      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-sm text-muted-foreground">Queue is empty</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add specs from the Specs tab to start building
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const cfg = statusConfig[item.status] || statusConfig.pending;
            const Icon = cfg.icon;
            const isExpanded = expandedItem === item.id;

            return (
              <Card key={item.id} className="relative overflow-hidden">
                <div className={`absolute left-0 top-0 h-full w-1 ${
                  item.status === 'completed' ? 'bg-emerald-500' :
                  item.status === 'failed' ? 'bg-red-500' :
                  item.status === 'running' ? 'bg-blue-500' :
                  item.status === 'needs-attention' ? 'bg-amber-500' :
                  'bg-muted-foreground/30'
                }`} />
                <CardContent className="pt-4 pb-3 pl-5">
                  {/* Item header */}
                  <div className="flex items-center justify-between">
                    <button
                      className="flex items-center gap-3 text-left flex-1"
                      onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${cfg.color} ${item.status === 'running' ? 'animate-spin' : ''}`} />
                        <span className="font-medium text-sm">{specName(item.spec_file)}</span>
                      </div>
                      <Badge variant="outline" className={`text-[10px] ${
                        item.kind === 'FeatureSpec' ? 'border-purple-500/30 text-purple-400' : 'border-emerald-500/30 text-emerald-400'
                      }`}>
                        {item.kind === 'FeatureSpec' ? 'Feature' : 'App'}
                      </Badge>
                      <span className="text-xs text-muted-foreground ml-auto mr-3">
                        {formatTime(item.added_at)}
                        {item.duration_ms ? ` · ${formatDuration(item.duration_ms)}` : ''}
                      </span>
                    </button>
                    <div className="flex items-center gap-1">
                      {item.status === 'failed' && (
                        <Button variant="ghost" size="sm" onClick={() => handleRetry(item.id)} className="h-7 px-2">
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {item.status !== 'running' && (
                        <Button variant="ghost" size="sm" onClick={() => handleRemove(item.id)} className="h-7 px-2 text-muted-foreground hover:text-red-400">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Expanded: Activity Timeline */}
                  {isExpanded && (
                    <div className="mt-4 ml-7">
                      {/* Meta info */}
                      <div className="text-[11px] text-muted-foreground space-y-0.5 mb-3 pl-1">
                        <p><span className="text-muted-foreground/60">Spec:</span> {item.spec_file.split('/').pop()}</p>
                        {item.started_at && <p><span className="text-muted-foreground/60">Started:</span> {new Date(item.started_at).toLocaleString()}</p>}
                        {item.completed_at && <p><span className="text-muted-foreground/60">Finished:</span> {new Date(item.completed_at).toLocaleString()}</p>}
                        {item.duration_ms && <p><span className="text-muted-foreground/60">Duration:</span> {formatDuration(item.duration_ms)}</p>}
                      </div>

                      {/* Activity timeline */}
                      <ActivityTimeline
                        output={item.output}
                        error={item.error}
                        itemStatus={item.status}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

