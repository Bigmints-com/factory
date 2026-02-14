'use client';

import { cn } from '@/lib/utils';
import { Factory, FileText, BarChart3, FolderOpen, ListOrdered, BookOpen, Plug, Settings, Shield } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { ProjectSwitcher } from '@/components/project-switcher';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onAddProject: () => void;
  projectRefreshKey?: number;
}

const mainNav = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'queue', label: 'Queue', icon: ListOrdered },
  { id: 'specs', label: 'Specs', icon: FileText },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'knowledge', label: 'Knowledge', icon: BookOpen },
];

const manageNav = [
  { id: 'projects', label: 'Projects', icon: FolderOpen },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function NavButton({ id, label, icon: Icon, active, onClick }: {
  id: string; label: string; icon: any; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

export function Sidebar({ activeTab, onTabChange, onAddProject, projectRefreshKey }: SidebarProps) {
  return (
    <aside className="flex h-screen w-60 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Factory className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-tight">SaveADay</p>
          <p className="text-[11px] text-muted-foreground">Factory</p>
        </div>
      </div>

      <Separator />

      {/* Project Switcher */}
      <div className="px-3 py-2.5">
        <ProjectSwitcher onAddProject={onAddProject} refreshKey={projectRefreshKey} />
      </div>

      <Separator />

      {/* Main navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        <div className="space-y-0.5">
          {mainNav.map((item) => (
            <NavButton
              key={item.id}
              {...item}
              active={activeTab === item.id}
              onClick={() => onTabChange(item.id)}
            />
          ))}
        </div>

        <div className="space-y-1">
          <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Manage
          </p>
          <div className="space-y-0.5">
            {manageNav.map((item) => (
              <NavButton
                key={item.id}
                {...item}
                active={activeTab === item.id}
                onClick={() => onTabChange(item.id)}
              />
            ))}
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-5 py-3">
        <p className="text-[11px] text-muted-foreground">
          saveaday-factory v1.0.0
        </p>
      </div>
    </aside>
  );
}
