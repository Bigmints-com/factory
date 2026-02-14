---
name: SaveADay Factory
description: Autonomous app scaffolding and feature generation factory
---

# SaveADay Factory Skill

## What This Does

The Factory generates production-ready Next.js apps and features from YAML specs. It scaffolds, customises, validates, generates integration patches, and produces build reports — all autonomously.

## Commands

### App Generation

```bash
# Full build pipeline (validate → scaffold → customise → patch → report)
npx tsx engine/cli.ts build specs/apps/<spec>.yaml

# Individual steps
npx tsx engine/cli.ts validate specs/apps/<spec>.yaml
npx tsx engine/cli.ts scaffold specs/apps/<spec>.yaml
npx tsx engine/cli.ts patch specs/apps/<spec>.yaml
npx tsx engine/cli.ts report specs/apps/<spec>.yaml
```

### Feature Generation

```bash
# Full feature build (validate → scaffold → apply instructions)
npx tsx engine/cli.ts feature-build specs/features/<spec>.yaml

# Validate only
npx tsx engine/cli.ts feature-validate specs/features/<spec>.yaml
```

### Project Management

```bash
# Connect a repo to the factory
npx tsx engine/cli.ts project add /path/to/repo

# List connected projects
npx tsx engine/cli.ts project list

# Switch active project
npx tsx engine/cli.ts project switch <project-id>

# Initialise .factory bridge in a repo
npx tsx engine/cli.ts init-bridge /path/to/repo
```

### Queue

```bash
npx tsx engine/cli.ts status    # Show all specs and their status
```

## Spec Format

### App Spec (`specs/apps/*.yaml`)

```yaml
metadata:
  name: MyApp # Display name
  slug: my_app # Directory/package name
  icon: Briefcase # Lucide icon name

deployment:
  port: 3020
  region: us-central1
  customDomain: myapp.saveaday.ai

database:
  firestoreId: myapp
  collections: [items, users]

api:
  resources:
    - name: item
      collection: items
      searchFields: [title, description]
      fields:
        title: { type: string, required: true }
        status: { type: string, default: "active" }
```

### Feature Spec (`specs/features/*.yaml`)

```yaml
feature:
  name: Recurring Schedule
  slug: recurring-schedule

target:
  app: my_app

model:
  collection: recurringSchedules
  fields:
    - { name: title, type: string, required: true }
    - { name: frequency, type: string, default: "weekly" }

pages:
  - { slug: list, type: list, title: "Schedules" }
  - { slug: new, type: form, title: "New Schedule" }
  - { slug: detail, type: detail, title: "Schedule Detail" }
```

## Output

All generated files go to `output/<slug>/`:

- App source code (ready to copy into `apps/<slug>/`)
- `patches/` — integration files for the monorepo
- `patches/APPLY.md` — step-by-step apply guide

Reports go to `reports/<slug>-<timestamp>.md`.

## UI Dashboard

Start with `./start.sh` → available at `http://localhost:4040`.

Views: Dashboard, Specs (view/edit YAML), Queue, Reports, Knowledge, Projects.
