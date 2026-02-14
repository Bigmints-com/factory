---
name: saveaday-factory
description: Build and extend SaveADay monorepo apps using the autonomous factory engine
---

# SaveADay Factory Skill

Use this skill to generate production-ready code for the SaveADay monorepo — either **scaffold a new app** from scratch or **add a feature** to an existing app.

## Prerequisites

- Node.js 20+
- The factory project at `/Users/pretheesh/Projects/saveaday-factory`
- Run `npm install` in the factory root if `node_modules/` is missing

## Capability 1: Scaffold a New App

Generate a complete Next.js app with Firebase auth, Firestore, shared UI, and monorepo integration.

### Steps

1. **Create a spec file** at `specs/<slug>.yaml` using the AppSpec format:

```yaml
apiVersion: saveaday/v1
kind: AppSpec
status: ready
metadata:
  name: "My App"
  slug: my-app
  description: "What this app does"
  scope: "@saveaday/my-app"
deployment:
  port: 3035 # unique port — check reference/registry/apps.json
  region: europe-west1
database:
  firestoreId: my-app-db
  collections:
    - name: items
      fields:
        - { name: title, type: string, required: true }
        - { name: status, type: string, default: "draft" }
api:
  resources:
    - name: items
      operations: [list, get, create, update, delete]
features:
  auth: true
  dashboard: true
  settings: true
```

2. **Run the build pipeline**:

```bash
# From the factory root
npm run factory -- build specs/my-app.yaml
```

3. **Review the output** in `output/my-app/` — includes the full app, integration patches, and an APPLY.md with copy instructions.

4. **Copy into monorepo**:

```bash
cp -r output/my-app /path/to/saveaday/apps/my-app
```

## Capability 2: Add a Feature to an Existing App

Generate pages, repository, server actions, and types for a new feature in an existing app.

### Steps

1. **Create a feature spec** at `specs/features/<slug>.yaml`:

```yaml
apiVersion: saveaday/v1
kind: FeatureSpec
status: ready
target:
  app: invoices # slug of the target app
feature:
  name: "Recurring Invoices"
  slug: recurring
  description: "Schedule invoices to auto-generate"
  icon: "RefreshCw"
pages:
  - route: /dashboard/recurring
    title: "Recurring Invoices"
    type: list
    dataSource: recurring-schedule
  - route: /dashboard/recurring/new
    title: "New Schedule"
    type: form
    dataSource: recurring-schedule
  - route: /dashboard/recurring/[id]
    title: "Edit Schedule"
    type: detail
    dataSource: recurring-schedule
model:
  name: recurring-schedule
  collection: recurring_schedules
  fields:
    frequency:
      type: string
      required: true
      default: "monthly"
    nextRunDate:
      type: string
      required: true
    active:
      type: boolean
      default: true
navigation:
  section: main
  label: "Recurring"
  icon: "RefreshCw"
  position: "after:dashboard"
```

2. **Build the feature**:

```bash
npm run factory -- feature build specs/features/recurring.yaml
```

3. **Review output** in `output/<app>/features/<slug>/` — includes:
   - `types/<model>.ts` — TypeScript interfaces
   - `lib/repositories/<model>Repository.ts` — Firestore CRUD
   - `lib/actions/<slug>Actions.ts` — Server actions
   - `app/(dashboard)/<slug>/page.tsx` + `client.tsx` — List page
   - `app/(dashboard)/<slug>/new/page.tsx` — Form page
   - `app/(dashboard)/<slug>/[id]/page.tsx` — Detail page
   - `APPLY.md` — Integration instructions

4. **Copy into the target app**:

```bash
cd output/invoices/features/recurring
cp types/*.ts /path/to/saveaday/apps/invoices/src/types/
cp -r lib/ /path/to/saveaday/apps/invoices/src/lib/
cp -r app/ /path/to/saveaday/apps/invoices/src/app/
```

## Page Types

| Type     | Generates                                       | Use Case                     |
| -------- | ----------------------------------------------- | ---------------------------- |
| `list`   | Server page + client component with table/cards | Index/listing pages          |
| `form`   | Server page with form fields from model         | Create/new pages             |
| `detail` | Server page with field display + delete         | View/edit individual records |
| `custom` | Minimal placeholder page                        | Custom implementations       |

## Validation

Always validate specs before building:

```bash
# App specs
npm run factory -- validate specs/my-app.yaml

# Feature specs
npm run factory -- feature validate specs/features/my-feature.yaml
```

Validation checks: schema compliance, slug format, route validity, model fields, collection names, port conflicts.

## Dashboard

The factory includes a web UI for visual management:

```bash
npm run ui
# Opens at http://localhost:3001
```

From the dashboard you can validate, build, and view reports for both app and feature specs.

## Reference Sync

Keep the factory's reference snapshot up to date with the live monorepo:

```bash
npm run factory -- sync /path/to/saveaday
```

This pulls the latest starter template, app registry, and convention files.
