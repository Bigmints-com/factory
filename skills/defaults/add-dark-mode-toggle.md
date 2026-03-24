---
name: Add Dark Mode Toggle
description: Implement a theme toggle with system preference detection, localStorage persistence, and smooth transitions.
category: ui
tags:
  - dark-mode
  - theme
  - toggle
  - tailwind
  - next-themes
  - appearance
trigger: dark.?mode|theme.*toggle|light.*dark
enabled: true
---

## Instructions

When adding dark mode:

1. Install `next-themes` and wrap the app in `<ThemeProvider attribute="class" defaultTheme="system">`
2. Create a `ThemeToggle` component using `useTheme()` hook
3. Use `Sun` / `Moon` icons from `lucide-react` with smooth rotation animation
4. Implement three states: light, dark, system
5. Ensure all components use CSS variables or Tailwind `dark:` variants
6. Add `transition-colors` to the `<body>` for smooth theme switching
7. Test with both `prefers-color-scheme: dark` and manual toggle
