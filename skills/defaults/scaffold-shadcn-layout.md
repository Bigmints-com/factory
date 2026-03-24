---
name: Scaffold shadcn Layout
description: Generate a responsive app shell using shadcn/ui components with sidebar navigation, top bar, and content area.
category: layout
tags:
  - shadcn
  - layout
  - sidebar
  - scaffold
  - navigation
  - shell
trigger: shadcn|layout|sidebar|shell
enabled: true
---

## Instructions

When scaffolding a layout with shadcn/ui:

1. Use the `SidebarProvider`, `Sidebar`, `SidebarContent`, `SidebarHeader`, `SidebarFooter` components for navigation
2. Implement a responsive layout with `SidebarTrigger` for mobile collapse
3. Use `Separator` between navigation groups
4. Apply the `cn()` utility for conditional classes
5. Use `lucide-react` icons consistently
6. Structure: `<SidebarProvider> → <Sidebar> + <main>`
7. Always include keyboard navigation support

## Template

```tsx
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
} from "@/components/ui/sidebar";

export default function Layout({ children }) {
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarContent>{/* Navigation items */}</SidebarContent>
      </Sidebar>
      <main className="flex-1">{children}</main>
    </SidebarProvider>
  );
}
```
