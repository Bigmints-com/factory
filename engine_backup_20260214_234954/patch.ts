/**
 * Patch generator — produces integration files for the target project.
 *
 * These files are NOT applied automatically. They're placed in output/{slug}/patches/
 * for the user to review and copy into the target project.
 */

import { resolve, join } from 'node:path';
import type { AppSpec } from './types.ts';
import { specSlug, specPort, specRegion } from './types.ts';
import { PATHS, writeFile, slugToPascalCase, capitalize, log } from './utils.ts';
import { getActiveBridgeConfig } from './projects.ts';

/**
 * Generate all integration patches for an app.
 *
 * @param spec - The parsed app spec
 */
export function generatePatches(spec: AppSpec): void {
    const slug = specSlug(spec);
    const patchDir = resolve(PATHS.output, slug, 'patches');

    // Read namespace from bridge config
    let namespace = '';
    try {
        const bridge = getActiveBridgeConfig();
        namespace = bridge.namespace || '';
    } catch { /* no active project — namespace stays empty */ }

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
    const slug = specSlug(spec);
    const port = specPort(spec);
    const region = specRegion(spec);

    const entry = {
        name: spec.appName,
        path: `apps/${slug}`,
        type: spec.stack.framework,
        url: `http://localhost:${port}`,
        container: slug,
        port,
        database: spec.stack.database || 'none',
        status: 'development',
        region,
    };

    writeFile(
        join(patchDir, 'patch-apps-json.json'),
        JSON.stringify(entry, null, 4) + '\n'
    );
}

function generateAppSwitcherPatch(patchDir: string, spec: AppSpec): void {
    const slug = specSlug(spec);
    const port = specPort(spec);

    const content = `// Add this entry to the 'apps' array in your app-switcher component
//
// Location: Find the existing array of app objects and add this entry.

{
    name: '${spec.appName}',
    slug: '${slug}',
    url: 'http://localhost:${port}',
    devPort: ${port},
}
`;

    writeFile(join(patchDir, 'patch-app-switcher.tsx'), content);
}

function generateApiDefinitionPatch(patchDir: string, spec: AppSpec): void {
    const slug = specSlug(spec);
    const tables = spec.data?.tables || [];
    if (tables.length === 0) return;

    for (const table of tables) {
        const fieldsStr = Object.entries(table.fields)
            .map(([name, def]) => {
                return `        ${name}: { type: '${def.type}', required: ${!!def.required}, description: '${def.description || capitalize(name)}' }`;
            })
            .join(',\n');

        const content = `// Save as: src/definitions/${slug}.ts
// Then add to src/definitions/index.ts:
//   export * from './${slug}';

export interface TableConfig {
    tableName: string;
    ownerField: string;
    defaultSort: { field: string; direction: 'asc' | 'desc' };
    validation: (data: Record<string, unknown>) => Record<string, unknown>;
    fields: Record<string, { type: string; required: boolean; description: string }>;
}

export const ${table.name}Config: TableConfig = {
    tableName: '${table.name}',
    ownerField: 'ownerId',
    defaultSort: { field: 'updatedAt', direction: 'desc' },
    validation: (data) => {
${Object.entries(table.fields)
    .filter(([, def]) => def.required)
    .map(([name]) => `        if (!data.${name}) throw new Error('${capitalize(name)} is required');`)
    .join('\n')}
        return data;
    },
    fields: {
        id: { type: 'string', required: true, description: 'Unique identifier' },
${fieldsStr},
        createdAt: { type: 'string', required: true, description: 'ISO date string' },
        updatedAt: { type: 'string', required: true, description: 'ISO date string' },
    }
};
`;

        writeFile(join(patchDir, `patch-api-definition-${table.name}.ts`), content);
    }
}

function generateApiRoutePatch(patchDir: string, spec: AppSpec): void {
    const slug = specSlug(spec);
    const tables = spec.data?.tables || [];
    if (tables.length === 0) return;

    for (const table of tables) {
        // Collection route (List + Create) — self-contained handlers
        const collectionRoute = `// Save as: src/app/api/v1/${table.name}/route.ts

import { NextResponse } from 'next/server';
import { ${table.name}Config } from '@/definitions/${slug}';

export const dynamic = 'force-dynamic';

// GET /api/v1/${table.name} - List all ${table.name}
export async function GET(request: Request) {
    // TODO: Implement list handler using your database client
    return NextResponse.json({ data: [], message: 'List endpoint - implement with your DB' });
}

// POST /api/v1/${table.name} - Create a new entry
export async function POST(request: Request) {
    const body = await request.json();
    const validated = ${table.name}Config.validation(body);
    // TODO: Implement create handler using your database client
    return NextResponse.json({ data: validated, message: 'Create endpoint - implement with your DB' }, { status: 201 });
}
`;

        writeFile(
            join(patchDir, `patch-api-route-${table.name}-collection.ts`),
            collectionRoute
        );

        // Individual route (Get + Update + Delete) — self-contained handlers
        const individualRoute = `// Save as: src/app/api/v1/${table.name}/[id]/route.ts

import { NextResponse } from 'next/server';
import { ${table.name}Config } from '@/definitions/${slug}';

export const dynamic = 'force-dynamic';

// GET /api/v1/${table.name}/:id - Get a specific entry
export async function GET(request: Request, { params }: { params: { id: string } }) {
    const { id } = params;
    // TODO: Implement get handler using your database client
    return NextResponse.json({ data: null, message: 'Get endpoint - implement with your DB' });
}

// PATCH /api/v1/${table.name}/:id - Update an entry
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
    const { id } = params;
    const body = await request.json();
    // TODO: Implement update handler using your database client
    return NextResponse.json({ data: body, message: 'Update endpoint - implement with your DB' });
}

// DELETE /api/v1/${table.name}/:id - Delete an entry
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
    const { id } = params;
    // TODO: Implement delete handler using your database client
    return NextResponse.json({ message: 'Deleted' });
}
`;

        writeFile(
            join(patchDir, `patch-api-route-${table.name}-individual.ts`),
            individualRoute
        );
    }
}

function generateStartAllPatch(patchDir: string, spec: AppSpec): void {
    const slug = specSlug(spec);
    const port = specPort(spec);

    const content = `# Add this line to scripts/start-all.sh
# Find the section where apps are started and add:

start_project "${slug}" ${port}
`;

    writeFile(join(patchDir, 'patch-start-all.sh'), content);
}

function generateApplyInstructions(patchDir: string, spec: AppSpec): void {
    const slug = specSlug(spec);
    const port = specPort(spec);
    const pkgManager = spec.stack.packageManager || 'pnpm';
    const tables = spec.data?.tables || [];

    const content = `# How to Apply Patches for ${spec.appName}

These patches integrate the new app into your project.
Apply them in order after copying the app to \`apps/${slug}/\`.

## Step 1: Copy App
\`\`\`bash
cp -r output/${slug}/ /path/to/your-project/apps/${slug}/
# Remove the patches directory from the copied app
rm -rf /path/to/your-project/apps/${slug}/patches/
\`\`\`

## Step 2: Register in apps.json
Add the contents of \`patch-apps-json.json\` to the \`apps\` array in the root \`apps.json\`.

## Step 3: Register in App Switcher
Apply the entry from \`patch-app-switcher.tsx\` to your app-switcher component.

${tables.length > 0 ? `## Step 4: Create API Definitions
${tables.map(t => `- Copy \`patch-api-definition-${t.name}.ts\` → \`src/definitions/${slug}.ts\`
- Add \`export * from './${slug}';\` to \`src/definitions/index.ts\``).join('\n')}

## Step 5: Create API Routes
${tables.map(t => `- Copy \`patch-api-route-${t.name}-collection.ts\` → \`src/app/api/v1/${t.name}/route.ts\`
- Copy \`patch-api-route-${t.name}-individual.ts\` → \`src/app/api/v1/${t.name}/[id]/route.ts\``).join('\n')}

## Step 6: Register in start-all.sh` : `## Step 4: Register in start-all.sh`}
Add the line from \`patch-start-all.sh\` to your project's startup script.

## Install & Build
\`\`\`bash
cd /path/to/your-project
${pkgManager} install
${pkgManager} build
\`\`\`

## Create .env.local
\`\`\`bash
cd apps/${slug}
cp .env.example .env.local
# Fill in your database credentials and secrets
\`\`\`

## Verify
\`\`\`bash
${pkgManager} dev
# Visit http://localhost:${port}
\`\`\`
`;

    writeFile(join(patchDir, 'APPLY.md'), content);
}
