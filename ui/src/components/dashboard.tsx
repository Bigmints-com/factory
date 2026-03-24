'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Sidebar } from '@/components/sidebar';
import { AddProject } from '@/components/add-project';
import { SpecCard } from '@/components/spec-card';
import { SpecEditor } from '@/components/spec-editor';
import { SpecChat } from '@/components/spec-chat';
import { BuildLog } from '@/components/build-log';
import { ReportViewer } from '@/components/report-viewer';
import { QueueView } from '@/components/queue-view';
import { KnowledgeView } from '@/components/knowledge-view';
import { SettingsView } from '@/components/settings-view';
import { SkillsView } from '@/components/skills-view';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileText, Package, CheckCircle2, AlertCircle, Activity, Puzzle, Server, Globe, Database, Layers, ListPlus, ListOrdered, X, PanelRight, Terminal, FolderOpen, Plug, Settings, Eye, Plus, Loader2 as Spinner, Sparkles, Rocket, GitBranch, Clock, CircleDot, CircleCheck, CircleX, AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface Spec {
  file: string;
  valid: boolean;
  status: string;
  metadata: Record<string, any>;
  deployment?: Record<string, any>;
  database?: Record<string, any>;
  api?: Record<string, any>;
  features?: Record<string, any>;
}



interface FeatureSpecItem {
  file: string;
  kind: 'FeatureSpec';
  valid: boolean;
  status: string;
  feature: Record<string, any>;
  target: Record<string, any>;
  pages: any[];
  model: Record<string, any>;
  phase?: number;
  dependsOn?: string[];
}

interface ValidationCheck {
  passed: boolean;
  name: string;
  message: string;
}

const VALID_TABS = ['dashboard', 'queue', 'specs', 'skills', 'reports', 'knowledge', 'projects', 'integrations', 'settings'];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showAddProject, setShowAddProject] = useState(false);
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [featureSpecs, setFeatureSpecs] = useState<FeatureSpecItem[]>([]);
  const [reportEntries, setReportEntries] = useState<any[]>([]);
  const [reportStats, setReportStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [buildOutput, setBuildOutput] = useState('');
  const [validationResult, setValidationResult] = useState<{
    passed: boolean;
    checks: ValidationCheck[];
  } | null>(null);
  const [activeAction, setActiveAction] = useState<{
    type: 'validate' | 'build' | 'feature-validate' | 'feature-build';
    file: string;
  } | null>(null);
  const [outputPanelOpen, setOutputPanelOpen] = useState(false);
  const [hasProjects, setHasProjects] = useState(true); // optimistic
  const [activeProject, setActiveProject] = useState<{ id: string; name: string; path: string } | null>(null);
  const [projectCount, setProjectCount] = useState(0);
  const [projectRefreshKey, setProjectRefreshKey] = useState(0);
  const [editingSpec, setEditingSpec] = useState<{ file: string; name: string } | null>(null);
  const [showSpecChat, setShowSpecChat] = useState(false);
  const [isBuildingAll, setIsBuildingAll] = useState(false);
  const [queueStatusMap, setQueueStatusMap] = useState<Record<string, { status: string; id: string }>>({}); 
  const [queueRunning, setQueueRunning] = useState(false);
  const [buildEngine, setBuildEngine] = useState<'factory' | 'gemini-cli'>('factory');
  const [geminiCliAvailable, setGeminiCliAvailable] = useState<boolean | null>(null);
  const logOffsetRef = useRef(0);

  const fetchQueueStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/queue');
      const data = await res.json();
      const map: Record<string, { status: string; id: string }> = {};
      for (const item of (data.items || [])) {
        map[item.spec_file] = { status: item.status, id: item.id };
      }
      setQueueStatusMap(map);
      // Track if queue is running
      const running = (data.items || []).some((i: any) => i.status === 'running');
      setQueueRunning(running || data.isRunning || false);
    } catch {}
  }, []);

  const fetchSpecs = useCallback(async () => {
    try {
      const res = await fetch('/api/specs');
      const data = await res.json();
      setSpecs(data.specs || []);
      setFeatureSpecs(data.featureSpecs || []);
    } catch {
      console.error('Failed to fetch specs');
    }
  }, []);

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch('/api/knowledge?limit=100');
      const data = await res.json();
      setReportEntries(data.entries || []);
      setReportStats(data.stats || null);
    } catch {
      console.error('Failed to fetch reports');
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      const projects = data.projects || [];
      setProjectCount(projects.length);
      setHasProjects(projects.length > 0);
      if (!projects.length) setShowAddProject(true);
      const active = projects.find((p: any) => p.id === data.activeId);
      setActiveProject(active || null);
    } catch {}
  }, []);

  useEffect(() => {
    Promise.all([fetchProjects(), fetchSpecs(), fetchReports(), fetchQueueStatus()]).finally(() => setLoading(false));

    // Handle initial tab from hash after mount
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '');
      if (VALID_TABS.includes(hash)) {
        if (hash === 'projects') {
          setShowAddProject(true);
        } else {
          setActiveTab(hash);
        }
      }
    }
    // Check Gemini CLI availability
    fetch('/api/settings/gemini-cli-check')
      .then(r => r.json())
      .then(d => setGeminiCliAvailable(d.available))
      .catch(() => setGeminiCliAvailable(false));
  }, [fetchProjects, fetchSpecs, fetchReports, fetchQueueStatus]);

  // Sync tab to URL hash
  useEffect(() => {
    const tab = showAddProject ? 'projects' : activeTab;
    window.location.hash = tab;
  }, [activeTab, showAddProject]);

  // Live log polling when queue is running
  useEffect(() => {
    if (!queueRunning) {
      logOffsetRef.current = 0;
      return;
    }
    // Auto-open the output panel
    setBuildOutput('Waiting for build output...\n');
    logOffsetRef.current = 0;
    setOutputPanelOpen(true);

    const pollLog = async () => {
      try {
        const res = await fetch(`/api/queue/log?offset=${logOffsetRef.current}`);
        const data = await res.json();
        if (data.log) {
          setBuildOutput(prev => prev + data.log);
          logOffsetRef.current = data.offset;
        }
      } catch { /* ignore */ }
    };
    pollLog();
    const interval = setInterval(pollLog, 1500);
    return () => clearInterval(interval);
  }, [queueRunning]);

  const handleValidate = async (file: string) => {
    setActiveAction({ type: 'validate', file });
    setValidationResult(null);
    setBuildOutput('');
    setOutputPanelOpen(true);

    try {
      const res = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specFile: file }),
      });
      const data = await res.json();
      setValidationResult({ passed: data.passed, checks: data.checks || [] });
      if (data.raw) setBuildOutput(data.raw);
      if (data.passed) {
        toast.success('Validation passed', { description: file });
      } else {
        toast.error('Validation failed', { description: file });
      }
    } catch {
      setValidationResult({ passed: false, checks: [{ passed: false, name: 'Error', message: 'Validation request failed' }] });
      toast.error('Validation request failed');
    } finally {
      setActiveAction(null);
    }
  };

  const handleBuild = async (file: string) => {
    setActiveAction({ type: 'build', file });
    setValidationResult(null);
    setBuildOutput('Enqueuing spec...\n');
    setOutputPanelOpen(true);

    try {
      // 1. Enqueue the spec
      const enqueueRes = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specFile: file, kind: 'AppSpec', engine: buildEngine }),
      });
      const enqueueData = await enqueueRes.json();

      if (!enqueueRes.ok) {
        setBuildOutput(`Enqueue failed: ${enqueueData.error || 'Unknown error'}`);
        toast.error('Failed to enqueue', { description: enqueueData.error });
        return;
      }

      setBuildOutput('Spec queued. Starting build queue...\n');
      toast.success('Spec queued', { description: file });

      // 2. Start the queue
      const startRes = await fetch('/api/queue/start', { method: 'POST' });
      const startData = await startRes.json();

      if (!startRes.ok) {
        setBuildOutput(`Queue start failed: ${startData.error || 'Unknown error'}`);
        toast.error('Queue start failed', { description: startData.error });
        return;
      }

      // 3. Show results
      const output = startData.results
        ?.map((r: any) => `[${r.status.toUpperCase()}] ${r.specFile}\n${r.output || r.error || ''}`)
        .join('\n\n') || 'Queue processed';
      setBuildOutput(output);
      await fetchSpecs();

      if (startData.completed > 0) {
        await fetchReports();
        toast.success(`Build completed (${startData.completed} succeeded, ${startData.failed} failed)`);
      } else if (startData.failed > 0) {
        toast.error(`Build failed (${startData.failed} failed)`);
      }
    } catch {
      setBuildOutput('Build request failed');
      toast.error('Build request failed');
    } finally {
      setActiveAction(null);
    }
  };

  const handleFeatureAction = async (file: string, action: 'validate' | 'build') => {
    const actionType = action === 'validate' ? 'feature-validate' : 'feature-build';
    setActiveAction({ type: actionType as any, file });
    setValidationResult(null);
    setBuildOutput(action === 'build' ? 'Enqueuing feature...\n' : '');
    setOutputPanelOpen(true);

    try {
      if (action === 'build') {
        // Route feature builds through the queue
        const enqueueRes = await fetch('/api/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ specFile: file, kind: 'FeatureSpec', engine: buildEngine }),
        });
        const enqueueData = await enqueueRes.json();

        if (!enqueueRes.ok) {
          setBuildOutput(`Enqueue failed: ${enqueueData.error || 'Unknown error'}`);
          toast.error('Failed to enqueue', { description: enqueueData.error });
          return;
        }

        setBuildOutput('Feature queued. Starting build queue...\n');
        toast.success('Feature queued', { description: file });

        const startRes = await fetch('/api/queue/start', { method: 'POST' });
        const startData = await startRes.json();

        if (!startRes.ok) {
          setBuildOutput(`Queue start failed: ${startData.error || 'Unknown error'}`);
          toast.error('Queue start failed', { description: startData.error });
          return;
        }

        const output = startData.results
          ?.map((r: any) => `[${r.status.toUpperCase()}] ${r.specFile}\n${r.output || r.error || ''}`)
          .join('\n\n') || 'Queue processed';
        setBuildOutput(output);
        await fetchSpecs();

        if (startData.completed > 0) {
          await fetchReports();
          toast.success('Feature build completed');
        } else if (startData.failed > 0) {
          toast.error('Feature build failed');
        }
      } else {
        // Validation stays direct (no queue needed)
        const res = await fetch('/api/feature-build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ specFile: file, action: 'validate' }),
        });
        const data = await res.json();
        setBuildOutput(data.output || data.error || 'Unknown result');

        if (data.success) {
          toast.success('Feature validation passed', { description: file });
        } else {
          toast.error('Feature validation failed', { description: file });
        }
      }
    } catch {
      setBuildOutput(`Feature ${action} request failed`);
      toast.error(`Feature ${action} failed`);
    } finally {
      setActiveAction(null);
    }
  };

  const handleEnqueue = async (specFile: string, kind: string, opts?: { phase?: number; dependsOn?: string[] }) => {
    try {
      const res = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specFile, kind, phase: opts?.phase, dependsOn: opts?.dependsOn, engine: buildEngine }),
      });
      const data = await res.json();
      if (res.ok) {
        setBuildOutput(`✓ Added "${specFile}" to build queue`);
        toast.success('Added to queue', { description: specFile });
        fetchQueueStatus();
        // Switch to queue tab
        setActiveTab('queue');
      } else {
        setBuildOutput(`✗ ${data.error}`);
        toast.error('Failed to enqueue', { description: data.error });
      }
    } catch {
      setBuildOutput('Failed to enqueue spec');
      toast.error('Failed to enqueue spec');
    }
  };

  const handleBuildAll = async () => {
    setIsBuildingAll(true);
    let enqueued = 0;
    let skipped = 0;
    let errors = 0;

    try {
      // 1. Validate & enqueue app specs first (phase 0)
      for (const spec of specs) {
        try {
          // Validate YAML first
          const valRes = await fetch('/api/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ specFile: spec.file, quick: true }),
          });
          const valData = await valRes.json();

          if (!valRes.ok || !valData.passed) {
            skipped++;
            toast.warning(`Skipped: ${spec.metadata?.name || spec.file}`, {
              description: `YAML issue: ${valData.errors?.[0] || valData.checks?.find((c: any) => !c.passed)?.message || 'Validation failed'} — will auto-fix during build`,
            });
            continue;
          }

          const res = await fetch('/api/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ specFile: spec.file, kind: 'AppSpec', phase: 0, dependsOn: [], buildAll: true, engine: buildEngine }),
          });
          if (res.ok) {
            enqueued++;
          } else {
            const data = await res.json();
            if (res.status !== 409) {
              errors++;
              toast.error(`Failed: ${spec.file}`, { description: data.error });
            }
          }
        } catch {
          errors++;
        }
      }

      // 2. Validate & enqueue feature specs sorted by phase
      const sortedFeatures = [...featureSpecs].sort((a, b) => (a.phase ?? 0) - (b.phase ?? 0));
      for (const fs of sortedFeatures) {
        try {
          // Validate YAML first
          const valRes = await fetch('/api/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ specFile: fs.file, quick: true }),
          });
          const valData = await valRes.json();

          if (!valRes.ok || !valData.passed) {
            skipped++;
            toast.warning(`Skipped: ${String(fs.feature?.name || fs.file)}`, {
              description: `YAML issue: ${valData.errors?.[0] || valData.checks?.find((c: any) => !c.passed)?.message || 'Validation failed'} — will auto-fix during build`,
            });
            continue;
          }

          const res = await fetch('/api/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              specFile: fs.file,
              kind: 'FeatureSpec',
              phase: fs.phase ?? 0,
              dependsOn: fs.dependsOn ?? [],
              buildAll: true,
              engine: buildEngine,
            }),
          });
          if (res.ok) {
            enqueued++;
          } else {
            const data = await res.json();
            if (res.status !== 409) {
              errors++;
              toast.error(`Failed: ${String(fs.feature?.name || fs.file)}`, { description: data.error });
            }
          }
        } catch {
          errors++;
        }
      }

      const parts: string[] = [];
      if (errors > 0) parts.push(`${errors} errors`);
      if (skipped > 0) parts.push(`${skipped} skipped (invalid YAML)`);

      if (enqueued > 0) {
        toast.success(`Queued ${enqueued} spec${enqueued !== 1 ? 's' : ''}`, {
          description: parts.length > 0 ? parts.join(', ') : 'Switch to Queue tab to start processing',
        });
        setActiveTab('queue');
        fetchQueueStatus();
      } else if (errors > 0 || skipped > 0) {
        toast.error(`No specs queued`, { description: parts.join(', ') });
      } else {
        toast.info('All specs are already in the queue');
        setActiveTab('queue');
      }
    } catch {
      toast.error('Build All failed');
    } finally {
      setIsBuildingAll(false);
    }
  };

  const renderDashboard = () => (
    <div className="space-y-6">
      {/* Active project banner */}
      {activeProject && (
        <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-transparent">
          <CardContent className="flex items-center gap-4 py-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <FolderOpen className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-semibold">{activeProject.name}</p>
              <p className="text-xs text-muted-foreground font-mono truncate">{activeProject.path}</p>
            </div>
            <Badge variant="outline" className="shrink-0 text-xs">
              Active Project
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{specs.length}</p>
                <p className="text-xs text-muted-foreground">App Specs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
                <Activity className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{featureSpecs.length}</p>
                <p className="text-xs text-muted-foreground">Features</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{specs.filter((s) => s.status === 'ready' || s.status === 'done').length}</p>
                <p className="text-xs text-muted-foreground">Ready</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                <Package className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{reportStats?.totalBuilds || 0}</p>
                <p className="text-xs text-muted-foreground">Builds</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent specs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Spec Queue</CardTitle>
        </CardHeader>
        <CardContent>
          {specs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No specs found. Add YAML files to the specs/ directory.
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {specs.map((spec) => (
                <SpecCard
                  key={spec.file}
                  spec={spec}
                  onValidate={handleValidate}
                  onBuild={handleBuild}
                  onEnqueue={handleEnqueue}
                  isValidating={activeAction?.type === 'validate' && activeAction?.file === spec.file}
                  isBuilding={activeAction?.type === 'build' && activeAction?.file === spec.file}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Validation result & Build output side-by-side */}
      {(validationResult || buildOutput) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {validationResult && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  {validationResult.passed ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  )}
                  <CardTitle className="text-sm">
                    Validation {validationResult.passed ? 'Passed' : 'Failed'}
                  </CardTitle>
                  <Badge variant={validationResult.passed ? 'default' : 'destructive'} className="ml-auto text-[10px]">
                    {validationResult.checks.filter((c) => c.passed).length}/{validationResult.checks.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead className="text-xs">Check</TableHead>
                      <TableHead className="text-xs">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validationResult.checks.map((check, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          {check.passed ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-medium">{check.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{check.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          {buildOutput && (
            <BuildLog
              output={buildOutput}
              isRunning={activeAction?.type === 'build'}
            />
          )}
        </div>
      )}
    </div>
  );

  const renderSpecs = () => {
    if (editingSpec) {
      return (
        <SpecEditor
          specFile={editingSpec.file}
          specName={editingSpec.name}
          onClose={() => setEditingSpec(null)}
          onSaved={() => fetchSpecs()}
        />
      );
    }

    return (
    <div className="flex gap-6">
      {/* Left: Specs list */}
      <div className={`space-y-4 ${validationResult || buildOutput ? 'flex-1 min-w-0' : 'w-full'}`}>
        {/* Stats bar + New Spec button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
              <span className="font-medium text-foreground">{specs.length}</span> App Specs
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-purple-500" />
              <span className="font-medium text-foreground">{featureSpecs.length}</span> Feature Specs
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Engine selector */}
            {geminiCliAvailable && (
              <div className="flex items-center border rounded-md h-8 overflow-hidden text-xs">
                <button
                  className={`px-2.5 h-full transition-colors ${buildEngine === 'factory' ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:bg-muted'}`}
                  onClick={() => setBuildEngine('factory')}
                >
                  Factory
                </button>
                <button
                  className={`px-2.5 h-full flex items-center gap-1 transition-colors ${buildEngine === 'gemini-cli' ? 'bg-blue-600 text-white font-medium' : 'text-muted-foreground hover:bg-muted'}`}
                  onClick={() => setBuildEngine('gemini-cli')}
                >
                  <Terminal className="h-3 w-3" />
                  Gemini CLI
                </button>
              </div>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleBuildAll}
              disabled={isBuildingAll || (specs.length === 0 && featureSpecs.length === 0)}
              className="h-8 text-xs gap-1.5"
            >
              {isBuildingAll ? <Spinner className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
              {isBuildingAll ? 'Queueing...' : 'Build All'}
            </Button>
            <Button
              size="sm"
              onClick={() => setShowSpecChat(true)}
              className="h-8 text-xs gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              New Spec
            </Button>
          </div>
        </div>

        {/* Spec Chat Dialog */}
        <SpecChat
          open={showSpecChat}
          onOpenChange={setShowSpecChat}
          onSpecSaved={() => fetchSpecs()}
        />

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : specs.length === 0 && featureSpecs.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">No specs found</p>
              <p className="text-xs text-muted-foreground mt-1">
                Add YAML files to specs/apps/ or specs/features/ to get started
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {/* App Specs */}
              {specs.map((spec) => (
                <div
                  key={spec.file}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-muted/40 transition-colors border-l-[3px] border-l-blue-500"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-blue-400 shrink-0" />
                      <span className="font-medium text-sm truncate">{spec.metadata?.name || spec.file}</span>
                      <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400 shrink-0">App</Badge>
                      {spec.status && spec.status !== 'unknown' && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">{spec.status}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      {spec.metadata?.package && <span className="truncate">{String(spec.metadata.package)}</span>}
                      {spec.deployment?.port && (
                        <span className="flex items-center gap-1"><Server className="h-3 w-3" /> :{String(spec.deployment.port)}</span>
                      )}
                      {spec.deployment?.region && (
                        <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> {String(spec.deployment.region)}</span>
                      )}
                      {spec.database?.collections && (
                        <span className="flex items-center gap-1"><Database className="h-3 w-3" /> {(spec.database.collections as unknown[]).length} collections</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {queueStatusMap[spec.file] && (
                      <Badge variant="outline" className={`text-[10px] shrink-0 gap-1 ${
                        queueStatusMap[spec.file].status === 'completed' ? 'text-green-400 border-green-500/30' :
                        queueStatusMap[spec.file].status === 'running' ? 'text-blue-400 border-blue-500/30' :
                        queueStatusMap[spec.file].status === 'failed' ? 'text-red-400 border-red-500/30' :
                        queueStatusMap[spec.file].status === 'needs-attention' ? 'text-amber-400 border-amber-500/30' :
                        'text-muted-foreground border-muted'
                      }`}>
                        {queueStatusMap[spec.file].status === 'completed' && <CircleCheck className="h-2.5 w-2.5" />}
                        {queueStatusMap[spec.file].status === 'running' && <Spinner className="h-2.5 w-2.5 animate-spin" />}
                        {queueStatusMap[spec.file].status === 'pending' && <Clock className="h-2.5 w-2.5" />}
                        {queueStatusMap[spec.file].status === 'failed' && <CircleX className="h-2.5 w-2.5" />}
                        {queueStatusMap[spec.file].status === 'needs-attention' && <AlertTriangle className="h-2.5 w-2.5" />}
                        {queueStatusMap[spec.file].status}
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setEditingSpec({ file: spec.file, name: spec.metadata?.name || spec.file })}
                      title="View / Edit"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => handleValidate(spec.file)}
                      disabled={!!activeAction}
                    >
                      {activeAction?.type === 'validate' && activeAction?.file === spec.file ? 'Validating...' : 'Validate'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => handleBuild(spec.file)}
                      disabled={!!activeAction}
                    >
                      {activeAction?.type === 'build' && activeAction?.file === spec.file ? 'Building...' : 'Build'}
                    </Button>
                    {!queueStatusMap[spec.file] && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleEnqueue(spec.file, 'AppSpec')}
                        title="Add to queue"
                      >
                        <ListPlus className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {/* Feature Specs */}
              <TooltipProvider>
              {featureSpecs.map((fs) => {
                const phaseLabel = fs.phase ? `P${fs.phase}` : 'P0';
                const phaseColor = fs.phase === 1 ? 'text-blue-400 border-blue-500/30' : fs.phase === 2 ? 'text-amber-400 border-amber-500/30' : fs.phase === 3 ? 'text-rose-400 border-rose-500/30' : 'text-muted-foreground border-muted';
                const deps = fs.dependsOn ?? [];
                const isSequenced = !!(fs.phase || deps.length > 0);
                return (
                <div
                  key={fs.file}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-muted/40 transition-colors border-l-[3px] border-l-purple-500"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Puzzle className="h-4 w-4 text-purple-400 shrink-0" />
                      <span className="font-medium text-sm truncate">{String(fs.feature?.name || fs.file)}</span>
                      <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-400 shrink-0">Feature</Badge>
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${phaseColor}`}>{phaseLabel}</Badge>
                      {deps.length > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="text-[10px] shrink-0 gap-1 cursor-help border-muted-foreground/30">
                              <GitBranch className="h-2.5 w-2.5" />
                              {deps.length}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="text-xs font-medium mb-1">Depends on:</p>
                            {deps.map((d) => <p key={d} className="text-xs text-muted-foreground">• {d}</p>)}
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {fs.target?.app && (
                        <span className="text-xs text-muted-foreground">→ {String(fs.target.app)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      {fs.feature?.description && <span className="truncate">{String(fs.feature.description)}</span>}
                      <span className="flex items-center gap-1 shrink-0"><Layers className="h-3 w-3" /> {fs.pages?.length || 0} pages</span>
                      <span className="flex items-center gap-1 shrink-0"><Database className="h-3 w-3" /> {String((fs.model as any)?.collection || 'unknown')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {queueStatusMap[fs.file] && (
                      <Badge variant="outline" className={`text-[10px] shrink-0 gap-1 ${
                        queueStatusMap[fs.file].status === 'completed' ? 'text-green-400 border-green-500/30' :
                        queueStatusMap[fs.file].status === 'running' ? 'text-blue-400 border-blue-500/30' :
                        queueStatusMap[fs.file].status === 'failed' ? 'text-red-400 border-red-500/30' :
                        queueStatusMap[fs.file].status === 'needs-attention' ? 'text-amber-400 border-amber-500/30' :
                        'text-muted-foreground border-muted'
                      }`}>
                        {queueStatusMap[fs.file].status === 'completed' && <CircleCheck className="h-2.5 w-2.5" />}
                        {queueStatusMap[fs.file].status === 'running' && <Spinner className="h-2.5 w-2.5 animate-spin" />}
                        {queueStatusMap[fs.file].status === 'pending' && <Clock className="h-2.5 w-2.5" />}
                        {queueStatusMap[fs.file].status === 'failed' && <CircleX className="h-2.5 w-2.5" />}
                        {queueStatusMap[fs.file].status === 'needs-attention' && <AlertTriangle className="h-2.5 w-2.5" />}
                        {queueStatusMap[fs.file].status}
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setEditingSpec({ file: fs.file, name: String(fs.feature?.name || fs.file) })}
                      title="View / Edit"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => handleFeatureAction(fs.file, 'validate')}
                      disabled={!!activeAction}
                    >
                      {activeAction?.type === 'feature-validate' && activeAction?.file === fs.file ? 'Validating...' : 'Validate'}
                    </Button>
                    {!isSequenced && !queueStatusMap[fs.file] && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2.5 text-xs"
                          onClick={() => handleFeatureAction(fs.file, 'build')}
                          disabled={!!activeAction}
                        >
                          {activeAction?.type === 'feature-build' && activeAction?.file === fs.file ? 'Building...' : 'Build'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleEnqueue(fs.file, 'FeatureSpec', { phase: fs.phase, dependsOn: fs.dependsOn })}
                          title="Add to queue"
                        >
                          <ListPlus className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    {isSequenced && !queueStatusMap[fs.file] && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="text-[10px] text-muted-foreground border-muted cursor-help">
                            Use Build All
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p className="text-xs">This spec is sequenced — use Build All to queue in dependency order</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
                );
              })}
              </TooltipProvider>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
    );
  };

  const renderReports = () => (
    <div className="space-y-6">

      {loading ? (
        <Skeleton className="h-[600px] rounded-lg" />
      ) : (
        <ReportViewer
          entries={reportEntries}
          stats={reportStats || { totalBuilds: 0, successfulBuilds: 0, failedBuilds: 0, uniqueSpecs: 0, totalTokensIn: 0, totalTokensOut: 0, avgDurationMs: 0, modelUsage: [], errorBreakdown: [] }}
        />
      )}
    </div>
  );

  const hasOutput = !!(validationResult || buildOutput || queueRunning);
  const showOutputButton = ((activeTab === 'specs' || activeTab === 'queue') && hasOutput && !outputPanelOpen);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        activeTab={showAddProject ? 'projects' : activeTab}
        onTabChange={(tab) => {
          if (tab === 'projects') {
            setShowAddProject(true);
          } else {
            setShowAddProject(false);
            setActiveTab(tab);
          }
        }}
        onAddProject={() => setShowAddProject(true)}
        projectRefreshKey={projectRefreshKey}
      />
      <main className="flex-1 overflow-auto">
        {showAddProject ? (
          <div className="p-8 h-full">
            <AddProject onProjectAdded={() => {
              setShowAddProject(false);
              setHasProjects(true);
              setProjectRefreshKey((k) => k + 1);
              fetchProjects();
              fetchSpecs();
              fetchReports();
            }} />
          </div>
        ) : (
        <div className="p-8">
          {/* Page header */}
          {['dashboard', 'specs', 'skills', 'reports', 'integrations', 'settings'].includes(activeTab) && (
            <div className="mb-8 flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  {activeTab === 'dashboard' && 'Dashboard'}
                  {activeTab === 'specs' && 'Specs'}
                  {activeTab === 'skills' && 'Skills'}
                  {activeTab === 'reports' && 'Reports'}
                  {activeTab === 'integrations' && 'Integrations'}
                  {activeTab === 'settings' && 'Settings'}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {activeTab === 'dashboard' && 'Overview for the active project'}
                  {activeTab === 'specs' && 'Manage your app specifications'}
                  {activeTab === 'skills' && 'Reusable recipes the engine auto-matches to builds'}
                  {activeTab === 'reports' && 'View generated build reports'}
                  {activeTab === 'integrations' && 'Connect external services and tools'}
                  {activeTab === 'settings' && 'Configure factory preferences'}
                </p>
              </div>
              {showOutputButton && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setOutputPanelOpen(true)}
                >
                  <Terminal className="h-4 w-4" />
                  Output
                  {queueRunning && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                    </span>
                  )}
                </Button>
              )}
            </div>
          )}

          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'queue' && (
            <QueueView
              onToggleOutput={() => setOutputPanelOpen(!outputPanelOpen)}
              outputPanelOpen={outputPanelOpen}
              queueRunning={queueRunning}
            />
          )}
          {activeTab === 'specs' && renderSpecs()}
          {activeTab === 'skills' && <SkillsView />}
          {activeTab === 'reports' && renderReports()}
          {activeTab === 'knowledge' && <KnowledgeView />}
          {activeTab === 'integrations' && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Plug className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <h2 className="text-lg font-semibold">Integrations</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Connect external services like GitHub, CI/CD pipelines, and notification channels. Coming soon.
              </p>
            </div>
          )}
          {activeTab === 'settings' && (
            <SettingsView />
          )}
        </div>
        )}
      </main>

      {/* Collapsible right output panel */}
      <aside
        className={`border-l border-border bg-background/95 backdrop-blur-sm transition-all duration-300 ease-in-out overflow-hidden ${
          outputPanelOpen && hasOutput ? 'w-[420px]' : 'w-0'
        }`}
      >
        <div className="w-[420px] h-screen flex flex-col">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Output</span>
              {(activeAction || queueRunning) && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setOutputPanelOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {validationResult && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    {validationResult.passed ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    )}
                    <CardTitle className="text-sm">
                      Validation {validationResult.passed ? 'Passed' : 'Failed'}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8"></TableHead>
                        <TableHead className="text-xs">Check</TableHead>
                        <TableHead className="text-xs">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validationResult.checks.map((check, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            {check.passed ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                            ) : (
                              <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                            )}
                          </TableCell>
                          <TableCell className="text-xs font-medium">{check.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{check.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
            {buildOutput && (
              <BuildLog
                output={buildOutput}
                isRunning={!!activeAction || queueRunning}
              />
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
