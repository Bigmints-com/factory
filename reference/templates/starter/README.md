# Starter App

A template application demonstrating the SaveADay platform patterns and best practices.

## Features

- ✅ **Authentication**: Google OAuth with session management
- ✅ **Connections**: Webhook integrations using `@saveaday/integrations`
- ✅ **Dashboard**: Overview with stats and recent activity
- ✅ **Items Management**: CRUD operations for sample data
- ✅ **Settings**: User preferences and API token management
- ✅ **Onboarding**: First-time user setup wizard

## Running Locally

### Prerequisites

- Node.js 20+
- pnpm 9+
- Firebase project configured

### Setup

1. **Install dependencies** (from monorepo root):
   ```bash
   pnpm install
   ```

2. **Build shared packages**:
   ```bash
   pnpm build:packages
   ```

3. **Configure environment** (create `apps/starter/.env.local`):
   ```env
   # Firebase
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   
   # API
   API_URL=http://localhost:3021
   NEXT_PUBLIC_API_URL=http://localhost:3021
   
   # Auth
   NEXT_PUBLIC_AUTH_URL=http://localhost:3000
   ```

4. **Start the app**:
   ```bash
   cd apps/starter
   pnpm dev
   ```

   Or from root:
   ```bash
   ./apps/starter/start.sh
   ```

5. **Access the app**:
   - Open http://localhost:3012
   - Login with Google
   - Complete onboarding if first time

## Testing Connections

1. Navigate to **Connections** page
2. Click **"New Connection"** button
3. Select **"Custom Webhook"** from the provider catalog
4. Fill in webhook details:
   - **URL**: Your webhook endpoint
   - **Scope**: Select an item or leave as "All items"
   - **Events**: Choose which events to trigger on
   - **Headers**: Add custom headers (optional)
   - **Retry Limit**: Set retry attempts
5. Click **"Save Connection"**
6. Connection appears in the grid with toggle/delete actions

## Architecture

### Database

- **Firestore Database**: `starter`
- **Collections**:
  - `items`: Sample data items
  - `connections`: Integration connections
  - `users`: User profiles (shared across apps)

### API Integration

All data flows through the centralized API:

```typescript
// Client-side (connections page)
const response = await fetch('/api/v1/connections?app=starter');
const connections = await response.json();
```

### Connections Pattern

Uses the standard SaveADay connections architecture:

1. **Provider Catalog**: Defined in `@saveaday/integrations`
2. **Modal UI**: `CreateConnectionModal` with provider selection
3. **Webhook Form**: Reusable `WebhookForm` component
4. **API Routes**: Centralized `/api/v1/connections` endpoints
5. **Database Routing**: Connections stored in `starter` database

## File Structure

```
apps/starter/
├── src/
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── connections/
│   │   │   │   ├── page.tsx              # Connections list
│   │   │   │   └── CreateConnectionModal.tsx
│   │   │   ├── dashboard/
│   │   │   ├── items/
│   │   │   └── settings/
│   │   ├── api/
│   │   │   └── integrations/             # Local API routes
│   │   ├── login/
│   │   └── register/
│   ├── components/
│   ├── lib/
│   │   ├── actions/                      # Server actions
│   │   └── repositories/                 # Data access (server-side only)
│   └── middleware.ts                     # Auth protection
├── .env.local                            # Environment config
├── package.json
└── README.md
```

## Key Patterns Demonstrated

### 1. Client-Side Data Fetching

```typescript
// ✅ CORRECT - Use fetch in client components
const response = await fetch('/api/v1/connections?app=starter');
const data = await response.json();

// ❌ WRONG - Don't import repositories in client components
import { getConnections } from '@/lib/repositories';
```

### 2. Shared UI Components

```typescript
import { PageHeader, Card, EmptyState } from '@saveaday/shared-ui';

<PageHeader title="Connections" description="Manage integrations">
  <button>New Connection</button>
</PageHeader>
```

### 3. Integrations Package

```typescript
import { WebhookForm, getProvidersForApp } from '@saveaday/integrations';

const providers = getProvidersForApp('starter');
```

### 4. API Authentication

Supports both session cookies (automatic) and Bearer tokens:

```typescript
// Session cookie (automatic in browser)
fetch('/api/v1/connections?app=starter');

// Bearer token (for external access)
fetch('/api/v1/connections?app=starter', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

## Customization

To adapt this template for a new app:

1. **Update app metadata** in `app.config.json`
2. **Change database ID** in Firebase config
3. **Modify data models** in `lib/repositories`
4. **Update UI** to match your use case
5. **Add app-specific features** as needed

## Deployment

Build for production:

```bash
pnpm build
```

Deploy to Cloud Run:

```bash
./deploy.sh
```

## Documentation

- [Connections Architecture](../../docs/CONNECTIONS_ARCHITECTURE.md)
- [Architecture Guide](../../docs/ARCHITECTURE.md)
- [Port Assignments](../../docs/PORT_ASSIGNMENTS.md)

## Support

For issues or questions, refer to the main monorepo documentation or contact the platform team.
