/**
 * Feature scaffold — generates feature files (pages, repository, types, server actions)
 * for an existing app based on a FeatureSpec.
 */
import type { FeatureSpec, FeaturePage, FeatureModel, FeatureBuildReport, FieldDefinition } from './types.ts';
import { PATHS, log, timestamp, writeFile, ensureDir, slugToPascalCase as slugToPascal, slugToCamelCase as slugToCamel } from './utils.ts';
import { resolve, dirname } from 'node:path';
import { readdirSync } from 'node:fs';

// slugToPascal and slugToCamel are imported from utils.ts

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
 *
 * TODO: Replace this stub with your actual database adapter.
 * The interface below works as an in-memory store for prototyping.
 */
import type { ${pascal}, Create${pascal}Input, Update${pascal}Input } from '@/types/${model.name}';

// In-memory store — replace with your database client
let store: Map<string, ${pascal}> = new Map();
let counter = 0;

export const create${pascal} = async (data: Create${pascal}Input): Promise<${pascal}> => {
    const id = String(++counter);
    const now = new Date();
    const item: ${pascal} = {
        id,
${mapFields}
        createdAt: now,
        updatedAt: now,
    };
    store.set(id, item);
    return item;
};

export const list${pascal}s = async (ownerId: string): Promise<${pascal}[]> => {
    return Array.from(store.values()).filter(i => i.ownerId === ownerId);
};

export const get${pascal}ById = async (ownerId: string, id: string): Promise<${pascal} | null> => {
    const item = store.get(id);
    if (!item || item.ownerId !== ownerId) return null;
    return item;
};

export const update${pascal} = async (id: string, data: Update${pascal}Input): Promise<void> => {
    const item = store.get(id);
    if (!item) return;
    store.set(id, { ...item, ...data, updatedAt: new Date() });
};

export const delete${pascal} = async (id: string): Promise<void> => {
    store.delete(id);
};
`;
}

function generateServerActions(spec: FeatureSpec): string {
    const pascal = slugToPascal(spec.model.name);
    const repoFile = spec.model.name;

    return `'use server';

/**
 * Auto-generated server actions for ${spec.feature.name}
 */
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import {
    create${pascal},
    update${pascal},
    delete${pascal},
} from '@/lib/repositories/${repoFile}Repository';

async function requireUser() {
    const session = await getServerSession();
    if (!session?.user) redirect('/login');
    return session.user;
}

export async function create${pascal}Action(formData: FormData) {
    const user = await requireUser();

    const data: Record<string, unknown> = { ownerId: (user as any).id || user.email };
    for (const [key, value] of formData.entries()) {
        data[key] = value;
    }

    await create${pascal}(data as any);
    redirect('/dashboard/${spec.feature.slug}');
}

export async function update${pascal}Action(id: string, formData: FormData) {
    await requireUser();

    const data: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
        data[key] = value;
    }

    await update${pascal}(id, data as any);
    redirect('/dashboard/${spec.feature.slug}');
}

export async function delete${pascal}Action(id: string) {
    await requireUser();

    await delete${pascal}(id);
    redirect('/dashboard/${spec.feature.slug}');
}
`;
}

function generateListPage(spec: FeatureSpec, page: FeaturePage): string {
    const pascal = slugToPascal(spec.model.name);
    const clientName = `${slugToPascal(spec.feature.slug)}ListClient`;

    return `import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { list${pascal}s } from '@/lib/repositories/${spec.model.name}Repository';
import { ${clientName} } from './client';

export default async function ${slugToPascal(spec.feature.slug)}Page() {
    const session = await getServerSession();
    if (!session?.user) redirect('/login');

    const ownerId = (session.user as any).id || session.user.email || '';
    const items = await list${pascal}s(ownerId);

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

interface ${clientName}Props {
    items: ${pascal}[];
}

export function ${clientName}({ items }: ${clientName}Props) {
    return (
        <div style={{maxWidth:'800px',margin:'0 auto',padding:'2rem'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem'}}>
                <div>
                    <h1 style={{fontSize:'1.5rem',fontWeight:600}}>${page.title}</h1>
                    <p style={{color:'#666'}}>${spec.feature.description}</p>
                </div>
                <Link href="/dashboard/${spec.feature.slug}/new" style={{padding:'0.5rem 1rem',background:'#000',color:'#fff',borderRadius:'0.375rem',textDecoration:'none'}}>
                    Create new
                </Link>
            </div>

            {items.length === 0 ? (
                <div style={{textAlign:'center',padding:'3rem',border:'1px dashed #ddd',borderRadius:'0.5rem'}}>
                    <p style={{fontWeight:500}}>No ${spec.feature.name.toLowerCase()} yet</p>
                    <p style={{color:'#666',marginBottom:'1rem'}}>Get started by creating your first ${spec.feature.name.toLowerCase()}.</p>
                    <Link href="/dashboard/${spec.feature.slug}/new" style={{padding:'0.5rem 1rem',background:'#000',color:'#fff',borderRadius:'0.375rem',textDecoration:'none'}}>
                        Create new
                    </Link>
                </div>
            ) : (
                <div style={{border:'1px solid #eee',borderRadius:'0.5rem',overflow:'hidden'}}>
                    {items.map((item) => (
                        <Link
                            key={item.id}
                            href={\`/dashboard/${spec.feature.slug}/\${item.id}\`}
                            style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'1rem',borderBottom:'1px solid #f0f0f0',textDecoration:'none',color:'inherit'}}
                        >
                            <div>
                                <span style={{fontWeight:500}}>{item.id}</span>
                                <span style={{fontSize:'0.875rem',color:'#999',marginLeft:'0.5rem'}}>
                                    Created: {item.createdAt.toLocaleDateString()}
                                </span>
                            </div>
                            <span>→</span>
                        </Link>
                    ))}
                </div>
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
            return `                    <div style={{marginBottom:'1rem'}}>
                        <label htmlFor="${key}" style={{display:'block',fontWeight:500,marginBottom:'0.25rem'}}>${key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')}</label>
                        <input
                            id="${key}"
                            name="${key}"
                            type="${inputType}"
                            ${def.required ? 'required' : ''}
                            ${def.default !== undefined ? `defaultValue="${def.default}"` : ''}
                            placeholder="${def.description || key}"
                            style={{width:'100%',padding:'0.5rem',border:'1px solid #ddd',borderRadius:'0.375rem'}}
                        />
                    </div>`;
        })
        .join('\n');

    return `import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { ${actionName} } from '@/lib/actions/${spec.feature.slug}Actions';
import Link from 'next/link';

export default async function New${slugToPascal(spec.feature.slug)}Page() {
    const session = await getServerSession();
    if (!session?.user) redirect('/login');

    return (
        <div style={{maxWidth:'600px',margin:'0 auto',padding:'2rem'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem'}}>
                <h1 style={{fontSize:'1.5rem',fontWeight:600}}>${page.title}</h1>
                <Link href="/dashboard/${spec.feature.slug}" style={{padding:'0.5rem 1rem',border:'1px solid #ddd',borderRadius:'0.375rem',textDecoration:'none',color:'inherit'}}>Back</Link>
            </div>

            <form action={${actionName}} style={{display:'flex',flexDirection:'column',gap:'0.5rem'}}>
${formFields}
                <div style={{display:'flex',justifyContent:'flex-end',gap:'0.5rem',marginTop:'1rem'}}>
                    <Link href="/dashboard/${spec.feature.slug}" style={{padding:'0.5rem 1rem',border:'1px solid #ddd',borderRadius:'0.375rem',textDecoration:'none',color:'inherit'}}>Cancel</Link>
                    <button type="submit" style={{padding:'0.5rem 1rem',background:'#000',color:'#fff',borderRadius:'0.375rem',border:'none',cursor:'pointer'}}>Create</button>
                </div>
            </form>
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
                            <span style={{fontSize:'0.875rem',color:'#999'}}>${label}</span>
                            <p style={{fontWeight:500}}>{String(item.${key} ?? '—')}</p>
                        </div>`;
        })
        .join('\n');

    return `import { getServerSession } from 'next-auth';
import { redirect, notFound } from 'next/navigation';
import { get${pascal}ById } from '@/lib/repositories/${spec.model.name}Repository';
import Link from 'next/link';
import { delete${pascal}Action } from '@/lib/actions/${spec.feature.slug}Actions';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function ${slugToPascal(spec.feature.slug)}DetailPage({ params }: PageProps) {
    const session = await getServerSession();
    if (!session?.user) redirect('/login');

    const { id } = await params;
    const ownerId = (session.user as any).id || session.user.email || '';
    const item = await get${pascal}ById(ownerId, id);
    if (!item) notFound();

    return (
        <div style={{maxWidth:'600px',margin:'0 auto',padding:'2rem'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem'}}>
                <h1 style={{fontSize:'1.5rem',fontWeight:600}}>${page.title}</h1>
                <div style={{display:'flex',gap:'0.5rem'}}>
                    <Link href="/dashboard/${spec.feature.slug}" style={{padding:'0.5rem 1rem',border:'1px solid #ddd',borderRadius:'0.375rem',textDecoration:'none',color:'inherit'}}>Back</Link>
                    <form action={delete${pascal}Action.bind(null, id)}>
                        <button type="submit" style={{padding:'0.5rem 1rem',background:'#dc2626',color:'#fff',borderRadius:'0.375rem',border:'none',cursor:'pointer'}}>Delete</button>
                    </form>
                </div>
            </div>

            <div style={{border:'1px solid #eee',borderRadius:'0.5rem',padding:'1.5rem'}}>
                <h2 style={{fontSize:'1.25rem',fontWeight:600,marginBottom:'1rem'}}>${spec.feature.name}</h2>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem'}}>
${fieldDisplay}
                </div>
                <div style={{borderTop:'1px solid #eee',paddingTop:'1rem',marginTop:'1rem'}}>
                    <span style={{fontSize:'0.875rem',color:'#999'}}>
                        Created: {item.createdAt.toLocaleDateString()} · Updated: {item.updatedAt.toLocaleDateString()}
                    </span>
                </div>
            </div>
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
                const customContent = `import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

export default async function ${slugToPascal(spec.feature.slug)}CustomPage() {
    const session = await getServerSession();
    if (!session?.user) redirect('/login');

    return (
        <div style={{maxWidth:'600px',margin:'0 auto',padding:'2rem'}}>
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
# Build and run the app that contains this feature
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
            'Build the target app',
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
