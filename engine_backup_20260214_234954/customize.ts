/**
 * Customize engine — rewrites template files based on the app spec.
 *
 * Takes a scaffolded app directory and replaces all placeholder values
 * with spec-specific content.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { AppSpec, TableDefinition } from './types.ts';
import { slugify, specSlug, specPort, specRegion } from './types.ts';
import { writeFile, slugToPascalCase, capitalize, log } from './utils.ts';
import { getActiveProject, getActiveBridgeConfig } from './projects.ts';

/**
 * Apply all customizations to a scaffolded app.
 *
 * @param outputDir - Path to the scaffolded output directory
 * @param spec - The parsed app spec
 */
export function customizeApp(outputDir: string, spec: AppSpec): void {
    const slug = specSlug(spec);

    log('→', 'Customizing package.json...');
    customizePackageJson(outputDir, spec);

    log('→', 'Customizing app.config.json...');
    customizeAppConfig(outputDir, spec);

    log('→', 'Customizing .env.example...');
    customizeEnvExample(outputDir, spec);

    log('→', 'Customizing next.config.ts...');
    customizeNextConfig(outputDir, spec);

    log('→', 'Customizing middleware.ts...');
    customizeMiddleware(outputDir, spec);

    log('→', 'Customizing layout.tsx...');
    customizeLayout(outputDir, spec);

    log('→', 'Customizing globals.css...');
    customizeGlobalsCss(outputDir, spec);

    log('→', 'Customizing page.tsx (home)...');
    customizeHomePage(outputDir, spec);

    log('→', 'Generating HomeClient.tsx...');
    generateHomeClient(outputDir, spec);

    log('→', 'Generating api-client.ts...');
    generateApiClient(outputDir, spec);

    log('→', 'Generating types.ts...');
    generateTypes(outputDir, spec);

    log('→', 'Generating deploy.sh...');
    generateDeployScript(outputDir, spec);

    log('✓', `Customization complete for ${slug}`);
}

function customizePackageJson(outputDir: string, spec: AppSpec): void {
    const pkgPath = join(outputDir, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const slug = specSlug(spec);
    const port = specPort(spec);

    // Use namespace from bridge config if available
    let namespace = '';
    try {
        const bridge = getActiveBridgeConfig();
        namespace = bridge.namespace || '';
    } catch { /* no active project */ }

    pkg.name = namespace ? `${namespace}/${slug}` : slug;
    pkg.scripts.dev = `NODE_OPTIONS='--inspect --no-deprecation' next dev -p ${port}`;
    pkg.scripts.start = `next start -p ${port}`;

    writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

function customizeAppConfig(outputDir: string, spec: AppSpec): void {
    const slug = specSlug(spec);
    const port = specPort(spec);
    const region = specRegion(spec);
    const firstTable = spec.data?.tables?.[0]?.name || 'items';

    // Read projectId from bridge config
    let projectId = '';
    try {
        const bridge = getActiveBridgeConfig();
        projectId = bridge.projectId || '';
    } catch { /* no active project */ }

    const config: any = {
        metadata: {
            name: spec.appName,
            slug,
            description: spec.description,
        },
        stack: {
            framework: spec.stack.framework,
            database: spec.stack.database || 'none',
            cloud: spec.stack.cloud || 'none',
        },
        deployment: {
            projectId: projectId || 'your-project-id',
            serviceName: `${slug}-platform`,
            region,
            port,
        },
        routes: {
            public: ['/api/public/*', '/embed/*'],
            protected: ['/dashboard/*', `/${firstTable}/*`, '/settings/*'],
        },
    };

    if (spec.data?.tables) {
        config.data = {
            tables: spec.data.tables.map(t => t.name),
        };
    }

    writeFile(join(outputDir, 'app.config.json'), JSON.stringify(config, null, 4) + '\n');
}

function customizeEnvExample(outputDir: string, spec: AppSpec): void {
    const port = specPort(spec);

    // Read projectId from bridge config
    let projectId = '';
    try {
        const bridge = getActiveBridgeConfig();
        projectId = bridge.projectId || '';
    } catch { /* no active project */ }

    let content = `# ${spec.appName} - Environment Variables
# Copy this to .env.local and fill in values

# Project
PROJECT_ID=${projectId || 'your-project-id'}
`;

    if (spec.stack.database && spec.stack.database !== 'none') {
        content += `
# Database (${spec.stack.database})
DATABASE_URL=your-database-url
`;
    }

    content += `
# Auth
NEXTAUTH_SECRET=generate-a-random-secret-here
NEXTAUTH_URL=http://localhost:${port}
`;

    if (spec.auth?.provider === 'firebase') {
        content += `
# Firebase
FIREBASE_PROJECT_ID=\${PROJECT_ID}
GOOGLE_APPLICATION_CREDENTIALS=./creds/serviceAccountKey.json
`;
    }

    if (spec.auth?.methods?.google) {
        content += `
# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
`;
    }

    if (spec.auth?.methods?.github) {
        content += `
# GitHub OAuth
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
`;
    }

    content += `
# API (set to your API server URL)
API_URL=http://localhost:3011
NEXT_PUBLIC_API_URL=http://localhost:3011
`;

    writeFile(join(outputDir, '.env.example'), content);
}

function customizeNextConfig(outputDir: string, spec: AppSpec): void {
    const configPath = join(outputDir, 'next.config.ts');
    if (!existsSync(configPath)) return;

    let content = readFileSync(configPath, 'utf-8');

    // No port-specific changes needed in next.config.ts (port is in package.json scripts)
    // The file already has the correct structure from the starter template

    writeFile(configPath, content);
}

function customizeMiddleware(outputDir: string, spec: AppSpec): void {
    const publicRoutes = [
        "'/'",
        "'/api/public/*'",
        "'/api/health'",
    ];

    const content = `import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

const publicRoutes = [
    ${publicRoutes.join(',\n    ')},
];

function isPublic(pathname: string) {
    return publicRoutes.some(r => {
        if (r.endsWith('/*')) return pathname.startsWith(r.slice(0, -2));
        return pathname === r;
    });
}

export default async function middleware(request: NextRequest) {
    if (isPublic(request.nextUrl.pathname)) return NextResponse.next();

    const token = await getToken({ req: request });
    if (!token) {
        return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
`;

    writeFile(join(outputDir, 'middleware.ts'), content);
}

function customizeLayout(outputDir: string, spec: AppSpec): void {
    const layoutPath = join(outputDir, 'src', 'app', 'layout.tsx');
    if (!existsSync(layoutPath)) return;

    let content = readFileSync(layoutPath, 'utf-8');

    // Replace title and description
    content = content.replace(/title:\s*["'].*?["']/g, `title: "${spec.appName}"`);
    content = content.replace(/description:\s*["'].*?["']/g, `description: "${spec.description}"`);

    writeFile(layoutPath, content);
}

function customizeGlobalsCss(outputDir: string, spec: AppSpec): void {
    const cssPath = join(outputDir, 'src', 'app', 'globals.css');
    if (!existsSync(cssPath)) return;

    let content = readFileSync(cssPath, 'utf-8');

    // Add font imports if specified
    if (spec.frontend?.fonts?.length) {
        const fontImports = spec.frontend.fonts
            .map(f => `@import url('https://fonts.googleapis.com/css2?family=${f.replace(/ /g, '+')}&display=swap');`)
            .join('\n');
        content = fontImports + '\n\n' + content;
    }

    writeFile(cssPath, content);
}

function customizeHomePage(outputDir: string, spec: AppSpec): void {
    const content = `import { getServerSession } from 'next-auth';
import HomeClient from '@/components/HomeClient';

export default async function Home() {
    const session = await getServerSession();
    return <HomeClient initialUser={session?.user ?? null} />;
}
`;

    writeFile(join(outputDir, 'src', 'app', 'page.tsx'), content);
}

function generateHomeClient(outputDir: string, spec: AppSpec): void {
    const heroTitle = spec.appName;
    const heroSubtitle = spec.description;

    const content = `'use client';

import { useRouter } from 'next/navigation';

interface HomeClientProps {
    initialUser: { name?: string; email?: string } | null;
}

export default function HomeClient({ initialUser }: HomeClientProps) {
    const router = useRouter();

    return (
        <div>
            <section style={{textAlign:'center',padding:'4rem 2rem'}}>
                <h1>${heroTitle.replace(/'/g, "\\'")}</h1>
                <p>${heroSubtitle.replace(/'/g, "\\'")}</p>
                <button onClick={() => router.push(initialUser ? '/dashboard' : '/login')}>
                    {initialUser ? 'View Dashboard' : 'Get Started'}
                </button>
            </section>
        </div>
    );
}
`;

    writeFile(join(outputDir, 'src', 'components', 'HomeClient.tsx'), content);
}

function generateApiClient(outputDir: string, spec: AppSpec): void {
    const table = spec.data?.tables?.[0];
    if (!table) return;

    const pascalName = slugToPascalCase(table.name);
    const tableName = table.name;

    const content = `/**
 * API client for ${spec.appName}.
 *
 * Uses Next.js rewrites to proxy requests to the central API,
 * avoiding CORS issues. All requests use relative URLs.
 */

import type { ${pascalName} } from '@/types';

const API_BASE = '';

/**
 * List all ${tableName}.
 */
export async function list${slugToPascalCase(tableName)}(): Promise<${pascalName}[]> {
    const res = await fetch(\`\${API_BASE}/api/v1/${tableName}\`);
    const data = await res.json();
    return data.success ? data.data : data;
}

/**
 * Get a single ${tableName} entry by ID.
 */
export async function get${pascalName}(id: string): Promise<${pascalName}> {
    const res = await fetch(\`\${API_BASE}/api/v1/${tableName}/\${id}\`);
    const data = await res.json();
    return data.success ? data.data : data;
}

/**
 * Create a new ${tableName} entry.
 */
export async function create${pascalName}(payload: Partial<${pascalName}>): Promise<${pascalName}> {
    const res = await fetch(\`\${API_BASE}/api/v1/${tableName}\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const data = await res.json();
    return data.success ? data.data : data;
}

/**
 * Update an existing ${tableName} entry.
 */
export async function update${pascalName}(id: string, payload: Partial<${pascalName}>): Promise<${pascalName}> {
    const res = await fetch(\`\${API_BASE}/api/v1/${tableName}/\${id}\`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const data = await res.json();
    return data.success ? data.data : data;
}

/**
 * Delete a ${tableName} entry.
 */
export async function delete${pascalName}(id: string): Promise<void> {
    await fetch(\`\${API_BASE}/api/v1/${tableName}/\${id}\`, {
        method: 'DELETE',
    });
}
`;

    writeFile(join(outputDir, 'src', 'lib', 'api-client.ts'), content);
}

function generateTypes(outputDir: string, spec: AppSpec): void {
    const tables = spec.data?.tables || [];
    const typeBlocks = tables.map(table => {
        const pascalName = slugToPascalCase(table.name);
        const fieldLines = Object.entries(table.fields).map(([name, def]) => {
            let tsType: string;
            switch (def.type) {
                case 'array': tsType = 'unknown[]'; break;
                case 'object': tsType = 'Record<string, unknown>'; break;
                case 'datetime': tsType = 'string'; break;
                default: tsType = def.type;
            }
            const optional = def.required ? '' : '?';
            const comment = def.description ? ` /** ${def.description} */\n    ` : '';
            return `    ${comment}${name}${optional}: ${tsType};`;
        });

        // Add standard fields
        fieldLines.unshift(
            '    id: string;',
        );

        return `export interface ${pascalName} {\n${fieldLines.join('\n')}\n}`;
    });

    const content = `/**
 * Type definitions for ${spec.appName}.
 * Auto-generated by Factory engine.
 */

${typeBlocks.join('\n\n')}
`;

    writeFile(join(outputDir, 'src', 'types', 'index.ts'), content);
    // Also write the legacy types.ts location
    writeFile(join(outputDir, 'src', 'lib', 'types.ts'), content);
}

function generateDeployScript(outputDir: string, spec: AppSpec): void {
    const slug = specSlug(spec);
    const region = specRegion(spec);
    const cloud = spec.stack.cloud || 'none';

    // Read projectId from bridge config
    let projectId = '';
    try {
        const bridge = getActiveBridgeConfig();
        projectId = bridge.projectId || '';
    } catch { /* no active project */ }

    const cloudTarget = cloud === 'gcp' ? 'Cloud Run'
        : cloud === 'aws' ? 'AWS'
        : cloud === 'vercel' ? 'Vercel'
        : 'Cloud';

    const content = `#!/bin/bash
# Deploy ${spec.appName} to ${cloudTarget}
set -e

# Resolve project root
SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

APP_NAME="${slug}"
PROJECT_ID="${projectId || 'your-project-id'}"
REGION="${region}"
SERVICE_NAME="${slug}-platform"
IMAGE="gcr.io/$PROJECT_ID/$SERVICE_NAME"

echo "🚀 Deploying $APP_NAME..."

# Build Docker image
docker build \\
    --platform linux/amd64 \\
    -t "$IMAGE" \\
    -f "$SCRIPT_DIR/Dockerfile" \\
    "$PROJECT_ROOT"

# Push to registry
docker push "$IMAGE"

# Deploy to ${cloudTarget}
gcloud run deploy "$SERVICE_NAME" \\
    --image "$IMAGE" \\
    --project "$PROJECT_ID" \\
    --region "$REGION" \\
    --platform managed \\
    --allow-unauthenticated \\
    --port 8080

echo "✅ Deployed $APP_NAME"
`;

    writeFile(join(outputDir, 'deploy.sh'), content);
}
