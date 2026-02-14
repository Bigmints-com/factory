'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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

export function QueueView() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [stats, setStats] = useState<QueueStats>({
    pending: 0, running: 0, completed: 0, failed: 0, 'needs-attention': 0, total: 0,
  });
  const [isRunning, setIsRunning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [processResult, setProcessResult] = useState<{
    processed: number;
    completed: number;
    failed: number;
  } | null>(null);

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
    const interval = setInterval(fetchQueue, 3000); // Poll while running
    return () => clearInterval(interval);
  }, [fetchQueue]);

  const handleStart = async () => {
    setIsProcessing(true);
    setProcessResult(null);
    try {
      const res = await fetch('/api/queue/start', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setProcessResult({
          processed: data.processed,
          completed: data.completed,
          failed: data.failed,
        });
      }
      await fetchQueue();
    } catch {
      console.error('Failed to start queue');
    } finally {
      setIsProcessing(false);
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
    return `${(ms / 1000).toFixed(1)}s`;
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
            disabled={isProcessing || stats.pending === 0}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Processing...
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

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="mt-3 ml-7 space-y-3">
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p><strong>File:</strong> {item.spec_file}</p>
                        {item.started_at && <p><strong>Started:</strong> {new Date(item.started_at).toLocaleString()}</p>}
                        {item.completed_at && <p><strong>Completed:</strong> {new Date(item.completed_at).toLocaleString()}</p>}
                      </div>

                      {item.error && (
                        <div className="rounded-md bg-red-500/10 border border-red-500/20 p-3">
                          <p className="text-xs text-red-400 font-medium mb-1">Error</p>
                          <p className="text-xs text-red-300 font-mono whitespace-pre-wrap">{item.error}</p>
                        </div>
                      )}

                      {item.output && (
                        <div className="rounded-md bg-card border p-3 max-h-64 overflow-y-auto">
                          <p className="text-xs text-muted-foreground font-medium mb-1">Build Output</p>
                          <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap">{item.output}</pre>
                        </div>
                      )}
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
