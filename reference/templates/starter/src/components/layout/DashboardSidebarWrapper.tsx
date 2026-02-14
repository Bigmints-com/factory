'use client';

import { AppSidebar2, SAVEDAY_APPS } from '@saveaday/shared-ui';

interface SidebarWrapperProps {
  user: {
    id: string;
    name?: string;
    email?: string;
    photoURL?: string;
  };
  variant?: 'sidebar' | 'floating' | 'inset';
  [key: string]: any;
}

export function DashboardSidebarWrapper({ user, ...props }: SidebarWrapperProps) {
  const sidebarApps = SAVEDAY_APPS.map(app => ({
    name: app.name,
    logo: app.logo,
    plan: "Platform",
    url: app.url,
    color: app.color,
    key: app.key
  }));

  return (
    <AppSidebar2
      currentAppName="Starter"
      teams={sidebarApps}
      user={{
        name: user.name || "User",
        email: user.email || "",
        avatar: user.photoURL || "",
      }}
      navMain={[
        { title: "Dashboard", url: "/dashboard", icon: "layout-dashboard" },
        { title: "Connections", url: "/connections", icon: "webhook" },
        { title: "Settings", url: "/settings", icon: "settings" },
        { title: "Design System", url: "/design-system", icon: "palette" },
      ]}
      {...props}
    />
  );
}
