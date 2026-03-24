---
name: Setup API Routes
description: Create a RESTful API route structure with CRUD operations, error handling, and input validation.
category: api
tags:
  - api
  - routes
  - rest
  - crud
  - endpoint
  - handler
trigger: api.*route|rest.*api|crud
enabled: true
---

## Instructions

When setting up API routes:

1. Use Next.js App Router convention: `app/api/[resource]/route.ts`
2. Export named functions: `GET`, `POST`, `PUT`, `DELETE`
3. Validate request bodies with Zod schemas
4. Return consistent JSON responses: `{ success, data?, error? }`
5. Use proper HTTP status codes (200, 201, 400, 404, 500)
6. Add try/catch with structured error responses
7. Use `NextResponse.json()` for all responses
8. For dynamic routes, use `app/api/[resource]/[id]/route.ts`
