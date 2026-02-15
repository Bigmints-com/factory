# How the Factory Works

> The Factory is an autonomous code generator. You describe what you want in a YAML file, queue it up, and walk away. While you sleep, it plans, builds, tests, fixes its own mistakes, and pushes working code to your repo.

---

## The Big Picture

```
You write a spec → Queue it → Factory builds it → You wake up to working code
```

There are **three actors** in this system:

1. **You** — write specs, configure the project, hit "start"
2. **The Engine** — reads your specs, calls the LLM, validates the output, writes the code
3. **The LLM** (Gemini, OpenAI, or Ollama) — does the actual code generation

---

## Step by Step

### 1. Connect Your Repository

Before anything happens, the Factory needs to know where your code lives.

```
factory project add /path/to/your/repo
```

This registers the repo in `projects.json`. The Factory will read from and write to this directory. You can connect multiple repos and switch between them.

The repo should have a `.factory/` folder containing:

- `factory.yaml` — project-level config (stack, conventions, knowledge paths)
- `specs/apps/` — YAML specs for entire applications
- `specs/features/` — YAML specs for individual features

---

### 2. Write a Spec

A spec is a YAML file that describes what you want built. Here's a simple one:

```yaml
appName: "Inventory Tracker"
description: "A web app to track warehouse inventory with barcode scanning"

stack:
  framework: next.js
  packageManager: pnpm
  language: typescript
  linter: eslint
  testing: vitest

auth:
  provider: firebase
  methods:
    email: true
    google: true

data:
  tables:
    - name: items
      fields:
        name: { type: string, required: true }
        sku: { type: string, required: true }
        quantity: { type: number, default: 0 }
        location: { type: string }

pages:
  dashboard: ["overview", "recent-activity"]
  crud: [{ table: items }]

status: draft
```

The `stack` section is critical — it tells the engine which tools to use for building, linting, and testing. The engine respects these choices throughout the entire pipeline.

---

### 3. Queue It Up

You can build one spec at a time:

```
factory build specs/apps/inventory-tracker.yaml
```

Or — the real power — queue up multiple specs for autonomous processing:

```
factory queue add specs/apps/inventory-tracker.yaml
factory queue add specs/features/auth-system.yaml
factory queue add specs/features/barcode-scanner.yaml
factory queue start
```

The last command kicks off the autonomous loop. The Factory will process every queued item, one after another, without stopping.

> **Dependency-aware ordering**: Feature specs can declare `phase` (1 = foundation, 2 = core, 3 = polish) and `dependsOn` (a list of spec slugs that must complete first). The queue processes items in phase order and skips any spec whose dependencies haven't completed yet. When all processable items are done, it reports which specs remain blocked and why.

---

### 4. What Happens Inside

When you run `queue start`, here's exactly what happens for each spec:

#### 4a. Gather Context

The engine reads:

- The spec YAML itself
- `factory.yaml` — your project's stack, conventions, and structure
- **Knowledge files** — any `.md` files listed in `factory.yaml` that describe your codebase patterns, coding standards, or architectural decisions
- **Conventions** — rules about naming, file structure, imports

All of this is bundled into a single "context" block that gets sent to the LLM alongside the spec.

#### 4b. Validate

The engine checks the spec for obvious issues before burning LLM tokens:

- Is `appName` present?
- Is `stack.framework` defined?
- Are table definitions complete?
- Is the port in a valid range?

If validation fails, the spec is marked as `review` and the engine moves on to the next item in the queue.

#### 4c. Plan

The engine asks the LLM to create a **build plan** — before writing any code.

The plan includes:

- The list of files that will be generated
- The architecture approach (folder structure, component hierarchy)
- Key decisions (state management choice, routing strategy, etc.)

This plan is attached to all subsequent prompts, so the LLM stays consistent as it generates each file.

#### 4d. Build

The engine sends the spec + context + plan to the LLM and asks it to generate all the code.

The LLM responds with the full file contents in a structured format:

```
===FILE: src/app/page.tsx===
// ... generated code ...
===END_FILE===
```

The engine parses this into individual files.

#### 4e. Test

This is where the engine earns its keep. It doesn't just dump the LLM output and hope — it **actually tests it**.

The engine writes all generated files to a **temporary directory** and runs real commands based on your spec's `stack` config:

| What you configured    | What the engine runs                |
| ---------------------- | ----------------------------------- |
| `packageManager: pnpm` | `pnpm install --no-frozen-lockfile` |
| `language: typescript` | `npx tsc --noEmit`                  |
| `linter: eslint`       | `npx eslint . --max-warnings=0`     |
| `linter: biome`        | `npx @biomejs/biome check .`        |
| `testing: vitest`      | `npx vitest run --reporter=verbose` |
| `testing: jest`        | `npx jest --forceExit`              |

If everything passes — great, move on. If not...

#### 4f. Iterate

When tests fail, the engine feeds the **actual error messages** back to the LLM:

> "Here's what you generated. Here are the errors. Fix them."

The LLM regenerates the broken files. The engine tests again. This loop runs up to **3 times**. Most issues (missing imports, type errors, incorrect JSON) get fixed in the first retry.

#### 4g. Write

Once tests pass (or max iterations are reached), the engine writes the generated files to the target directory in your repo.

#### 4h. Install

The engine runs `npm install` (or `pnpm`/`yarn`/`bun` — whatever you configured) in the target directory so the app is immediately runnable.

#### 4i. Commit & Push

The engine stages all changes, commits with a descriptive message like:

```
factory: generate Inventory Tracker
```

After all queued items are processed, it pushes everything to the remote in one go.

---

### 5. What Gets Tracked

Throughout the process, the engine maintains state in multiple places:

#### Spec Status (in the YAML file itself)

```
draft → in-progress → validation → done
                                  → review (if failed)
```

You can check this from the UI or by looking at the spec file.

#### Queue State (in `factory.db`)

Each queue item tracks:

- Status: `pending` → `running` → `completed` / `failed`
- Phase and dependencies (`dependsOn` slugs)
- Start time, end time, duration
- Output logs
- Error messages (if any)

The queue dequeues in **phase order** and only processes items whose `dependsOn` specs are all `completed`.

#### Build History (in `factory.db`)

Every build is logged with:

- Which spec was built
- How many files were generated
- How long it took
- Whether it succeeded or failed
- The full output

This history is searchable and serves as a knowledge base for future builds.

---

### 6. The UI

The Factory has a web UI that gives you visibility into everything:

- **Dashboard** — overview of connected projects and specs
- **Spec Editor** — create and edit YAML specs with a chat-based generator
- **Queue View** — see what's queued, running, completed, or failed
- **Build History** — browse past builds and their results
- **Settings** — configure LLM providers, API keys, models

The UI reads directly from the same files and database the engine uses — `projects.json`, `settings.json`, `factory.db`, and the spec YAMLs. When you click "Start Queue" in the UI, it calls the same `engine/cli.ts build` command under the hood.

---

## The Engine Files

| File          | What it does                                                 |
| ------------- | ------------------------------------------------------------ |
| `cli.ts`      | Receives commands, dispatches to the right handler           |
| `config.ts`   | Reads/writes project settings and factory.yaml               |
| `spec.ts`     | Loads specs, validates them, updates their status            |
| `context.ts`  | Gathers knowledge and conventions from the repo              |
| `generate.ts` | Runs the LLM pipeline (plan → build → test → iterate)        |
| `writer.ts`   | Writes files to disk, runs npm install, handles git          |
| `db.ts`       | SQLite database for queue and build history                  |
| `queue.ts`    | Queue operations (dependency-aware dequeue, enqueue, status) |
| `types.ts`    | TypeScript types shared across all modules                   |
| `log.ts`      | Colored, structured logging                                  |

---

## Key Design Decisions

1. **Platform agnostic** — The engine has no hardcoded knowledge about any specific project. Everything comes from `factory.yaml` and the spec.

2. **Real testing** — The engine doesn't trust the LLM. It writes code to a temp dir, installs dependencies, and runs your configured linter and test runner. Real errors, real feedback.

3. **Self-correcting** — When tests fail, errors go back to the LLM. Up to 3 attempts. Most trivial issues (missing imports, type mismatches) get fixed automatically.

4. **Queue-first** — The whole system is designed around batch processing. Queue up 10 specs, start it, go to bed. Wake up to 10 committed applications.

5. **Your tools, your rules** — The engine uses whatever linter, test runner, and package manager you choose in the spec. ESLint or Biome. Vitest or Jest. npm or pnpm. Your call.

6. **Dependency-aware scheduling** — Feature specs declare `phase` and `dependsOn`. The queue builds foundation specs first and waits for dependencies to complete before building dependent specs. You can queue everything at once — the engine figures out the right order.
