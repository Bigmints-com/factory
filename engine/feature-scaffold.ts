/**
 * Feature scaffold — generates feature files (pages, repository, types, server actions)
 * for an existing app based on a FeatureSpec.
 */
import type { FeatureSpec, FeaturePage, FeatureModel, FeatureBuildReport, FieldDefinition } from './types.js';
import { PATHS, log, timestamp, writeFile, ensureDir } from './utils.js';
import { resolve, dirname } from 'node:path';
import { readdirSync } from 'node:fs';

// ─── Utility helpers ─────────────────────────────────────

/** Convert slug to PascalCase: "recurring-schedule" → "RecurringSchedule" */
function slugToPascal(slug: string): string {
    return slug.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}

/** Convert slug to camelCase: "recurring-schedule" → "recurringSchedule" */
function slugToCamel(slug: string): string {
    const pascal = slugToPascal(slug);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/** Map field type to TypeScript type */
function tsType(f: FieldDefinition): string {
    const map: Record<string, string> = {
        string: 'string',
        number: 'number',
        boolean: 'boolean',
        array: 'unknown[]',
        object: 'Record<string, unknown>',
    };
    return map[f.type] || 'unknown';
}

// ─── Template generators ─────────────────────────────────

function generateTypes(model: FeatureModel): string {
    const name = slugToPascal(model.name);
    const fields = Object.entries(model.fields)
        .map(([key, def]) => {
            const optional = def.required ? '' : '?';
            const comment = def.description ? `    /** ${def.description} */\n` : '';
            return `${comment}    ${key}${optional}: ${tsType(def)};`;
        })
        .join('\n');

    return `/**
 * Auto-generated types for ${model.name}
 * Collection: ${model.collection}
 */

export interface ${name} {
    id: string;
    ownerId: string;
${fields}
    createdAt: Date;
    updatedAt: Date;
}

export type Create${name}Input = Omit<${name}, 'id' | 'createdAt' | 'updatedAt'>;
export type Update${name}Input = Partial<Omit<${name}, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>>;
`;
}

function generateRepository(model: FeatureModel): string {
    const pascal = slugToPascal(model.name);
    const camel = slugToCamel(model.name);

    const mapFields = Object.entries(model.fields)
        .map(([key, def]) => {
            if (def.default !== undefined) {
                return `    ${key}: data.${key} ?? ${JSON.stringify(def.default)},`;
            }
            return `    ${key}: data.${key},`;
        })
        .join('\n');

    return `/**
 * Auto-generated repository for ${model.name}
 * Collection: ${model.collection}
 */
import { adminDb } from '../firebaseAdmin';
import type { ${pascal}, Create${pascal}Input, Update${pascal}Input } from '@/types/${model.name}';

const collection = adminDb.collection('${model.collection}');

const mapDoc = (id: string, data: any): ${pascal} => ({
    id,
    ownerId: data.ownerId,
${mapFields}
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
});

export const create${pascal} = async (data: Create${pascal}Input): Promise<${pascal}> => {
    const docRef = collection.doc();
    const now = new Date();
    await docRef.set({ ...data, createdAt: now, updatedAt: now });
    return mapDoc(docRef.id, { ...data, createdAt: now, updatedAt: now });
};

export const list${pascal}s = async (ownerId: string): Promise<${pascal}[]> => {
    const snapshot = await collection
        .where('ownerId', '==', ownerId)
        .orderBy('createdAt', 'desc')
        .get();
    return snapshot.docs.map((doc) => mapDoc(doc.id, doc.data()));
};

export const get${pascal}ById = async (ownerId: string, id: string): Promise<${pascal} | null> => {
    const doc = await collection.doc(id).get();
    if (!doc.exists) return null;
    const data = doc.data();
    if (data?.ownerId !== ownerId) return null;
    return mapDoc(doc.id, data);
};

export const update${pascal} = async (id: string, data: Update${pascal}Input): Promise<void> => {
    const now = new Date();
    await collection.doc(id).update({ ...data, updatedAt: now });
};

export const delete${pascal} = async (id: string): Promise<void> => {
    await collection.doc(id).delete();
};
`;
}

function generateServerActions(spec: FeatureSpec): string {
    const pascal = slugToPascal(spec.model.name);
    const camel = slugToCamel(spec.model.name);
    const repoFile = spec.model.name;

    return `'use server';

/**
 * Auto-generated server actions for ${spec.feature.name}
 */
import { getUser } from '@saveaday/shared-auth/server';
import { redirect } from 'next/navigation';
import {
    create${pascal},
    update${pascal},
    delete${pascal},
} from '@/lib/repositories/${repoFile}Repository';

export async function create${pascal}Action(formData: FormData) {
    const user = await getUser();
    if (!user?.uid) redirect('/login');

    const data: Record<string, unknown> = { ownerId: user.uid };
    for (const [key, value] of formData.entries()) {
        data[key] = value;
    }

    await create${pascal}(data as any);
    redirect('/dashboard/${spec.feature.slug}');
}

export async function update${pascal}Action(id: string, formData: FormData) {
    const user = await getUser();
    if (!user?.uid) redirect('/login');

    const data: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
        data[key] = value;
    }

    await update${pascal}(id, data as any);
    redirect('/dashboard/${spec.feature.slug}');
}

export async function delete${pascal}Action(id: string) {
    const user = await getUser();
    if (!user?.uid) redirect('/login');

    await delete${pascal}(id);
    redirect('/dashboard/${spec.feature.slug}');
}
`;
}

function generateListPage(spec: FeatureSpec, page: FeaturePage): string {
    const pascal = slugToPascal(spec.model.name);
    const clientName = `${slugToPascal(spec.feature.slug)}ListClient`;

    return `import { getUser } from '@saveaday/shared-auth/server';
import { redirect } from 'next/navigation';
import { list${pascal}s } from '@/lib/repositories/${spec.model.name}Repository';
import { ${clientName} } from './client';

export default async function ${slugToPascal(spec.feature.slug)}Page() {
    const user = await getUser();
    if (!user?.uid) redirect('/login');

    const items = await list${pascal}s(user.uid);

    return <${clientName} items={items} />;
}
`;
}

function generateListClient(spec: FeatureSpec, page: FeaturePage): string {
    const pascal = slugToPascal(spec.model.name);
    const clientName = `${slugToPascal(spec.feature.slug)}ListClient`;
    const icon = spec.feature.icon || 'List';

    return `'use client';

import type { ${pascal} } from '@/types/${spec.model.name}';
import Link from 'next/link';
import {
    Button,
    Card,
    EmptyState,
    Icon,
    PageHeader,
    Text,
} from '@saveaday/shared-ui';

interface ${clientName}Props {
    items: ${pascal}[];
}

export function ${clientName}({ items }: ${clientName}Props) {
    return (
        <div className="space-y-6">
            <PageHeader
                title="${page.title}"
                description="${spec.feature.description}"
            >
                <Button asChild>
                    <Link href="/dashboard/${spec.feature.slug}/new">
                        Create new
                    </Link>
                </Button>
            </PageHeader>

            {items.length === 0 ? (
                <EmptyState
                    icon={<Icon name="${icon.toLowerCase()}" size="lg" />}
                    title="No ${spec.feature.name.toLowerCase()} yet"
                    description="Get started by creating your first ${spec.feature.name.toLowerCase()}."
                    action={
                        <Button asChild>
                            <Link href="/dashboard/${spec.feature.slug}/new">
                                Create new
                            </Link>
                        </Button>
                    }
                    variant="bordered"
                    size="lg"
                />
            ) : (
                <Card padding="md" className="space-y-4">
                    <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                        {items.map((item) => (
                            <Link
                                key={item.id}
                                href={\`/dashboard/${spec.feature.slug}/\${item.id}\`}
                                className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                            >
                                <div>
                                    <Text weight="medium">{item.id}</Text>
                                    <Text size="sm" color="muted">
                                        Created: {item.createdAt.toLocaleDateString()}
                                    </Text>
                                </div>
                                <Icon name="chevron-right" />
                            </Link>
                        ))}
                    </div>
                </Card>
            )}
        </div>
    );
}
`;
}

function generateFormPage(spec: FeatureSpec, page: FeaturePage): string {
    const pascal = slugToPascal(spec.model.name);
    const actionName = `create${pascal}Action`;
    const fields = Object.entries(spec.model.fields);

    const formFields = fields
        .map(([key, def]) => {
            const inputType = def.type === 'number' ? 'number' : def.type === 'boolean' ? 'checkbox' : 'text';
            return `                    <div className="space-y-2">
                        <Label htmlFor="${key}">${key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')}</Label>
                        <Input
                            id="${key}"
                            name="${key}"
                            type="${inputType}"
                            ${def.required ? 'required' : ''}
                            ${def.default !== undefined ? `defaultValue="${def.default}"` : ''}
                            placeholder="${def.description || key}"
                        />
                    </div>`;
        })
        .join('\n');

    return `import { getUser } from '@saveaday/shared-auth/server';
import { redirect } from 'next/navigation';
import { ${actionName} } from '@/lib/actions/${spec.feature.slug}Actions';
import { Button, Card, Input, Label, PageHeader, Title, Text } from '@saveaday/shared-ui';
import Link from 'next/link';

export default async function New${slugToPascal(spec.feature.slug)}Page() {
    const user = await getUser();
    if (!user?.uid) redirect('/login');

    return (
        <div className="space-y-6">
            <PageHeader title="${page.title}" description="Fill in the details below.">
                <Button variant="outline" asChild>
                    <Link href="/dashboard/${spec.feature.slug}">Back</Link>
                </Button>
            </PageHeader>

            <Card padding="md" className="space-y-6">
                <div>
                    <Title as="h2" size="lg">${page.title}</Title>
                    <Text size="sm" color="muted">${spec.feature.description}</Text>
                </div>

                <form action={${actionName}} className="space-y-5">
${formFields}
                    <div className="flex justify-end gap-3">
                        <Button variant="outline" asChild>
                            <Link href="/dashboard/${spec.feature.slug}">Cancel</Link>
                        </Button>
                        <Button type="submit">Create</Button>
                    </div>
                </form>
            </Card>
        </div>
    );
}
`;
}

function generateDetailPage(spec: FeatureSpec, page: FeaturePage): string {
    const pascal = slugToPascal(spec.model.name);
    const fields = Object.entries(spec.model.fields);

    const fieldDisplay = fields
        .map(([key]) => {
            const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
            return `                        <div>
                            <Text size="sm" color="muted">${label}</Text>
                            <Text weight="medium">{String(item.${key} ?? '—')}</Text>
                        </div>`;
        })
        .join('\n');

    return `import { getUser } from '@saveaday/shared-auth/server';
import { redirect, notFound } from 'next/navigation';
import { get${pascal}ById, delete${pascal} } from '@/lib/repositories/${spec.model.name}Repository';
import { Button, Card, PageHeader, Text, Title } from '@saveaday/shared-ui';
import Link from 'next/link';
import { delete${pascal}Action } from '@/lib/actions/${spec.feature.slug}Actions';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function ${slugToPascal(spec.feature.slug)}DetailPage({ params }: PageProps) {
    const user = await getUser();
    if (!user?.uid) redirect('/login');

    const { id } = await params;
    const item = await get${pascal}ById(user.uid, id);
    if (!item) notFound();

    return (
        <div className="space-y-6">
            <PageHeader title="${page.title}" description="${spec.feature.name} details">
                <div className="flex gap-2">
                    <Button variant="outline" asChild>
                        <Link href="/dashboard/${spec.feature.slug}">Back</Link>
                    </Button>
                    <form action={delete${pascal}Action.bind(null, id)}>
                        <Button variant="destructive" type="submit">Delete</Button>
                    </form>
                </div>
            </PageHeader>

            <Card padding="md" className="space-y-4">
                <Title as="h2" size="lg">${spec.feature.name}</Title>
                <div className="grid gap-4 md:grid-cols-2">
${fieldDisplay}
                </div>
                <div className="pt-4 border-t">
                    <Text size="sm" color="muted">
                        Created: {item.createdAt.toLocaleDateString()} · Updated: {item.updatedAt.toLocaleDateString()}
                    </Text>
                </div>
            </Card>
        </div>
    );
}
`;
}

// ─── Main scaffold function ──────────────────────────────

/**
 * Generate all feature files into the output directory.
 * Output goes to: output/<app-slug>/features/<feature-slug>/
 */
export function scaffoldFeature(spec: FeatureSpec): { outputDir: string; files: string[] } {
    const outputDir = resolve(PATHS.output, spec.target.app, 'features', spec.feature.slug);
    ensureDir(outputDir);

    const files: string[] = [];

    // 1. Types
    const typesPath = resolve(outputDir, 'types', `${spec.model.name}.ts`);
    ensureDir(dirname(typesPath));
    writeFile(typesPath, generateTypes(spec.model));
    files.push(`types/${spec.model.name}.ts`);
    log('✓', `Generated types/${spec.model.name}.ts`);

    // 2. Repository
    const repoPath = resolve(outputDir, 'lib', 'repositories', `${spec.model.name}Repository.ts`);
    ensureDir(dirname(repoPath));
    writeFile(repoPath, generateRepository(spec.model));
    files.push(`lib/repositories/${spec.model.name}Repository.ts`);
    log('✓', `Generated lib/repositories/${spec.model.name}Repository.ts`);

    // 3. Server Actions
    const actionsPath = resolve(outputDir, 'lib', 'actions', `${spec.feature.slug}Actions.ts`);
    ensureDir(dirname(actionsPath));
    writeFile(actionsPath, generateServerActions(spec));
    files.push(`lib/actions/${spec.feature.slug}Actions.ts`);
    log('✓', `Generated lib/actions/${spec.feature.slug}Actions.ts`);

    // 4. Pages
    for (const page of spec.pages) {
        // Convert route to filesystem path: /dashboard/recurring → app/(dashboard)/recurring/
        const routeDir = page.route
            .replace('/dashboard/', 'app/(dashboard)/')
            .replace(/^\//, 'app/');
        const pageDir = resolve(outputDir, routeDir);
        ensureDir(pageDir);

        let pageContent: string;
        switch (page.type) {
            case 'list':
                pageContent = generateListPage(spec, page);
                writeFile(resolve(pageDir, 'page.tsx'), pageContent);
                files.push(`${routeDir}/page.tsx`);

                // Also generate client component for list view
                const clientContent = generateListClient(spec, page);
                writeFile(resolve(pageDir, 'client.tsx'), clientContent);
                files.push(`${routeDir}/client.tsx`);
                log('✓', `Generated ${routeDir}/page.tsx + client.tsx`);
                break;

            case 'form':
                pageContent = generateFormPage(spec, page);
                writeFile(resolve(pageDir, 'page.tsx'), pageContent);
                files.push(`${routeDir}/page.tsx`);
                log('✓', `Generated ${routeDir}/page.tsx (form)`);
                break;

            case 'detail':
                pageContent = generateDetailPage(spec, page);
                writeFile(resolve(pageDir, 'page.tsx'), pageContent);
                files.push(`${routeDir}/page.tsx`);
                log('✓', `Generated ${routeDir}/page.tsx (detail)`);
                break;

            case 'custom':
                // Generate a minimal placeholder
                const customContent = `import { getUser } from '@saveaday/shared-auth/server';
import { redirect } from 'next/navigation';

export default async function ${slugToPascal(spec.feature.slug)}CustomPage() {
    const user = await getUser();
    if (!user?.uid) redirect('/login');

    return (
        <div className="space-y-6">
            <h1>${page.title}</h1>
            <p>Custom implementation needed.</p>
        </div>
    );
}
`;
                writeFile(resolve(pageDir, 'page.tsx'), customContent);
                files.push(`${routeDir}/page.tsx`);
                log('✓', `Generated ${routeDir}/page.tsx (custom placeholder)`);
                break;
        }
    }

    // 5. Generate APPLY.md instructions
    const applyContent = generateApplyInstructions(spec, files);
    writeFile(resolve(outputDir, 'APPLY.md'), applyContent);
    files.push('APPLY.md');
    log('✓', 'Generated APPLY.md');

    return { outputDir, files };
}

/**
 * Generate instructions for applying the feature to the target app.
 */
function generateApplyInstructions(spec: FeatureSpec, files: string[]): string {
    const pascal = slugToPascal(spec.model.name);
    const targetApp = spec.target.app;

    return `# Apply: ${spec.feature.name}

**Target app:** \`apps/${targetApp}/\`
**Feature:** ${spec.feature.name} (\`${spec.feature.slug}\`)

## Step 1: Copy generated files

\`\`\`bash
# Types
cp types/${spec.model.name}.ts ../../apps/${targetApp}/src/types/

# Repository
cp lib/repositories/${spec.model.name}Repository.ts ../../apps/${targetApp}/src/lib/repositories/

# Server Actions
cp lib/actions/${spec.feature.slug}Actions.ts ../../apps/${targetApp}/src/lib/actions/

# Pages
cp -r app/ ../../apps/${targetApp}/src/app/
\`\`\`

## Step 2: Add navigation item

${spec.navigation ? `Add to sidebar navigation for \`${targetApp}\`:

\`\`\`json
{
    "title": "${spec.navigation.label}",
    "url": "/dashboard/${spec.feature.slug}",
    "icon": "${spec.navigation.icon || 'list'}"
}
\`\`\`` : 'No navigation changes specified.'}

## Step 3: Verify

\`\`\`bash
cd /path/to/your-project
pnpm build --filter @saveaday/${targetApp}
pnpm dev --filter @saveaday/${targetApp}
\`\`\`

Then visit \`/dashboard/${spec.feature.slug}\` in the app.

## Generated Files

${files.map(f => `- \`${f}\``).join('\n')}
`;
}

/**
 * Generate a feature build report (Markdown).
 */
export function generateFeatureReport(spec: FeatureSpec, files: string[]): FeatureBuildReport {
    const report: FeatureBuildReport = {
        targetApp: spec.target.app,
        feature: spec.feature.name,
        slug: spec.feature.slug,
        timestamp: timestamp(),
        filesGenerated: files,
        patchesGenerated: [],
        validation: { passed: true, checks: [] },
        nextSteps: [
            `Copy generated files from output/${spec.target.app}/features/${spec.feature.slug}/ into apps/${spec.target.app}/src/`,
            'Follow instructions in APPLY.md',
            `Run pnpm build --filter @saveaday/${spec.target.app}`,
            `Visit /dashboard/${spec.feature.slug} in the running app`,
        ],
    };

    // Write markdown report
    const md = formatFeatureReport(report, spec);
    const reportPath = resolve(PATHS.reports, `feature-${spec.feature.slug}-${Date.now()}.md`);
    ensureDir(dirname(reportPath));
    writeFile(reportPath, md);
    log('✓', `Report written to ${reportPath}`);

    return report;
}

function formatFeatureReport(report: FeatureBuildReport, spec: FeatureSpec): string {
    return `# Feature Build Report: ${spec.feature.name}

**Target app:** \`${spec.target.app}\`
**Slug:** \`${spec.feature.slug}\`
**Generated:** ${report.timestamp}
**Status:** ✅ Feature generated successfully

---

## Feature Summary

| Property | Value |
|---|---|
| Name | ${spec.feature.name} |
| Slug | ${spec.feature.slug} |
| Description | ${spec.feature.description} |
| Target App | ${spec.target.app} |
| Pages | ${spec.pages.length} |
| Model | ${spec.model.name} (${spec.model.collection}) |
| Fields | ${Object.keys(spec.model.fields).length} |

---

## Generated Files

${report.filesGenerated.map(f => `- \`${f}\``).join('\n')}

---

## Next Steps

${report.nextSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}
`;
}
