# SaveADay Factory — Agent Guide

This document instructs AI agents on how to use the SaveADay Factory to build and extend applications in the SaveADay monorepo.

## 🏭 What is the Factory?

The Factory is a **standalone code generation engine** that operates outside the monorepo. It reads YAML spec files and produces production-ready application code that follows all monorepo conventions.

```
saveaday-factory/
├── reference/    ← Snapshot of monorepo patterns, schemas, conventions, skills
├── specs/        ← Task queue: App specs (*.yaml) + Feature specs (features/*.yaml)
├── engine/       ← CLI + validation + scaffolding + patching logic
├── output/       ← Generated code (apps and features)
├── reports/      ← Build reports (Markdown)
└── ui/           ← Dashboard (Next.js, port 3001)
```

## 🔧 Two Modes of Operation

### 1. App Scaffolding (new apps)

Generate a complete new Next.js app with auth, Firestore, UI, and monorepo integration.

```bash
# Write a spec
vim specs/my-app.yaml

# Full pipeline: validate → scaffold → customize → patch → report
npm run factory -- build specs/my-app.yaml

# Or step by step
npm run factory -- validate specs/my-app.yaml
npm run factory -- scaffold specs/my-app.yaml
npm run factory -- patch specs/my-app.yaml
npm run factory -- report specs/my-app.yaml
```

**Output**: `output/<slug>/` — a complete Next.js app ready to copy into `apps/`.

### 2. Feature Development (extend existing apps)

Generate feature files (pages, repository, actions, types) for an existing app.

```bash
# Write a feature spec
vim specs/features/my-feature.yaml

# Full pipeline: validate → scaffold → report
npm run factory -- feature build specs/features/my-feature.yaml

# Validate only
npm run factory -- feature validate specs/features/my-feature.yaml
```

**Output**: `output/<app>/<features>/<slug>/` — files to copy into the target app's `src/`.

---

## 📋 Spec Formats

### AppSpec (specs/\*.yaml)

```yaml
apiVersion: saveaday/v1
kind: AppSpec
status: ready # draft | ready | in-progress | done
metadata:
  name: "My App"
  slug: my-app
  description: "..."
  scope: "@saveaday/my-app"
deployment:
  port: 3032
  region: europe-west1
database:
  collections:
    - name: items
      fields: [...]
api:
  resources:
    - name: items
      operations: [list, get, create, update, delete]
features:
  auth: true
  dashboard: true
```

### FeatureSpec (specs/features/\*.yaml)

```yaml
apiVersion: saveaday/v1
kind: FeatureSpec
status: ready
target:
  app: invoices # slug of existing app
feature:
  name: "Recurring Invoices"
  slug: recurring
  description: "..."
  icon: "RefreshCw"
pages:
  - route: /dashboard/recurring
    title: "Recurring"
    type: list # list | form | detail | custom
    dataSource: recurring-schedule
model:
  name: recurring-schedule
  collection: recurring_schedules
  fields:
    frequency:
      type: string
      required: true
      default: "monthly"
navigation:
  section: main
  label: "Recurring"
  icon: "RefreshCw"
```

---

## 🧩 Generated Code Patterns

All generated code follows monorepo conventions:

| File                 | Pattern                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------ |
| **Server page**      | `getUser()` → redirect if no uid → repository call → render client component               |
| **Client component** | `'use client'` + `@saveaday/shared-ui` components (Card, PageHeader, Button, EmptyState)   |
| **Repository**       | `adminDb.collection()` + `mapDoc()` + CRUD exports (create, list, getById, update, delete) |
| **Server actions**   | `'use server'` + `getUser()` + formData parsing + repository call + redirect               |
| **Types**            | Interface with `id`, `ownerId`, timestamps + `Create*Input` / `Update*Input` utility types |

---

## 🛠 Engine Modules

| Module                       | Purpose                                                        |
| ---------------------------- | -------------------------------------------------------------- |
| `engine/cli.ts`              | CLI entry point — routes commands to handlers                  |
| `engine/types.ts`            | TypeScript types for AppSpec, FeatureSpec, validation, reports |
| `engine/utils.ts`            | Shared helpers (paths, file I/O, logging)                      |
| `engine/validate.ts`         | Validates AppSpec YAML against JSON schema                     |
| `engine/scaffold.ts`         | Scaffolds a new app from AppSpec                               |
| `engine/customize.ts`        | Applies customizations (branding, config, env)                 |
| `engine/patch.ts`            | Generates integration patches for monorepo                     |
| `engine/report.ts`           | Generates Markdown build reports                               |
| `engine/sync.ts`             | Syncs reference snapshot from live monorepo                    |
| `engine/feature-validate.ts` | Validates FeatureSpec YAML (7 checks)                          |
| `engine/feature-scaffold.ts` | Generates feature files (pages, repo, actions, types)          |

---

## 🖥 Dashboard UI

The factory includes a web dashboard at `http://localhost:3001`:

```bash
npm run ui    # or: cd ui && npm run dev -- -p 3001
```

| View          | Shows                                                                            |
| ------------- | -------------------------------------------------------------------------------- |
| **Dashboard** | Stats (total specs, build reports, feature specs) + spec queue                   |
| **Specs**     | App spec cards (green) + Feature spec cards (purple) with Validate/Build buttons |
| **Reports**   | Markdown build reports with syntax highlighting                                  |

---

## 🌐 Ecosystem Skills (Shared Infrastructure)

The factory syncs **skill and agent docs** from each app in the monorepo into `reference/skills/`. These files document what each app provides — endpoints, shared packages, conventions — so the factory knows what already exists and doesn't re-create shared infrastructure.

```
reference/skills/
├── api-skills.md          ← Full API endpoint reference (auth, CRUD, connections, etc.)
├── booking-skills.md      ← Booking-specific endpoints & conventions
└── ...                    ← Any app with a skills.md/SKILL.md/agents.md/AGENTS.md
```

### How the factory uses this

- **During scaffolding**: The engine reads `reference/skills/` to know which endpoints are already provided by the ecosystem (auth, LLM config, connections, etc.) and wires shared packages instead of generating duplicates.
- **In spec templates**: The `api.endpoints` section in a spec only lists endpoints the factory needs to **create** — shared infra is handled by ecosystem packages documented in these skill files.
- **When syncing**: Run `factory sync /path/to/saveaday` — this automatically pulls skill files from every app.

### What to put in an app's skills.md

Each app in the monorepo can have a `skills.md` (or `SKILL.md`) documenting:

- Endpoints it exposes (with methods, paths, descriptions)
- Shared packages it provides (`@saveaday/shared-auth`, etc.)
- Conventions for integrating with it
- Query parameters, response formats, error shapes

---

## ⚡ Agent Workflow

1. **Sync** reference from monorepo: `factory sync /path/to/saveaday`
   - This pulls templates, registry, conventions, **and ecosystem skills**
2. **Write** a spec YAML in `specs/` or `specs/features/`
3. **Validate**: `factory validate <spec>` or `factory feature validate <spec>`
4. **Build**: `factory build <spec>` or `factory feature build <spec>`
5. **Review** output in `output/` and follow `APPLY.md` instructions
6. **Copy** generated files into the monorepo
7. **Integrate**: run `pnpm install && pnpm build` in the monorepo

---

## 🚨 Rules for Agents

1. **Never modify the monorepo directly** — generate into `output/`, then copy
2. **Always validate before building** — the build pipeline validates automatically, but validate first when iterating on a spec
3. **Follow APPLY.md** — each build generates instructions for integration
4. **Use shared packages** — generated code imports from `@saveaday/shared-ui`, `@saveaday/shared-auth`, `@saveaday/shared-firebase`
5. **Respect port allocation** — check `reference/registry/apps.json` for used ports
6. **Keep specs versioned** — commit spec files alongside builds for traceability
7. **Check ecosystem skills** — before scaffolding endpoints, review `reference/skills/` to avoid duplicating shared infrastructure
