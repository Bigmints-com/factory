# SaveADay Factory

Autonomous app scaffolding and feature generation factory.

A **standalone project** that generates production-ready apps and features from declarative YAML specs. It scaffolds, customises, validates, generates integration patches, and produces build reports — all autonomously.

## Quick Start

```bash
npm install
./start.sh                                          # Start UI at localhost:4040

# CLI
npx tsx engine/cli.ts status                        # Show spec queue
npx tsx engine/cli.ts build specs/apps/myapp.yaml   # Full build pipeline
npx tsx engine/cli.ts validate specs/apps/myapp.yaml # Validate a spec
npx tsx engine/cli.ts feature-build specs/features/myfeat.yaml  # Build a feature
```

## Architecture

```
saveaday-factory/
├── engine/       ← Core build engine (TypeScript CLI)
├── specs/        ← YAML spec files (apps + features)
├── ui/           ← Next.js dashboard (port 4040)
├── output/       ← Generated apps (gitignored)
└── reports/      ← Build reports (gitignored)
```

## Workflow

1. **Connect**: Add your project via UI or `factory project add /path/to/repo`
2. **Define**: Write a spec YAML in `specs/`
3. **Build**: Run the build pipeline (validate → scaffold → customise → patch → report)
4. **Review**: Check `output/your-app/` for the generated app
5. **Apply**: Copy output into your project, follow `patches/APPLY.md` to integrate

## Documentation

- [USER_JOURNEY.md](USER_JOURNEY.md) — End-to-end walkthrough
- [SKILL.md](SKILL.md) — Commands, spec formats, output structure
- [AGENTS.md](AGENTS.md) — Project structure, conventions, common tasks
