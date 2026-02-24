<p align="center">
  <h1 align="center">🏭 Factory</h1>
  <p align="center">
    <strong>Autonomous app scaffolding from YAML specs — plan, build, test, fix, push.</strong>
  </p>
  <p align="center">
    <a href="#quick-start">Quick Start</a> •
    <a href="#cli-reference">CLI</a> •
    <a href="#how-it-works">How It Works</a> •
    <a href="#ui-dashboard">Dashboard</a> •
    <a href="CONTRIBUTING.md">Contributing</a>
  </p>
  <p align="center">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" />
    <img src="https://img.shields.io/badge/node-%3E%3D18-green.svg" alt="Node.js" />
    <img src="https://img.shields.io/badge/typescript-5.x-blue.svg" alt="TypeScript" />
  </p>
</p>

---

The Factory generates **production-ready applications** from declarative YAML specifications. It scaffolds, validates, builds, tests with real toolchains, self-corrects, and pushes working code to your repo — all autonomously.

Write a spec. Queue it up. Go to sleep. Wake up to working code.

## ✨ Features

- **🤖 Autonomous Build Pipeline** — Plan → Build → Test → Iterate → Push, no manual steps
- **🧪 Real Toolchain Testing** — Runs `npm install`, `tsc`, ESLint/Biome, Vitest/Jest, and runtime smoke tests
- **🔧 Self-Correcting** — Targeted iteration: parses errors, identifies broken files, sends only those to the LLM for fixing
- **📦 Module-by-Module Generation** — Large apps (>15 files) are decomposed into ordered modules with cross-module context
- **🔗 Integration-Aware Features** — Feature builds read the target app's package.json, tsconfig, and file tree
- **📋 Dependency-Aware Queue** — Phase ordering and `dependsOn` gating — queue everything, the engine figures out the build order
- **🌐 Multi-Provider LLM** — Gemini, OpenAI, or Ollama (local). Bring your own models.
- **🖥️ Web Dashboard** — Next.js UI for spec management, queue monitoring, build history, and settings

## Quick Start

### Prerequisites

- **Node.js** ≥ 18
- An LLM provider: [Google Gemini](https://ai.google.dev/), [OpenAI](https://platform.openai.com/), or [Ollama](https://ollama.ai/) (local, free)

### Install

```bash
git clone https://github.com/factory/factory.git
cd factory
npm install
```

### Configure

```bash
# Create your settings file from the template
cp settings.example.json settings.json

# Edit settings.json — add your API key and enable a provider
# For local models, install Ollama and pull a model:
#   ollama pull llama3
```

### Connect a Project

```bash
# Connect your repo to the factory
npx tsx engine/cli.ts project add /path/to/your/repo

# This creates a .factory/ directory in your repo with:
#   factory.yaml     — project config
#   specs/apps/      — app spec files
#   specs/features/  — feature spec files
```

### Build

```bash
# Write a spec (see template.yaml for the full schema)
# Place it in your repo: .factory/specs/apps/my-app.yaml

# Build a single spec
npx tsx engine/cli.ts build .factory/specs/apps/my-app.yaml

# Or queue multiple specs and process autonomously
npx tsx engine/cli.ts queue add .factory/specs/apps/my-app.yaml
npx tsx engine/cli.ts queue add .factory/specs/features/auth.yaml
npx tsx engine/cli.ts queue start
```

### Dashboard

```bash
npm run dev    # http://localhost:4040
```

## CLI Reference

```
factory <command> [options]
```

| Command                   | Description                                                    |
| ------------------------- | -------------------------------------------------------------- |
| `build <spec.yaml>`       | Full pipeline: validate → plan → build → test → iterate → push |
| `validate <spec.yaml>`    | Validate a spec without building                               |
| `status`                  | Show all spec statuses                                         |
| `sync <repo-path>`        | Check .factory sync state                                      |
| `init-bridge <repo-path>` | Initialize .factory bridge in a repo                           |

### Project Management

| Command                   | Description           |
| ------------------------- | --------------------- |
| `project add <repo-path>` | Connect a repository  |
| `project list`            | List connected repos  |
| `project switch <id>`     | Switch active project |
| `project remove <id>`     | Disconnect a repo     |

### Feature Builds

| Command                        | Description                          |
| ------------------------------ | ------------------------------------ |
| `feature build <spec.yaml>`    | Build a feature into an existing app |
| `feature validate <spec.yaml>` | Validate a feature spec              |

### Build Queue

| Command                 | Description                            |
| ----------------------- | -------------------------------------- |
| `queue list`            | List all queue items with status       |
| `queue add <spec.yaml>` | Add spec to the build queue            |
| `queue start`           | Process all pending items autonomously |
| `queue stats`           | Show queue statistics                  |
| `queue clear`           | Clear completed items                  |
| `queue retry <id>`      | Retry a failed item                    |
| `queue remove <id>`     | Remove an item from the queue          |

> All CLI commands run via `npx tsx engine/cli.ts <command>`.

## How It Works

```
You write a spec → Queue it → Factory builds it → You wake up to working code
```

### The Build Pipeline

Each spec goes through this pipeline:

1. **Gather** — Reads spec, `factory.yaml`, knowledge files, repo conventions
2. **Validate** — Checks spec schema before burning LLM tokens
3. **Plan** — LLM creates a build plan (file list, architecture, decisions)
4. **Build** — LLM generates code. Apps >15 files use module-by-module generation
5. **Test** — Real toolchain: `npm install` → `tsc` → lint → test → runtime smoke test
6. **Iterate** — If tests fail, targeted fix: only broken files + their importers are resent to the LLM
7. **Write** — Files written to repo, `npm install` run in the app directory
8. **Push** — Git commit and push

### Task Classification

The engine classifies each spec and applies appropriate validation:

| Task Type  | Install | tsc | Lint | Tests | Runtime | Max Iterations |
| ---------- | ------- | --- | ---- | ----- | ------- | -------------- |
| `full-app` | ✓       | ✓   | ✓    | ✓     | ✓       | 5              |
| `frontend` | ✓       | ✓   | ✓    | ✓     | ✓       | 4              |
| `scaffold` | ✓       | ✗   | ✗    | ✗     | ✗       | 2              |
| `config`   | ✗       | ✗   | ✗    | ✗     | ✗       | 0              |

## Spec Format

### App Spec

```yaml
appName: "Inventory Tracker"
description: "A web app to track warehouse inventory"

stack:
  framework: next.js # next.js | remix | vite | astro
  packageManager: pnpm # pnpm | npm | yarn
  language: typescript
  linter: eslint # eslint | biome | none
  testing: vitest # vitest | jest | none
  database: supabase # supabase | postgres | firestore | none

auth:
  provider: firebase
  methods:
    email: true
    google: true

data:
  tables:
    - name: items
      fields:
        title: { type: string, required: true }
        quantity: { type: number, default: 0 }

pages:
  dashboard: ["overview", "settings"]
  crud: [{ table: items }]

deployment:
  port: 3000
```

See [template.yaml](template.yaml) for the full schema with all options.

### Feature Spec

```yaml
feature:
  name: Barcode Scanner
  slug: barcode-scanner

target:
  app: inventory-tracker

phase: 2 # 1 = foundation, 2 = core, 3 = polish
dependsOn: [auth-system] # Must complete before this builds

model:
  collection: scans
  fields:
    - { name: barcode, type: string, required: true }
    - { name: scannedAt, type: datetime }

pages:
  - { slug: scan, type: form, title: "Scan Barcode" }
  - { slug: history, type: list, title: "Scan History" }
```

## Architecture

```
factory/
├── engine/                 ← Core build engine (TypeScript CLI)
│   ├── cli.ts              ← CLI entry point & command dispatcher
│   ├── config.ts           ← Config loading (projects, settings, bridge)
│   ├── spec.ts             ← YAML spec parsing & validation
│   ├── context.ts          ← Repo context & knowledge gathering
│   ├── generate.ts         ← LLM pipeline (plan → build → test → iterate)
│   ├── task-classifier.ts  ← Task profiling & validation gates
│   ├── writer.ts           ← File writing, npm install, git ops
│   ├── db.ts               ← SQLite database (queue, build history)
│   ├── queue.ts            ← Dependency-aware build queue
│   ├── health.ts           ← Self-healing & heartbeat monitoring
│   ├── autofix.ts          ← LLM-powered spec auto-fixing
│   ├── types.ts            ← Shared TypeScript types
│   └── log.ts              ← Structured coloured logging
├── ui/                     ← Next.js dashboard (port 4040)
├── template.yaml           ← App spec template
└── package.json
```

## UI Dashboard

Start with `npm run dev` → **http://localhost:4040**

- **Dashboard** — Project overview and spec statuses
- **Spec Generator** — AI-assisted spec creation from natural language
- **Queue View** — Monitor builds in real time
- **Build History** — Browse past builds and results
- **Settings** — Configure LLM providers, API keys, and models

## Configuration

### LLM Providers (`settings.json`)

Configure one or more providers:

| Provider   | Requirements                                                          |
| ---------- | --------------------------------------------------------------------- |
| **Gemini** | API key from [Google AI Studio](https://ai.google.dev/)               |
| **OpenAI** | API key from [OpenAI Platform](https://platform.openai.com/)          |
| **Ollama** | Local install from [ollama.ai](https://ollama.ai/) — free, no API key |

### Project Bridge (`.factory/factory.yaml`)

Each connected repo has a `.factory/factory.yaml` that defines:

```yaml
version: 1
name: my-project
description: "My awesome project"
stack:
  framework: next.js
  packageManager: pnpm
apps_dir: apps # Where generated apps go (optional)
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, project structure, and PR guidelines.

## Documentation

- [userguide.md](userguide.md) — Detailed walkthrough of how the factory works
- [AGENTS.md](AGENTS.md) — Project structure, conventions, and common tasks
- [SKILL.md](SKILL.md) — Commands, spec formats, and output structure
- [SPEC_GENERATION.md](SPEC_GENERATION.md) — AI-powered spec generation workflow

## License

[MIT](LICENSE) © Factory
