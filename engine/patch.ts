/**
 * Patch generator — produces integration files for the target project.
 *
 * These files are NOT applied automatically. They're placed in output/{slug}/patches/
 * for the user to review and copy into the target project.
 */

import { resolve, join } from 'node:path';
import type { AppSpec, ResourceDefinition } from './types.ts';
import { writeFile, slugToPascalCase, capitalize, log } from './utils.ts';
import { PATHS } from './utils.ts';

/**
 * Generate all integration patches for an app.
 *
 * @param spec - The parsed app spec
 */
export function generatePatches(spec: AppSpec): void {
    const patchDir = resolve(PATHS.output, spec.metadata.slug, 'patches');

    log('→', 'Generating apps.json patch...');
    generateAppsJsonPatch(patchDir, spec);

    log('→', 'Generating app-switcher patch...');
    generateAppSwitcherPatch(patchDir, spec);

    log('→', 'Generating API definition patch...');
    generateApiDefinitionPatch(patchDir, spec);

    log('→', 'Generating API route patches...');
    generateApiRoutePatch(patchDir, spec);

    log('→', 'Generating start-all.sh patch...');
    generateStartAllPatch(patchDir, spec);

    log('→', 'Generating APPLY.md instructions...');
    generateApplyInstructions(patchDir, spec);

    log('✓', `Patches generated at ${patchDir}`);
}

function generateAppsJsonPatch(patchDir: string, spec: AppSpec): void {
    const entry = {
        name: spec.metadata.name,
        path: `apps/${spec.metadata.slug}`,
        type: 'nextjs',
        url: `https://${spec.deployment.customDomain || spec.metadata.slug + '.saveaday.ai'}`,
        container: spec.metadata.slug,
        port: spec.deployment.port,
        database: spec.database.firestoreId,
        group: spec.metadata.group,
        status: 'development',
        region: spec.deployment.region,
    };

    writeFile(
        join(patchDir, 'patch-apps-json.json'),
        JSON.stringify(entry, null, 4) + '\n'
    );
}

function generateAppSwitcherPatch(patchDir: string, spec: AppSpec): void {
    const content = `// Add this entry to the 'apps' array in packages/shared-ui/src/app-switcher.tsx
//
// Location: Find the existing array of app objects and add this entry.
// After adding, rebuild shared-ui: pnpm --filter @saveaday/shared-ui build

{
    name: '${spec.metadata.name}',
    slug: '${spec.metadata.slug}',
    icon: '${spec.metadata.icon}',
    color: '${spec.metadata.color}',
    url: '${spec.deployment.customDomain ? 'https://' + spec.deployment.customDomain : 'https://' + spec.metadata.slug + '.saveaday.ai'}',
    devPort: ${spec.deployment.port},
}
`;

    writeFile(join(patchDir, 'patch-app-switcher.tsx'), content);
}

function generateApiDefinitionPatch(patchDir: string, spec: AppSpec): void {
    for (const resource of spec.api.resources) {
        const pascalName = slugToPascalCase(resource.name);

        const fieldsStr = Object.entries(resource.fields)
            .map(([name, def]) => {
                return `        ${name}: { type: '${def.type}', required: ${!!def.required}, description: '${def.description || capitalize(name)}' }`;
            })
            .join(',\n');

        const searchFieldsStr = resource.searchFields
            ? `    searchFields: [${resource.searchFields.map(f => `'${f}'`).join(', ')}],`
            : `    searchFields: ['name'],`;

        const content = `// Save as: apps/api/src/definitions/${spec.metadata.slug}.ts
// Then add to apps/api/src/definitions/index.ts:
//   export * from './${spec.metadata.slug}';

import { CrudHandlerConfig } from '@saveaday/shared-api/types';

export const ${resource.name}Config: CrudHandlerConfig = {
    collectionName: '${resource.collection}',
    resourceName: '${resource.name}',
    ownerField: 'ownerId',
${searchFieldsStr}
    defaultSort: { field: 'updatedAt', direction: 'desc' },
    databaseId: '${spec.database.firestoreId}',
    validation: (data) => {
${Object.entries(resource.fields)
    .filter(([, def]) => def.required)
    .map(([name]) => `        if (!data.${name}) throw new Error('${capitalize(name)} is required');`)
    .join('\n')}
        return data;
    },
    fields: {
        id: { type: 'string', required: true, description: 'Unique identifier' },
        ownerId: { type: 'string', required: true, description: 'User ID of the owner' },
${fieldsStr},
        createdAt: { type: 'string', required: true, description: 'ISO date string' },
        updatedAt: { type: 'string', required: true, description: 'ISO date string' },
    }
};
`;

        writeFile(join(patchDir, `patch-api-definition-${resource.name}.ts`), content);
    }
}

function generateApiRoutePatch(patchDir: string, spec: AppSpec): void {
    for (const resource of spec.api.resources) {
        // Collection route (List + Create)
        const collectionRoute = `// Save as: apps/api/src/app/api/v1/${resource.collection}/route.ts

import { createCreateHandler, createListHandler } from '@saveaday/shared-api/handlers';
import { ${resource.name}Config } from '@/definitions/${spec.metadata.slug}';

export const dynamic = 'force-dynamic';

// GET /api/v1/${resource.collection} - List all ${resource.collection}
export const GET = createListHandler(${resource.name}Config);

// POST /api/v1/${resource.collection} - Create a new ${resource.name}
export const POST = createCreateHandler(${resource.name}Config);
`;

        writeFile(
            join(patchDir, `patch-api-route-${resource.collection}-collection.ts`),
            collectionRoute
        );

        // Individual route (Get + Update + Delete)
        const individualRoute = `// Save as: apps/api/src/app/api/v1/${resource.collection}/[id]/route.ts

import { createDeleteHandler, createGetHandler, createUpdateHandler } from '@saveaday/shared-api/handlers';
import { ${resource.name}Config } from '@/definitions/${spec.metadata.slug}';

export const dynamic = 'force-dynamic';

// GET /api/v1/${resource.collection}/:id - Get a specific ${resource.name}
export const GET = createGetHandler(${resource.name}Config);

// PATCH /api/v1/${resource.collection}/:id - Update a ${resource.name}
export const PATCH = createUpdateHandler(${resource.name}Config);

// DELETE /api/v1/${resource.collection}/:id - Delete a ${resource.name}
export const DELETE = createDeleteHandler(${resource.name}Config);
`;

        writeFile(
            join(patchDir, `patch-api-route-${resource.collection}-individual.ts`),
            individualRoute
        );
    }
}

function generateStartAllPatch(patchDir: string, spec: AppSpec): void {
    const content = `# Add this line to scripts/start-all.sh
# Find the section where apps are started and add:

start_project "${spec.metadata.slug}" ${spec.deployment.port}
`;

    writeFile(join(patchDir, 'patch-start-all.sh'), content);
}

function generateApplyInstructions(patchDir: string, spec: AppSpec): void {
    const content = `# How to Apply Patches for ${spec.metadata.name}

These patches integrate the new app into your project.
Apply them in order after copying the app to \`apps/${spec.metadata.slug}/\`.

## Step 1: Copy App
\`\`\`bash
cp -r output/${spec.metadata.slug}/ /path/to/your-project/apps/${spec.metadata.slug}/
# Remove the patches directory from the copied app
rm -rf /path/to/your-project/apps/${spec.metadata.slug}/patches/
\`\`\`

## Step 2: Register in apps.json
Add the contents of \`patch-apps-json.json\` to the \`apps\` array in the root \`apps.json\`.

## Step 3: Register in App Switcher
Apply the entry from \`patch-app-switcher.tsx\` to \`packages/shared-ui/src/app-switcher.tsx\`.
Then rebuild:
\`\`\`bash
pnpm --filter @saveaday/shared-ui build
\`\`\`

## Step 4: Create API Definition
${spec.api.resources.map(r => `- Copy \`patch-api-definition-${r.name}.ts\` → \`apps/api/src/definitions/${spec.metadata.slug}.ts\`
- Add \`export * from './${spec.metadata.slug}';\` to \`apps/api/src/definitions/index.ts\``).join('\n')}

## Step 5: Create API Routes
${spec.api.resources.map(r => `- Copy \`patch-api-route-${r.collection}-collection.ts\` → \`apps/api/src/app/api/v1/${r.collection}/route.ts\`
- Copy \`patch-api-route-${r.collection}-individual.ts\` → \`apps/api/src/app/api/v1/${r.collection}/[id]/route.ts\``).join('\n')}

## Step 6: Register in start-all.sh
Add the line from \`patch-start-all.sh\` to \`scripts/start-all.sh\`.

## Step 7: Install & Build
\`\`\`bash
cd /path/to/your-project
pnpm install
pnpm build --filter @saveaday/${spec.metadata.slug}
\`\`\`

## Step 8: Create .env.local
\`\`\`bash
cd apps/${spec.metadata.slug}
cp .env.example .env.local
# Fill in Firebase credentials and secrets
\`\`\`

## Step 9: Verify
\`\`\`bash
pnpm dev --filter @saveaday/${spec.metadata.slug}
# Visit http://localhost:${spec.deployment.port}
\`\`\`
`;

    writeFile(join(patchDir, 'APPLY.md'), content);
}
