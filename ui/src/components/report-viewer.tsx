'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { FileText, Clock } from 'lucide-react';

interface Report {
  file: string;
  slug: string;
  timestamp: string;
  content: string;
  size: number;
}

interface ReportViewerProps {
  reports: Report[];
  selectedReport: Report | null;
  onSelectReport: (report: Report) => void;
}

export function ReportViewer({ reports, selectedReport, onSelectReport }: ReportViewerProps) {
  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <FileText className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-sm font-medium">No build reports yet</p>
        <p className="text-xs mt-1">Build a spec to generate your first report</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[280px_1fr] gap-4 h-[600px]">
      {/* Report list */}
      <ScrollArea className="h-full rounded-lg border border-border">
        <div className="space-y-1 p-2">
          {reports.map((report) => (
            <button
              key={report.file}
              onClick={() => onSelectReport(report)}
              className={`w-full rounded-lg px-3 py-3 text-left transition-all duration-150 ${
                selectedReport?.file === report.file
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/50 text-muted-foreground'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="text-sm font-medium truncate">{report.slug}</span>
              </div>
              <div className="flex items-center gap-1.5 pl-5.5">
                <Clock className="h-3 w-3" />
                <span className="text-[10px]">
                  {new Date(report.timestamp).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>

      {/* Report content */}
      <Card className="h-full overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {selectedReport ? `Report: ${selectedReport.slug}` : 'Select a report'}
            </h3>
            {selectedReport && (
              <Badge variant="outline" className="text-[10px]">
                {(selectedReport.size / 1024).toFixed(1)} KB
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[520px]">
            {selectedReport ? (
              <pre className="px-6 pb-6 text-xs leading-relaxed font-mono text-foreground/80 whitespace-pre-wrap">
                {selectedReport.content}
              </pre>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Select a report from the sidebar
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
