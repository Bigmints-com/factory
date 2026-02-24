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

### 2b. AI-Assisted Spec Generation (Spec Generator)

Instead of writing YAML by hand, you can use the **Spec Generator** — a chat-based tool that creates specs from natural language:

1. Click **New Spec** in the UI → the Spec Generator dialog opens
2. The Factory **automatically scans your repo** (`/api/repo-scan`) to detect:
   - Tech stack (framework, package manager, language, DB)
   - Installed packages from `package.json`
   - Existing file structure
   - Previously created specs (to avoid duplication)
3. You describe what you want: _"Build a booking app with authentication, recurring schedules, and payment processing"_
4. The LLM generates a **decomposed spec set**: 1 app spec + N feature specs, phased and with dependency ordering
5. You preview each spec in the tab viewer, then **Save All** — feature specs are auto-enqueued for building

The repo scan context is injected into the LLM prompt, so generated specs will:

- Use the same framework, language, and tools already in your project
- Not duplicate packages already installed
- Align file paths with your existing directory structure
- Avoid duplicating features that already have specs

> For the full spec generation workflow, see [SPEC_GENERATION.md](SPEC_GENERATION.md).

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
- **Repo scan results** — the actual `package.json` dependencies, `tsconfig.json`, file tree, and detected stack (same analysis done during spec generation)
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

For smaller apps (≤15 planned files), this is a single LLM call. For **larger apps (>15 files)**, the engine uses **module-by-module generation**:

1. The build plan is decomposed into ordered modules: `config → utils → db → api → components → pages`
2. Each module is generated in a separate LLM call
3. Each prompt includes the interfaces and exports from previously generated modules, so imports work across modules
4. The config module (package.json, tsconfig) is always generated first and shared with all subsequent modules

This prevents quality degradation that occurs when LLMs generate 30+ files in a single response.

The LLM responds with file contents in a structured format:

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

Before running these commands, the engine automatically runs `npx npm-check-updates -u` to bump all package versions in `package.json` to their latest compatible versions. This is necessary because LLMs pin versions from their training data, which can be 1–2 years out of date. The version bump is non-fatal — if it fails, the engine continues with the original versions.

**Runtime smoke test**: After compilation passes, the engine also runs a **runtime validation** step. It spawns `npm run dev`, waits for the dev server to start (up to 15 seconds with exponential backoff), sends an HTTP GET to `http://localhost:3099`, and checks for a 200 status. This catches apps that compile fine but crash at runtime. The dev server is always killed after the test.

If everything passes — great, move on. If not...

#### 4f. Iterate (Targeted)

When tests fail, the engine uses **targeted iteration** rather than blind regeneration:

1. **Parse errors** — extract filenames from tsc/lint output (e.g. `src/foo.ts(12,5): error TS2304`)
2. **Identify broken files** — only the files mentioned in errors are flagged
3. **Find related files** — files that import from broken files are included as context
4. **Send targeted prompt** — "Fix ONLY these 3 files. The other 18 are working fine."
5. **Merge back** — fixed files are merged into the full set; untouched files are preserved

This prevents the LLM from breaking working files while fixing broken ones. If the engine can't identify specific broken files, it falls back to sending all files.

The iteration loop runs up to **5 times** for full-app and feature builds. Most issues get fixed in 1-2 retries.

#### 4f-b. Integration-Aware Feature Builds

When building features, the engine gathers **integration context** from the target app before generation:

- **Existing dependencies** — so the LLM doesn't duplicate packages already installed
- **tsconfig.json** — so generated code uses the same compiler options
- **File tree** — so the LLM knows the existing structure and avoids conflicts
- **Detected stack** — framework, package manager, language, and database are derived from the actual app rather than hardcoded

This context is injected into both the initial generation prompt and the iteration prompts.

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
- **Spec Generator** — AI-assisted spec creation with repo scanning and multi-spec decomposition (see [SPEC_GENERATION.md](SPEC_GENERATION.md))
- **Queue View** — see what's queued, running, completed, or failed
- **Build History** — browse past builds and their results
- **Settings** — configure LLM providers, API keys, models

The UI reads directly from the same files and database the engine uses — `projects.json`, `settings.json`, `factory.db`, and the spec YAMLs. When you click "Start Queue" in the UI, it calls the same `engine/cli.ts build` command under the hood.

---

## The Engine Files

| File                 | What it does                                                                   |
| -------------------- | ------------------------------------------------------------------------------ |
| `cli.ts`             | Receives commands, dispatches to the right handler                             |
| `config.ts`          | Reads/writes project settings and factory.yaml                                 |
| `spec.ts`            | Loads specs, validates them, updates their status                              |
| `context.ts`         | Gathers knowledge, conventions, and app integration context from the repo      |
| `generate.ts`        | Runs the LLM pipeline (plan → build → test → iterate) with targeted fixes      |
| `task-classifier.ts` | Classifies tasks and determines validation gates (install, tsc, lint, runtime) |
| `writer.ts`          | Writes files to disk, runs npm install, handles git                            |
| `db.ts`              | SQLite database for queue and build history                                    |
| `queue.ts`           | Queue operations (dependency-aware dequeue, enqueue, status)                   |
| `types.ts`           | TypeScript types shared across all modules                                     |
| `log.ts`             | Colored, structured logging                                                    |

### UI / API

| File                                | What it does                                                 |
| ----------------------------------- | ------------------------------------------------------------ |
| `ui/src/components/spec-chat.tsx`   | Spec Generator dialog: chat UI, spec preview, save/enqueue   |
| `ui/src/app/api/chat/route.ts`      | LLM-powered spec generation with repo context injection      |
| `ui/src/app/api/repo-scan/route.ts` | Scans active project: deps, stack, file tree, existing specs |
| `ui/src/app/api/specs/route.ts`     | Save and list spec YAML files                                |

---

## Key Design Decisions

1. **Platform agnostic** — The engine has no hardcoded knowledge about any specific project. Everything comes from `factory.yaml` and the spec.

2. **Real testing** — The engine doesn't trust the LLM. It writes code to a temp dir, installs dependencies, and runs your configured linter and test runner. Real errors, real feedback.

3. **Self-correcting (targeted)** — When tests fail, the engine parses errors to identify broken files and sends only those to the LLM. Untouched files are preserved. Up to 5 attempts with merge-back.

4. **Runtime-validated** — The engine doesn't just check compilation — it spins up the dev server, waits for the port, and checks for an HTTP 200. Apps that compile but crash are caught before commit.

5. **Integration-aware** — Feature builds read the target app's package.json, tsconfig, and file tree. The LLM knows what exists and generates complementary code.

6. **Module-by-module** — Large apps (>15 files) are decomposed into ordered modules (config → db → api → pages). Each module is a separate LLM call with cross-module context.

7. **Queue-first** — The whole system is designed around batch processing. Queue up 10 specs, start it, go to bed. Wake up to 10 committed applications.

8. **Your tools, your rules** — The engine uses whatever linter, test runner, and package manager you choose in the spec. ESLint or Biome. Vitest or Jest. npm or pnpm. Your call.

9. **Dependency-aware scheduling** — Feature specs declare `phase` and `dependsOn`. The queue builds foundation specs first and waits for dependencies to complete before building dependent specs. You can queue everything at once — the engine figures out the right order.

---

## Known Build Diagnostics

Lessons learned from verifying factory-built projects (e.g. ubot-core, 135 source files):

### Issue 1: Missing Packages in package.json

LLM-generated code often imports packages (`dotenv`, `uuid`, `puppeteer`, `react`, etc.) without listing them in `package.json`. The engine now runs a **Phase 1.5 structural check** that scans every `.ts`/`.tsx`/`.js`/`.jsx` file for `import ... from 'pkg'` and cross-references against `package.json` dependencies. Missing packages are flagged before toolchain validation.

### Issue 2: Cross-Module Export Mismatches

When multiple features are built independently, they generate inconsistent import/export styles:

- File A does `export default router` but File B does `import { router } from './a'`
- A barrel file exports `getDatabase()` but consumers import `{ db }`
- Class exported as `SkillRegistryImpl` but imported as `SkillRegistry`

The build prompt now includes explicit rules (rules #11-12) requiring consistent cross-module references.

### Issue 3: Overly Strict tsconfig

LLM-generated code rarely satisfies `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, or `noFallthroughCasesInSwitch`. The prompt now instructs the LLM to avoid enabling these flags (rule #13).

### Issue 4: ESM Extension Requirements

With `moduleResolution: "NodeNext"`, all relative imports must include `.js` extensions. The prompt now includes this guidance (rule #14).

### Issue 5: Native Module Version Compatibility

Packages like `better-sqlite3` have native C++ bindings that break with newer Node.js versions. Version `^9.4.3` fails on Node 24. Always verify native module compatibility with the target Node.js version.
