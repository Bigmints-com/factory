# SaveADay Factory — Agent Instructions

## Project Structure

```
saveaday-factory/
├── engine/           ← Core build engine (TypeScript)
│   ├── cli.ts        ← CLI entry point
│   ├── scaffold.ts   ← Copy starter template
│   ├── customize.ts  ← Rewrite files from spec
│   ├── validate.ts   ← Schema + output validation
│   ├── patch.ts      ← Monorepo integration patches
│   ├── report.ts     ← Markdown build reports
│   ├── feature-scaffold.ts  ← Feature generation
│   ├── feature-validate.ts  ← Feature spec validation
│   ├── bridge.ts     ← .factory bridge init
│   ├── projects.ts   ← Multi-project management
│   ├── queue.ts      ← Build queue (SQLite)
│   ├── db.ts         ← Database connection
│   ├── knowledge.ts  ← Knowledge/conventions reader
│   ├── sync.ts       ← Reference sync from monorepo
│   ├── git.ts        ← Git operations
│   ├── utils.ts      ← Shared utilities
│   └── types.ts      ← TypeScript type definitions
├── specs/            ← Spec YAML files
│   ├── apps/         ← App specs
│   └── features/     ← Feature specs
├── ui/               ← Next.js dashboard (port 4040)
│   └── src/
│       ├── app/
│       │   └── api/  ← API routes (specs, build, validate, queue, etc.)
│       └── components/
│           ├── dashboard.tsx      ← Main dashboard
│           ├── sidebar.tsx        ← Navigation sidebar
│           ├── spec-card.tsx      ← Spec display card
│           ├── spec-editor.tsx    ← YAML view/edit
│           ├── queue-view.tsx     ← Build queue UI
│           ├── report-viewer.tsx  ← Report display
│           ├── knowledge-view.tsx ← Knowledge viewer
│           ├── add-project.tsx    ← Project connection
│           └── project-switcher.tsx ← Active project switcher
├── start.sh          ← Start script (engine + UI)
├── package.json      ← Root dependencies
└── tsconfig.json     ← TypeScript config
```

## Key Concepts

### Specs

YAML files that declaratively describe apps or features. Located in `specs/apps/` and `specs/features/`. Files starting with `_` are templates/examples (filtered from UI).

### Bridge

The `.factory/` folder created inside a connected project repo. Contains `factory.yaml` (manifest) and `specs/` subdirectories. This is the contract between the factory and the target repo.

### Build Pipeline

`validate → scaffold → customise → patch → report`. Each step is a discrete engine module. The `build` CLI command runs all steps in sequence.

### Queue

SQLite-backed (`factory.db`) build queue. Items have statuses: `pending`, `running`, `completed`, `failed`, `needs-attention`. Supports priority ordering, retry, and batch processing.

## Conventions

- **Engine**: Pure TypeScript, runs via `npx tsx`. No transpilation needed.
- **UI**: Next.js 15 with App Router, shadcn/ui components, Tailwind CSS.
- **State**: SQLite for queue/state (`factory.db`), JSON for projects (`projects.json`).
- **Notifications**: Sonner toasts for all user-facing action feedback.
- **Routing**: Hash-based (`#specs`, `#queue`, etc.) for tab persistence.
- **API**: Next.js API routes at `/api/*` that invoke engine functions.

## Common Tasks

### Adding a new spec field

1. Update `engine/types.ts` with the new field
2. Update `engine/validate.ts` to check the field
3. Update `engine/customize.ts` to use the field in generated code
4. Update `specs/apps/_template.yaml` with an example

### Adding a new UI feature

1. Create component in `ui/src/components/`
2. Add API route in `ui/src/app/api/` if backend needed
3. Wire into `dashboard.tsx` (add tab, render function, state)
4. Add to sidebar in `sidebar.tsx` if it's a new view

### Adding a new engine module

1. Create `engine/<module>.ts`
2. Export functions, import in `engine/cli.ts`
3. Add CLI command handler in the `switch` statement
4. Add API route in `ui/src/app/api/` for UI access
