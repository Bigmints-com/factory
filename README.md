# SaveADay Factory

Autonomous app scaffolding factory for the SaveADay monorepo.

This is a **standalone project** that produces new apps by reading spec files and applying them to a structured reference of monorepo patterns. It never modifies the monorepo directly.

## Quick Start

```bash
npm install
npm run factory -- status          # Show spec queue
npm run factory -- scaffold specs/invoices.yaml   # Scaffold an app
npm run factory -- validate specs/invoices.yaml   # Validate a spec
npm run factory -- validate-output invoices        # Validate generated output
npm run factory -- patch specs/invoices.yaml       # Generate integration patches
npm run factory -- report invoices                 # Generate build report
npm run factory -- sync /path/to/saveaday          # Sync reference from monorepo
```

## Architecture

```
saveaday-factory/
├── reference/    ← Portable snapshot of monorepo patterns
├── specs/        ← Task queue (YAML spec files)
├── engine/       ← CLI + scaffolding + validation logic
├── output/       ← Generated apps (gitignored)
└── reports/      ← Build reports
```

## Workflow

1. **Define**: Write a spec YAML in `specs/`
2. **Scaffold**: `npm run scaffold specs/your-app.yaml`
3. **Review**: Check `output/your-app/` for the generated app
4. **Copy**: Move `output/your-app/` into the monorepo's `apps/` directory
5. **Patch**: Apply files from `output/your-app/patches/` to integrate
6. **Build**: Run `pnpm install && pnpm build` in the monorepo

## Syncing Reference

To update the reference from the monorepo:

```bash
npm run sync /path/to/saveaday
```

This pulls the latest starter template, registry, and convention files.
