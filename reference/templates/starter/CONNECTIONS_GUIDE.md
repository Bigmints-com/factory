# Connections Implementation Guide

This guide explains how to implement the connections/integrations system in your app.

## Overview

The connections system allows users to:
- Connect external services (GitHub, Netlify, databases, etc.)
- Test connections before saving
- Manually trigger integrations
- Manage active/inactive connections

## Files Included

### UI Components
- `src/app/(dashboard)/connections/page.tsx` - Main connections list page
- `src/app/(dashboard)/connections/CreateConnectionModal.tsx` - Modal for creating connections
- `src/app/(dashboard)/connections/GitHubConnectionForm.tsx` - GitHub-specific form (example)

### API Routes
- `src/app/api/integrations/connections/route.ts` - CRUD operations for connections
- `src/app/api/integrations/test-connection/route.ts` - Test connections before saving
- `src/app/api/integrations/trigger/route.ts` - Manually trigger integrations

### Data Layer
- `src/lib/repositories/connectionsRepository.ts` - Firestore operations
- `src/lib/integrations.ts` - Register your integration providers

## Setup Steps

### 1. Install Dependencies

Already added to `package.json`:
```json
{
  "@saveaday/integrations": "workspace:*",
  "@saveaday/trigger-github-pages-deployment": "workspace:*",
  "lucide-react": "^0.469.0"
}
```

Run: `pnpm install`

### 2. Add to Sidebar

Already added in `src/app/(dashboard)/layout.tsx`:
```tsx
<SidebarItem href="/connections" icon="Zap">Connections</SidebarItem>
```

### 3. Register Integrations

Edit `src/lib/integrations.ts` to register the providers you want:

```typescript
import { registerTrigger } from '@saveaday/integrations/server';
import { githubPagesDeploymentTrigger } from '@saveaday/trigger-github-pages-deployment';

// Register triggers your app needs
registerTrigger(githubPagesDeploymentTrigger);
```

### 4. Filter Providers by App

In `packages/integrations/src/catalog.ts`, specify which apps each provider applies to:

```typescript
{
  id: 'github-pages-deployment',
  name: 'GitHub Pages',
  applicableApps: ['newsfeed', 'your-app-name'], // Add your app
}
```

### 5. Add Manual Trigger Button (Optional)

If you want manual trigger control on specific pages:

```tsx
import TriggerButton from './TriggerButton';

<TriggerButton
  itemId={id}
  itemData={data}
/>
```

## Firestore Collection

Connections are stored in the `connections` collection:

```typescript
{
  id: string;
  ownerId: string;
  name: string;
  providerId: string; // e.g., 'github-pages-deployment'
  type: 'trigger' | 'source';
  category: string;
  config: Record<string, any>; // Provider-specific config
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
```

## Creating New Providers

### 1. Create Provider Package

```bash
mkdir packages/trigger-your-service
cd packages/trigger-your-service
pnpm init
```

### 2. Implement Provider

```typescript
import { z } from 'zod';
import type { TriggerProvider } from '@saveaday/integrations';

export const yourServiceConfigSchema = z.object({
  apiKey: z.string(),
  // ... other config
});

export const yourServiceTrigger: TriggerProvider = {
  id: 'your-service',
  name: 'Your Service',
  description: 'Description',
  type: 'trigger',
  category: 'deployment',
  version: '1.0.0',
  configSchema: yourServiceConfigSchema,
  eventTypes: ['content.published'],
  
  testConnection: async (config) => {
    // Test the connection
    return { success: true };
  },
  
  execute: async (eventType, payload, config) => {
    // Execute the trigger
    return { success: true };
  },
};
```

### 3. Add to Catalog

In `packages/integrations/src/catalog.ts`:

```typescript
{
  id: 'your-service',
  name: 'Your Service',
  description: 'Description',
  category: 'deployment',
  available: true,
  applicableApps: ['your-app'],
}
```

### 4. Create Configuration Form

Create `YourServiceConnectionForm.tsx` similar to `GitHubConnectionForm.tsx`.

## Usage Examples

### Test Connection
```typescript
const response = await fetch('/api/integrations/test-connection', {
  method: 'POST',
  body: JSON.stringify({
    providerId: 'github-pages-deployment',
    config: { repository, token, branch }
  })
});
```

### Save Connection
```typescript
const response = await fetch('/api/integrations/connections', {
  method: 'POST',
  body: JSON.stringify({
    name: 'My Connection',
    providerId: 'github-pages-deployment',
    type: 'trigger',
    category: 'deployment',
    config: { repository, token, branch },
    active: true
  })
});
```

### Trigger Manually
```typescript
const response = await fetch('/api/integrations/trigger', {
  method: 'POST',
  body: JSON.stringify({
    connectionId: 'conn_123',
    event: 'content.published',
    payload: { data: '...' }
  })
});
```

## Security Notes

1. **Encrypt Sensitive Data**: The TODO comments indicate where to add encryption for tokens/API keys
2. **Validate User Ownership**: All API routes check user authentication
3. **Filter by Owner**: Connections are always filtered by `ownerId`

## Next Steps

1. Customize the UI to match your app's design
2. Add more provider-specific forms
3. Implement automatic triggering (currently manual only)
4. Add scheduled triggers
5. Implement connection encryption for sensitive fields
