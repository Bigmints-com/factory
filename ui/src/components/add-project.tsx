'use client';

import { useState, useEffect } from 'react';
import { FolderOpen, Plus, Check, Loader2, Trash2, Radio, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Project {
  id: string;
  name: string;
  path: string;
  addedAt: string;
}

interface AddProjectProps {
  onProjectAdded: () => void;
}

export function AddProject({ onProjectAdded }: AddProjectProps) {
  const [path, setPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  // Existing projects
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

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

  const handleConnect = async () => {
    if (!path.trim()) return;

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: path.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to connect project');
        return;
      }

      setResult(data);
      setPath('');
      // Refresh list
      await loadProjects();
      onProjectAdded();
    } catch (err: any) {
      setError(err.message || 'Connection failed');
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
      }
    } catch {
      // silently fail
    } finally {
      setSwitching(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await loadProjects();
      }
    } catch {
      // silently fail
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage connected repositories
        </p>
      </div>

      {/* Connected projects list */}
      {!loadingProjects && projects.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Connected ({projects.length})
          </h2>
          {projects.map((project) => (
            <Card
              key={project.id}
              className={cn(
                'transition-colors',
                project.id === activeId && 'border-primary/50 bg-primary/5'
              )}
            >
              <CardContent className="flex items-center gap-4 py-4 px-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <FolderOpen className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">{project.name}</p>
                    {project.id === activeId && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        <Radio className="h-2.5 w-2.5" />
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate font-mono mt-0.5">
                    {project.path}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {project.id !== activeId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => handleSwitch(project.id)}
                      disabled={!!switching}
                    >
                      {switching === project.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        'Activate'
                      )}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(project.id)}
                    disabled={!!deleting}
                  >
                    {deleting === project.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add new project */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          {projects.length > 0 ? 'Add Another' : 'Connect a Project'}
        </h2>
        <Card>
          <CardContent className="py-5 px-5 space-y-4">
            {projects.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Paste the path to your project or application directory.
                The factory will create a <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">.factory</code> bridge folder.
              </p>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="/path/to/your-project"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                className="font-mono text-sm"
                disabled={loading}
              />
              <Button
                onClick={handleConnect}
                disabled={loading || !path.trim()}
                className="shrink-0"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-1 h-4 w-4" />
                )}
                Connect
              </Button>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Success */}
            {result && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                <Check className="h-4 w-4 shrink-0" />
                <span><strong>{result.project?.name}</strong> connected successfully</span>
              </div>
            )}
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          The factory scans for apps.json, .agent/rules/, skills.md, and templates to auto-configure the bridge.
        </p>
      </div>
    </div>
  );
}
