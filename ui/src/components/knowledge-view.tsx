'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  BookOpen,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  FileText,
  ChevronDown,
  ChevronRight,
  Layers,
} from 'lucide-react';

interface BuildEntry {
  id: string;
  spec_file: string;
  kind: string;
  timestamp: string;
  duration_ms: number | null;
  status: string;
  files_generated: string;
  filesGenerated: string[];
  output: string;
  notes: string;
}

interface KnowledgeStats {
  totalBuilds: number;
  successfulBuilds: number;
  failedBuilds: number;
  uniqueSpecs: number;
}

export function KnowledgeView() {
  const [entries, setEntries] = useState<BuildEntry[]>([]);
  const [stats, setStats] = useState<KnowledgeStats>({
    totalBuilds: 0, successfulBuilds: 0, failedBuilds: 0, uniqueSpecs: 0,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  const fetchKnowledge = useCallback(async (query?: string) => {
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      const res = await fetch(`/api/knowledge?${params}`);
      const data = await res.json();
      setEntries(data.entries || []);
      setStats(data.stats || { totalBuilds: 0, successfulBuilds: 0, failedBuilds: 0, uniqueSpecs: 0 });
    } catch {
      console.error('Failed to fetch knowledge');
    }
  }, []);

  useEffect(() => {
    fetchKnowledge();
  }, [fetchKnowledge]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchKnowledge(searchQuery);
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return `Today ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const specName = (path: string) => {
    return path.split('/').pop()?.replace('.yaml', '') || path;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Knowledge Base</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Build history and institutional knowledge for future reference
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-blue-400" />
              <span className="text-lg font-bold">{stats.totalBuilds}</span>
              <span className="text-xs text-muted-foreground">Total Builds</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-lg font-bold">{stats.successfulBuilds}</span>
              <span className="text-xs text-muted-foreground">Successful</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-400" />
              <span className="text-lg font-bold">{stats.failedBuilds}</span>
              <span className="text-xs text-muted-foreground">Failed</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-purple-400" />
              <span className="text-lg font-bold">{stats.uniqueSpecs}</span>
              <span className="text-xs text-muted-foreground">Unique Specs</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search builds, outputs, notes..."
          className="w-full h-10 pl-10 pr-4 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </form>

      <Separator />

      {/* Timeline */}
      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-sm text-muted-foreground">No build history yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Build history will appear here after queue execution
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const isExpanded = expandedEntry === entry.id;
            const filesGenerated = entry.filesGenerated || [];

            return (
              <Card key={entry.id} className="relative overflow-hidden">
                <div className={`absolute left-0 top-0 h-full w-1 ${
                  entry.status === 'completed' ? 'bg-emerald-500' : 'bg-red-500'
                }`} />
                <CardContent className="pt-4 pb-3 pl-5">
                  <button
                    className="flex items-center gap-3 text-left w-full"
                    onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    {entry.status === 'completed' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-400" />
                    )}
                    <span className="font-medium text-sm">{specName(entry.spec_file)}</span>
                    <Badge variant="outline" className={`text-[10px] ${
                      entry.kind === 'FeatureSpec' ? 'border-purple-500/30 text-purple-400' : 'border-emerald-500/30 text-emerald-400'
                    }`}>
                      {entry.kind === 'FeatureSpec' ? 'Feature' : 'App'}
                    </Badge>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {formatDate(entry.timestamp)}
                      {entry.duration_ms ? ` · ${formatDuration(entry.duration_ms)}` : ''}
                      {filesGenerated.length > 0 && ` · ${filesGenerated.length} files`}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="mt-3 ml-7 space-y-3">
                      {entry.notes && (
                        <p className="text-xs text-muted-foreground">{entry.notes}</p>
                      )}

                      {filesGenerated.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground font-medium mb-1">Generated Files</p>
                          <div className="flex flex-wrap gap-1">
                            {filesGenerated.map((f, i) => (
                              <Badge key={i} variant="outline" className="text-[10px] font-mono">
                                <FileText className="h-2.5 w-2.5 mr-1" />
                                {f}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {entry.output && (
                        <div className="rounded-md bg-card border p-3 max-h-48 overflow-y-auto">
                          <p className="text-xs text-muted-foreground font-medium mb-1">Build Output</p>
                          <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap">{entry.output}</pre>
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
