---
name: Configure Drizzle ORM
description: Set up Drizzle ORM with SQLite (or PostgreSQL), schema definitions, and migration workflow.
category: data
tags:
  - drizzle
  - orm
  - database
  - sqlite
  - postgres
  - schema
  - migration
trigger: drizzle|orm|database.*schema|sqlite.*orm
enabled: true
---

## Instructions

When configuring Drizzle ORM:

1. Install `drizzle-orm` and `drizzle-kit` (+ driver: `better-sqlite3` or `@neondatabase/serverless`)
2. Create `db/schema.ts` — define tables with `sqliteTable()` / `pgTable()`
3. Create `db/index.ts` — export the `db` instance
4. Create `drizzle.config.ts` at project root
5. Add scripts: `"db:generate": "drizzle-kit generate"`, `"db:migrate": "drizzle-kit migrate"`
6. Use typed queries: `db.select().from(table).where(eq(table.id, id))`
7. Always export table types: `type User = typeof users.$inferSelect`
