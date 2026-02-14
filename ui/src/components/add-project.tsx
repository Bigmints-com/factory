'use client';

import { useState, useEffect } from 'react';
import { 
  IconFolder, 
  IconSettings, 
  IconRocket, 
  IconCircleCheckFilled, 
  IconCircleDashed,
  IconChevronRight,
  IconLoader2,
  IconDots,
  IconArchive,
  IconMail,
  IconFolderPlus,
  IconFolderOpen,
  IconTrash,
  IconRadio,
  IconCheck,
  IconPlus
} from "@tabler/icons-react";
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { FolderBrowser } from '@/components/folder-browser';
import { toast } from 'sonner';
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface BridgeSummary {
  name: string | null;
  description: string | null;
  stack: {
    framework: string;
    packageManager: string;
    linter?: string;
    testing?: string;
    database?: string;
    cloud?: string;
  } | null;
  stats: {
    apps: number;
    packages: number;
    conventions: number;
    scripts: number;
  };
  hasSkills: boolean;
}

interface Project {
  id: string;
  name: string;
  path: string;
  addedAt: string;
  bridge?: BridgeSummary | null;
}

interface AddProjectProps {
  onProjectAdded: () => void;
}

function CircularProgress({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const progress = total > 0 ? ((completed) / total) * 100 : 0;
  const strokeDashoffset = 100 - progress;

  return (
    <svg
      className="-rotate-90 scale-y-[-1]"
      height="14"
      width="14"
      viewBox="0 0 14 14"
    >
      <circle
        className="stroke-muted"
        cx="7"
        cy="7"
        fill="none"
        r="6"
        strokeWidth="2"
        pathLength="100"
      />
      <circle
        className="stroke-primary"
        cx="7"
        cy="7"
        fill="none"
        r="6"
        strokeWidth="2"
        pathLength="100"
        strokeDasharray="100"
        strokeLinecap="round"
        style={{ strokeDashoffset }}
      />
    </svg>
  );
}

function StepIndicator({ completed }: { completed: boolean }) {
  if (completed) {
    return (
      <IconCircleCheckFilled
        className="mt-1 size-4.5 shrink-0 text-primary"
        aria-hidden="true"
      />
    );
  }
  return (
    <IconCircleDashed
      className="mt-1 size-5 shrink-0 stroke-muted-foreground/40"
      strokeWidth={2}
      aria-hidden="true"
    />
  );
}

export function AddProject({ onProjectAdded }: AddProjectProps) {
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Existing projects
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Onboarding logic state
  const [openStepId, setOpenStepId] = useState<string | null>("location");
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({
    location: false,
    config: false,
    build: false
  });

  // Folder browser state
  const [browseMode, setBrowseMode] = useState<'new' | 'existing' | null>(null);

  // Configuration state
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [config, setConfig] = useState({
    framework: 'next.js',
    packageManager: 'npm',
    linter: 'EsLint + Prettier',
    testing: 'jest',
  });

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      setProjects(data.projects || []);
      setActiveId(data.activeId || null);
    } catch {
      // silently fail
    } finally {
      setLoadingProjects(false);
    }
  };

  const resetOnboarding = () => {
    setOpenStepId("location");
    setCompletedSteps({ location: false, config: false, build: false });
    setPendingPath(null);
    setShowModal(false);
  };

  const handleConnect = async () => {
    if (!pendingPath) return;
    setLoading(true);

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          path: pendingPath,
          stack: config
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error('Failed to connect project', { description: data.error });
        return;
      }

      setCompletedSteps(prev => ({ ...prev, build: true }));
      toast.success(`${data.project?.name || 'Project'} connected!`, {
        description: data.project?.path,
      });
      // Refresh list
      await loadProjects();
      onProjectAdded();
      
      // Delay closing modal slightly for success feel
      setTimeout(() => {
        resetOnboarding();
      }, 1000);
    } catch (err: any) {
      toast.error('Connection failed', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSwitch = async (id: string) => {
    setSwitching(id);
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'PATCH' });
      if (res.ok) {
        setActiveId(id);
        onProjectAdded();
        toast.success('Project activated');
      }
    } catch {
      toast.error('Failed to switch project');
    } finally {
      setSwitching(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Project removed');
        await loadProjects();
      }
    } catch {
      toast.error('Failed to remove project');
    } finally {
      setDeleting(null);
    }
  };

  const handleFolderSelected = (path: string) => {
    setPendingPath(path);
    setBrowseMode(null);
    setCompletedSteps(prev => ({ ...prev, location: true }));
    setOpenStepId("config");
  };

  const completedCount = Object.values(completedSteps).filter(Boolean).length;
  const totalSteps = 3;

  const steps = [
    {
      id: "location",
      title: "Project Location",
      description: "Select an existing project folder or create a new one to initialize the factory bridge.",
      icon: <IconFolder className="size-4" />,
      content: (
        <div className="grid grid-cols-2 gap-3 mt-4">
           <Card
              className="cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all group"
              onClick={() => setBrowseMode('new')}
            >
              <CardContent className="py-6 flex flex-col items-center gap-2 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                  <IconFolderPlus className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold">New Project</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Create & initialize
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all group"
              onClick={() => setBrowseMode('existing')}
            >
              <CardContent className="py-6 flex flex-col items-center gap-2 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 group-hover:bg-orange-500/20 transition-colors">
                  <IconFolderOpen className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-xs font-semibold">Existing Project</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Connect local path
                  </p>
                </div>
              </CardContent>
            </Card>
        </div>
      ),
      summary: pendingPath ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground font-mono bg-muted/50 p-2 rounded">
          <IconFolder className="size-3" /> {pendingPath}
        </div>
      ) : null
    },
    {
      id: "config",
      title: "Technical Stack",
      description: "Configure the project framework, package manager, and tools. We'll attempt to auto-discover these if they exist.",
      icon: <IconSettings className="size-4" />,
      content: (
        <div className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Framework</label>
              <select 
                className="w-full bg-background border rounded-md px-2 py-1.5 text-xs"
                value={config.framework}
                onChange={(e) => setConfig({ ...config, framework: e.target.value })}
              >
                <option value="next.js">Next.js</option>
                <option value="react">React (Vite)</option>
                <option value="remix">Remix</option>
                <option value="node">Node.js</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Package Manager</label>
              <select 
                className="w-full bg-background border rounded-md px-2 py-1.5 text-xs"
                value={config.packageManager}
                onChange={(e) => setConfig({ ...config, packageManager: e.target.value })}
              >
                <option value="npm">npm</option>
                <option value="yarn">yarn</option>
                <option value="pnpm">pnpm</option>
                <option value="bun">bun</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Linter / Formatter</label>
              <select 
                className="w-full bg-background border rounded-md px-2 py-1.5 text-xs"
                value={config.linter}
                onChange={(e) => setConfig({ ...config, linter: e.target.value })}
              >
                <option value="EsLint + Prettier">EsLint + Prettier</option>
                <option value="Biome">Biome</option>
                <option value="None">None</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Testing Tool</label>
              <select 
                className="w-full bg-background border rounded-md px-2 py-1.5 text-xs"
                value={config.testing}
                onChange={(e) => setConfig({ ...config, testing: e.target.value })}
              >
                <option value="jest">Jest</option>
                <option value="vitest">Vitest</option>
                <option value="playwright">Playwright</option>
                <option value="None">None</option>
              </select>
            </div>
          </div>
          <Button 
            size="sm" 
            className="w-full h-8 text-xs" 
            onClick={() => {
              setCompletedSteps(prev => ({ ...prev, config: true }));
              setOpenStepId("build");
            }}
          >
            Confirm Configuration
          </Button>
        </div>
      ),
      summary: completedSteps.config ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(config).map(([key, val]) => (
            <span key={key} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {val}
            </span>
          ))}
        </div>
      ) : null
    },
    {
      id: "build",
      title: "Initialize & Connect",
      description: "Initialize the .factory bridge and perform initial sync. This will connect the project to the factory.",
      icon: <IconRocket className="size-4" />,
      content: (
        <div className="mt-4">
          <Button 
            className="w-full" 
            disabled={loading || !completedSteps.config}
            onClick={handleConnect}
          >
            {loading ? (
              <>
                <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
                Initializing bridge...
              </>
            ) : completedSteps.build ? (
                <>
                    <IconCircleCheckFilled className="mr-2 h-4 w-4" />
                    Success!
                </>
            ) : (
              <>
                <IconRocket className="mr-2 h-4 w-4" />
                Connect Project
              </>
            )}
          </Button>
          <p className="text-[10px] text-center text-muted-foreground mt-3 italic">
            A .factory folder will be created in the target repository.
          </p>
        </div>
      )
    }
  ];

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
            <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
            <p className="text-sm text-muted-foreground mt-1">
                Manage your connected repositories
            </p>
        </div>
        <Button size="sm" onClick={() => setShowModal(true)}>
            <IconPlus className="h-4 w-4 mr-2" />
            Add Project
        </Button>
      </div>

      <div className="space-y-3">
          <h2 className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest pl-1">
            Connected Repositories
          </h2>
          
          {loadingProjects ? (
              <div className="space-y-2">
                  {[1, 2].map(i => (
                      <div key={i} className="h-16 rounded-xl bg-muted/40 animate-pulse" />
                  ))}
              </div>
          ) : projects.length === 0 ? (
              <Card className="border-dashed bg-muted/20">
                  <CardContent className="py-12 flex flex-col items-center text-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                        <IconFolder className="h-6 w-6 text-muted-foreground/50" />
                      </div>
                      <div className="space-y-1">
                          <p className="text-sm font-semibold">No projects connected</p>
                          <p className="text-xs text-muted-foreground max-w-[240px]">
                              Connect your first repository to start using SaveADay Factory.
                          </p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setShowModal(true)}>
                          <IconPlus className="h-4 w-4 mr-2" />
                          Connect First Project
                      </Button>
                  </CardContent>
              </Card>
          ) : (
              <div className="grid grid-cols-1 gap-2">
                {projects.map((project) => (
                  <Card
                    key={project.id}
                    className={cn(
                      'transition-all duration-200 border-none bg-muted/40 hover:bg-muted/60',
                      project.id === activeId && 'ring-1 ring-primary/30 bg-primary/5'
                    )}
                  >
                    <CardContent className="py-3 px-4 space-y-2.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background border">
                          <IconFolder className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold truncate">{project.name}</p>
                            {project.id === activeId && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-medium text-primary">
                                <IconRadio className="h-2 w-2" />
                                Active
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate font-mono mt-0.5">
                            {project.path}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {project.id !== activeId && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[10px] px-2"
                              onClick={() => handleSwitch(project.id)}
                              disabled={!!switching}
                            >
                              {switching === project.id ? (
                                <IconLoader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                'Activate'
                              )}
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <IconDots className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                               <DropdownMenuItem 
                                className="text-destructive focus:text-destructive"
                                onClick={() => handleDelete(project.id)}
                                disabled={!!deleting}
                              >
                                <IconTrash className="mr-2 h-4 w-4" />
                                Remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      {/* Bridge Summary */}
                      {project.bridge && (
                        <div className="pl-11 space-y-2">
                          {/* Stack Badges */}
                          {project.bridge.stack && (
                            <div className="flex flex-wrap gap-1.5">
                              {project.bridge.stack.framework && (
                                <span className="inline-flex items-center rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400 ring-1 ring-inset ring-blue-500/20">
                                  {project.bridge.stack.framework}
                                </span>
                              )}
                              {project.bridge.stack.packageManager && (
                                <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
                                  {project.bridge.stack.packageManager}
                                </span>
                              )}
                              {project.bridge.stack.database && (
                                <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400 ring-1 ring-inset ring-amber-500/20">
                                  {project.bridge.stack.database}
                                </span>
                              )}
                              {project.bridge.stack.cloud && (
                                <span className="inline-flex items-center rounded-md bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-400 ring-1 ring-inset ring-purple-500/20">
                                  {project.bridge.stack.cloud}
                                </span>
                              )}
                              {project.bridge.stack.testing && (
                                <span className="inline-flex items-center rounded-md bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-400 ring-1 ring-inset ring-rose-500/20">
                                  {project.bridge.stack.testing}
                                </span>
                              )}
                              {project.bridge.stack.linter && (
                                <span className="inline-flex items-center rounded-md bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-400 ring-1 ring-inset ring-cyan-500/20">
                                  {project.bridge.stack.linter}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Stats Row */}
                          <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                            {project.bridge.stats.apps > 0 && (
                              <span className="flex items-center gap-1">
                                <IconRocket className="h-3 w-3" />
                                <span className="font-medium text-foreground">{project.bridge.stats.apps}</span> apps
                              </span>
                            )}
                            {project.bridge.stats.packages > 0 && (
                              <span className="flex items-center gap-1">
                                <IconArchive className="h-3 w-3" />
                                <span className="font-medium text-foreground">{project.bridge.stats.packages}</span> packages
                              </span>
                            )}
                            {project.bridge.stats.scripts > 0 && (
                              <span className="flex items-center gap-1">
                                <IconSettings className="h-3 w-3" />
                                <span className="font-medium text-foreground">{project.bridge.stats.scripts}</span> scripts
                              </span>
                            )}
                            {project.bridge.hasSkills && (
                              <span className="flex items-center gap-1">
                                <IconCheck className="h-3 w-3 text-emerald-400" />
                                skills
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
          )}
      </div>

      {/* Onboarding Modal */}
      <Dialog open={showModal} onOpenChange={(v) => !v && resetOnboarding()}>
        <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden gap-0">
          <DialogHeader className="px-6 py-4 border-b flex flex-row items-center justify-between bg-muted/30">
            <DialogTitle className="text-sm font-semibold">Connect New Project</DialogTitle>
            <div className="flex items-center gap-3">
              <CircularProgress completed={completedCount} total={totalSteps} />
              <div className="text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground">{totalSteps - completedCount}</span> steps left
              </div>
            </div>
          </DialogHeader>

          <div className="p-0 max-h-[80vh] overflow-y-auto">
            {steps.map((step, index) => {
              const isOpen = openStepId === step.id;
              const isCompleted = completedSteps[step.id];
              const isFirst = index === 0;
              const prevStep = steps[index - 1];
              const isPrevOpen = prevStep && openStepId === prevStep.id;
              const showBorderTop = !isFirst && !isOpen && !isPrevOpen;

              return (
                <div
                  key={step.id}
                  className={cn(
                    "group transition-all duration-300",
                    isOpen && "bg-muted/10",
                    showBorderTop && "border-t"
                  )}
                >
                  <div className="px-6 py-4">
                    <div className="flex gap-4">
                      <div className="shrink-0 mt-1">
                        <StepIndicator completed={isCompleted} />
                      </div>
                      <div className="grow min-w-0">
                        <div 
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                              const canOpen = index === 0 || completedSteps[steps[index-1].id];
                              if (canOpen) setOpenStepId(isOpen ? null : step.id);
                          }}
                          className="flex items-center justify-between cursor-pointer focus-visible:outline-none"
                        >
                          <h4 className={cn(
                            "text-xs font-semibold transition-colors uppercase tracking-wider",
                            isCompleted ? "text-primary" : "text-foreground"
                          )}>
                            {step.title}
                          </h4>
                          <div className="flex items-center gap-2">
                            {!isOpen && !isCompleted && (
                              <IconChevronRight className="h-3 w-3 text-muted-foreground/30" />
                            )}
                            {isCompleted && !isOpen && (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-5 text-[9px] px-1.5 text-muted-foreground hover:text-foreground"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenStepId(step.id);
                                }}
                              >
                                Edit
                              </Button>
                            )}
                          </div>
                        </div>
                        
                        <div className="mt-1">
                          {!isOpen && step.summary && step.summary}
                        </div>

                        <Collapsible open={isOpen}>
                          <CollapsibleContent className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:fade-in duration-300">
                            <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                              {step.description}
                            </p>
                            {step.content}
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Folder browser dialog */}
      <FolderBrowser
        open={browseMode !== null}
        onClose={() => setBrowseMode(null)}
        onSelect={handleFolderSelected}
        mode={browseMode || 'existing'}
        title={browseMode === 'new'
          ? 'Create Project'
          : 'Select Folder'
        }
      />
    </div>
  );
}
