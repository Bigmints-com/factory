# SaveADay Factory — Agent Instructions

## Project Structure

```
saveaday-factory/
├── engine/                ← Core build engine (TypeScript, runs via npx tsx)
│   ├── cli.ts             ← CLI entry point & command dispatcher
│   ├── config.ts          ← projects.json, settings.json, factory.yaml loading
│   ├── spec.ts            ← Load, validate, update status of YAML specs
│   ├── context.ts         ← Gather knowledge & conventions from repos
│   ├── generate.ts        ← LLM pipeline: plan → build → test → iterate
│   ├── writer.ts          ← File writer, npm install, git ops, knowledge feedback
│   ├── db.ts              ← SQLite database (queue, builds history)
│   ├── queue.ts           ← Queue manager for autonomous batch builds
│   ├── types.ts           ← All shared TypeScript types
│   └── log.ts             ← Structured coloured logging
├── ui/                    ← Next.js dashboard (port 4040)
│   └── src/
│       ├── app/
│       │   └── api/       ← API routes (specs, build, validate, queue, chat)
│       └── components/    ← Dashboard, sidebar, spec editor, queue view, etc.
├── HOW_IT_WORKS.md        ← Human-readable end-to-end workflow doc
├── start.sh               ← Start script (engine + UI)
├── package.json           ← Root dependencies
└── tsconfig.json          ← TypeScript config
```

## Engine Modules

| Module        | Responsibility                                                                  |
| ------------- | ------------------------------------------------------------------------------- |
| `cli.ts`      | Parses CLI args, dispatches to handlers (build, validate, queue, project, sync) |
| `config.ts`   | Reads/writes `projects.json`, `settings.json`, `.factory/factory.yaml`          |
| `spec.ts`     | Loads YAML specs, validates schemas, updates spec `status` field in-place       |
| `context.ts`  | Gathers knowledge files, conventions, and build history from the target repo    |
| `generate.ts` | Orchestrates LLM calls: plan → build → test → iterate. Real toolchain testing   |
| `writer.ts`   | Writes files, runs `npm install`, git commit/push, knowledge entries, AGENTS.md |
| `db.ts`       | SQLite via `better-sqlite3`: queue_items, builds, queue_state tables            |
| `queue.ts`    | Enqueue, dequeue, mark status, retry, stats, running state                      |
| `types.ts`    | AppSpec, FeatureSpec, BridgeConfig, BuildResult, LLMProvider, etc.              |
| `log.ts`      | Coloured step/error/success logging                                             |

## Build Pipeline

```
Queue → Gather → Validate → Plan → Build → Test → Iterate → Write → Install → AGENTS.md → Knowledge → Commit → Push
```

### Test Step (Real Toolchain)

The engine writes generated code to a temp directory and runs actual commands based on `spec.stack`:

- `npm install` (or pnpm/yarn/bun)
- `tsc --noEmit` (if TypeScript)
- Linter: eslint, biome, oxlint, prettier
- Test runner: vitest, jest, playwright, cypress

Errors feed back to LLM for up to 3 correction attempts.

### Post-Build

After writing files, the engine:

1. Runs `npm install` in the target app directory
2. Generates `AGENTS.md` inside the app with stack, structure, and conventions
3. Writes a knowledge entry to `.factory/knowledge/builds/` for future context
4. Commits and pushes

## Spec Status Lifecycle

```
draft → in-progress → validation → done | review
```

Updated in the YAML file itself via `updateSpecStatus()`.

## Key Concepts

### Specs

YAML files in `.factory/specs/apps/` (app specs) and `.factory/specs/features/` (feature specs). Define the app's stack, data model, pages, auth, and deployment.

### Bridge

The `.factory/` folder inside a connected project repo. Contains `factory.yaml` (manifest), `knowledge/` (build history), and `specs/` subdirectories.

### Queue

SQLite-backed (`factory.db`) build queue. Items: `pending → running → completed | failed`. Supports priority ordering, retry, batch processing, and autonomous `queue start`.

### Knowledge Feedback

Each build writes a summary to `.factory/knowledge/builds/`. The context gatherer auto-discovers these, so subsequent specs have full awareness of what's already been built.

## CLI Commands

```
factory build <spec.yaml>              Full pipeline
factory validate <spec.yaml>           Validate a spec
factory status                         Show spec statuses
factory sync <repo-path>               Sync .factory from repo
factory init-bridge <repo-path>        Init .factory bridge in repo

factory project add <repo-path>        Connect a repo
factory project list                   List connected repos
factory project switch <id>            Switch active project
factory project remove <id>            Disconnect a repo

factory feature build <spec.yaml>      Build a feature
factory feature validate <spec.yaml>   Validate a feature spec

factory queue list                     List all queue items
factory queue add <spec.yaml>          Add a spec to the queue
factory queue start                    Process all pending items autonomously
factory queue stats                    Show queue statistics
factory queue clear                    Clear completed items
factory queue retry <id>               Retry a failed item
factory queue remove <id>              Remove an item from queue
```

## Conventions

- **Engine**: Pure TypeScript, runs via `npx tsx`. No transpilation step.
- **UI**: Next.js 15 with App Router, shadcn/ui, Tailwind CSS.
- **State**: SQLite for queue/builds (`factory.db`), JSON for projects (`projects.json`).
- **Specs**: YAML, validated against typed schemas defined in `types.ts`.
- **Notifications**: Sonner toasts for UI feedback.
- **API**: Next.js API routes at `/api/*` that invoke engine CLI or read from DB/files.

## Common Tasks

### Adding a new spec field

1. Update type in `engine/types.ts` (AppSpec or FeatureSpec)
2. Update `engine/spec.ts` → `validateSpec()` to check the field
3. Update `engine/generate.ts` prompts to use the field in code generation
4. Update `specs/apps/_template.yaml` with an example

### Adding a new engine module

1. Create `engine/<module>.ts`
2. Export functions, import in `engine/cli.ts`
3. Add CLI command handler in the `switch` statement
4. Add API route in `ui/src/app/api/` if UI access needed

### Adding a new UI feature

1. Create component in `ui/src/components/`
2. Add API route in `ui/src/app/api/` if backend needed
3. Wire into `dashboard.tsx`
4. Add to sidebar navigation
