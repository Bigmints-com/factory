'use client';

import { ScrollArea } from '@/components/ui/scroll-area';

interface BuildLogProps {
  output: string;
  isRunning?: boolean;
}

export function BuildLog({ output, isRunning }: BuildLogProps) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className={`h-2 w-2 rounded-full ${isRunning ? 'bg-yellow-500 animate-pulse' : output ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
        <span className="text-xs font-medium text-muted-foreground">
          {isRunning ? 'Building...' : output ? 'Build Output' : 'No output'}
        </span>
      </div>
      <ScrollArea className="h-[400px]">
        <pre className="p-4 text-xs leading-relaxed font-mono text-foreground/80 whitespace-pre-wrap">
          {output || 'Run a build to see output here...'}
        </pre>
      </ScrollArea>
    </div>
  );
}
