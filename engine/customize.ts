/**
 * Customize engine — rewrites template files based on the app spec.
 *
 * Takes a scaffolded app directory and replaces all placeholder values
 * with spec-specific content.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { AppSpec, ResourceDefinition } from './types.ts';
import { writeFile, slugToPascalCase, capitalize, log } from './utils.ts';

/**
 * Apply all customizations to a scaffolded app.
 *
 * @param outputDir - Path to the scaffolded output directory
 * @param spec - The parsed app spec
 */
export function customizeApp(outputDir: string, spec: AppSpec): void {
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

    log('✓', `Customization complete for ${spec.metadata.slug}`);
}

function customizePackageJson(outputDir: string, spec: AppSpec): void {
    const pkgPath = join(outputDir, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

    pkg.name = `@saveaday/${spec.metadata.slug}`;
    pkg.scripts.dev = `NODE_OPTIONS='--inspect --no-deprecation' next dev -p ${spec.deployment.port}`;
    pkg.scripts.start = `next start -p ${spec.deployment.port}`;

    writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

function customizeAppConfig(outputDir: string, spec: AppSpec): void {
    const config = {
        metadata: {
            name: spec.metadata.name,
            displayName: spec.metadata.name,
            slug: spec.metadata.slug,
            description: spec.metadata.description,
            icon: spec.metadata.icon,
            color: spec.metadata.color,
            group: spec.metadata.group,
        },
        deployment: {
            projectId: 'dvizfb',
            serviceName: `${spec.metadata.slug}-platform`,
            region: spec.deployment.region,
            customDomain: spec.deployment.customDomain || `${spec.metadata.slug}.saveaday.ai`,
            port: spec.deployment.port,
        },
        firestore: {
            databaseId: spec.database.firestoreId,
            collections: spec.database.collections,
        },
        routes: {
            public: ['/api/public/*', '/embed/*'],
            protected: ['/dashboard/*', `/${spec.api.resources[0]?.collection || 'items'}/*`, '/settings/*'],
        },
    };

    writeFile(join(outputDir, 'app.config.json'), JSON.stringify(config, null, 4) + '\n');
}

function customizeEnvExample(outputDir: string, spec: AppSpec): void {
    const content = `# ${spec.metadata.name} - Environment Variables
# Copy this to .env.local and fill in values

# Firebase
FIREBASE_PROJECT_ID=dvizfb
FIRESTORE_DATABASE_ID=${spec.database.firestoreId}
GOOGLE_APPLICATION_CREDENTIALS=./creds/serviceAccountKey.json

# Auth
NEXTAUTH_SECRET=generate-a-random-secret-here
NEXTAUTH_URL=http://localhost:${spec.deployment.port}
SSO_AUTH_URL=http://localhost:3010

# API
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

    if (spec.features?.embed) {
        publicRoutes.push("'/embed/*'");
    }

    const content = `import { NextRequest } from 'next/server';
import { authMiddleware } from '@saveaday/shared-auth/middleware';

// Define public routes that don't require authentication
const publicRoutes = [
    ${publicRoutes.join(',\n    ')},
];

export default function middleware(request: NextRequest) {
    return authMiddleware(request, {
        publicRoutes,
        loginPath: '/login',
        redirectTo: '/dashboard',
    });
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
    content = content.replace(/title:\s*["'].*?["']/g, `title: "${spec.metadata.name}"`);
    content = content.replace(/description:\s*["'].*?["']/g, `description: "${spec.metadata.description}"`);

    writeFile(layoutPath, content);
}

function customizeGlobalsCss(outputDir: string, spec: AppSpec): void {
    const cssPath = join(outputDir, 'src', 'app', 'globals.css');
    if (!existsSync(cssPath)) return;

    let content = readFileSync(cssPath, 'utf-8');

    // Replace brand accent color if provided
    if (spec.metadata.brandAccent) {
        content = content.replace(
            /--color-brand-accent:\s*[^;]+;/,
            `--color-brand-accent: ${spec.metadata.brandAccent};`
        );
    }

    writeFile(cssPath, content);
}

function customizeHomePage(outputDir: string, spec: AppSpec): void {
    const content = `import { getUser } from '@saveaday/shared-auth/session';
import HomeClient from '@/components/HomeClient';

export default async function Home() {
    return <HomeClient initialUser={await getUser()} />;
}
`;

    writeFile(join(outputDir, 'src', 'app', 'page.tsx'), content);
}

function generateHomeClient(outputDir: string, spec: AppSpec): void {
    const heroTitle = spec.publicPage?.hero?.title || spec.metadata.name;
    const heroSubtitle = spec.publicPage?.hero?.subtitle || spec.metadata.description;

    const featuresArray = spec.publicPage?.features || [
        { icon: 'Zap', title: 'Fast', description: 'Built for speed' },
        { icon: 'Shield', title: 'Secure', description: 'Enterprise-grade security' },
        { icon: 'BarChart3', title: 'Analytics', description: 'Built-in analytics' },
    ];

    const faqsArray = spec.publicPage?.faqs || [
        { q: `What is ${spec.metadata.name}?`, a: spec.metadata.description },
        { q: 'How do I get started?', a: 'Sign up and follow the onboarding guide.' },
    ];

    const featuresStr = featuresArray
        .map(f => `        { icon: '${f.icon}', title: '${f.title}', description: '${f.description}' }`)
        .join(',\n');

    const faqsStr = faqsArray
        .map(f => `        { q: '${f.q.replace(/'/g, "\\'")}', a: '${f.a.replace(/'/g, "\\'")}' }`)
        .join(',\n');

    const content = `'use client';

import { PublicHomepage } from '@saveaday/shared-ui';
import { useRouter } from 'next/navigation';

interface HomeClientProps {
    initialUser: { uid: string } | null;
}

export default function HomeClient({ initialUser }: HomeClientProps) {
    const router = useRouter();

    return (
        <PublicHomepage
            appName="${spec.metadata.name}"
            brandColor="${spec.metadata.brandAccent || '#3B82F6'}"
            hero={{
                title: '${heroTitle.replace(/'/g, "\\'")}',
                subtitle: '${heroSubtitle.replace(/'/g, "\\'")}',
            }}
            features={[
${featuresStr}
            ]}
            faqs={[
${faqsStr}
            ]}
            ctaLabel={initialUser ? 'View Dashboard' : 'Get Started'}
            onCtaClick={() => router.push(initialUser ? '/dashboard' : '/login')}
        />
    );
}
`;

    writeFile(join(outputDir, 'src', 'components', 'HomeClient.tsx'), content);
}

function generateApiClient(outputDir: string, spec: AppSpec): void {
    const resource = spec.api.resources[0];
    if (!resource) return;

    const pascalName = slugToPascalCase(resource.name);
    const pluralName = resource.collection;

    const content = `/**
 * API client for ${spec.metadata.name}.
 *
 * Uses Next.js rewrites to proxy requests to the central API,
 * avoiding CORS issues. All requests use relative URLs.
 */

import type { ${pascalName} } from '@/types';

const API_BASE = '';

/**
 * List all ${pluralName}.
 */
export async function list${slugToPascalCase(pluralName)}(): Promise<${pascalName}[]> {
    const res = await fetch(\`\${API_BASE}/api/v1/${pluralName}\`);
    const data = await res.json();
    return data.success ? data.data : data;
}

/**
 * Get a single ${resource.name} by ID.
 */
export async function get${pascalName}(id: string): Promise<${pascalName}> {
    const res = await fetch(\`\${API_BASE}/api/v1/${pluralName}/\${id}\`);
    const data = await res.json();
    return data.success ? data.data : data;
}

/**
 * Create a new ${resource.name}.
 */
export async function create${pascalName}(payload: Partial<${pascalName}>): Promise<${pascalName}> {
    const res = await fetch(\`\${API_BASE}/api/v1/${pluralName}\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const data = await res.json();
    return data.success ? data.data : data;
}

/**
 * Update an existing ${resource.name}.
 */
export async function update${pascalName}(id: string, payload: Partial<${pascalName}>): Promise<${pascalName}> {
    const res = await fetch(\`\${API_BASE}/api/v1/${pluralName}/\${id}\`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const data = await res.json();
    return data.success ? data.data : data;
}

/**
 * Delete a ${resource.name}.
 */
export async function delete${pascalName}(id: string): Promise<void> {
    await fetch(\`\${API_BASE}/api/v1/${pluralName}/\${id}\`, {
        method: 'DELETE',
    });
}
`;

    writeFile(join(outputDir, 'src', 'lib', 'api-client.ts'), content);
}

function generateTypes(outputDir: string, spec: AppSpec): void {
    const typeBlocks = spec.api.resources.map(resource => {
        const pascalName = slugToPascalCase(resource.name);
        const fieldLines = Object.entries(resource.fields).map(([name, def]) => {
            const tsType = def.type === 'array' ? 'unknown[]' : def.type === 'object' ? 'Record<string, unknown>' : def.type;
            const optional = def.required ? '' : '?';
            const comment = def.description ? ` /** ${def.description} */\n    ` : '';
            return `    ${comment}${name}${optional}: ${tsType};`;
        });

        // Add standard fields
        fieldLines.unshift(
            '    id: string;',
            '    ownerId: string;',
        );
        fieldLines.push(
            '    createdAt: string;',
            '    updatedAt: string;',
        );

        return `export interface ${pascalName} {\n${fieldLines.join('\n')}\n}`;
    });

    const content = `/**
 * Type definitions for ${spec.metadata.name}.
 * Auto-generated by saveaday-factory.
 */

${typeBlocks.join('\n\n')}
`;

    writeFile(join(outputDir, 'src', 'types', 'index.ts'), content);
    // Also write the legacy types.ts location
    writeFile(join(outputDir, 'src', 'lib', 'types.ts'), content);
}

function generateDeployScript(outputDir: string, spec: AppSpec): void {
    const content = `#!/bin/bash
# Deploy ${spec.metadata.name} to Cloud Run
set -e

# Resolve project root
SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

APP_NAME="${spec.metadata.slug}"
PROJECT_ID="dvizfb"
REGION="${spec.deployment.region}"
SERVICE_NAME="${spec.metadata.slug}-platform"
IMAGE="gcr.io/$PROJECT_ID/$SERVICE_NAME"

echo "🚀 Deploying $APP_NAME..."

# Build Docker image (amd64 required for Cloud Run)
docker build \\
    --platform linux/amd64 \\
    -t "$IMAGE" \\
    -f "$SCRIPT_DIR/Dockerfile" \\
    "$PROJECT_ROOT"

# Push to GCR
docker push "$IMAGE"

# Deploy to Cloud Run
gcloud run deploy "$SERVICE_NAME" \\
    --image "$IMAGE" \\
    --project "$PROJECT_ID" \\
    --region "$REGION" \\
    --platform managed \\
    --allow-unauthenticated \\
    --port 8080 \\
    --set-env-vars "API_URL=https://api.saveaday.ai,FIRESTORE_DATABASE_ID=${spec.database.firestoreId}"

echo "✅ Deployed to https://${spec.deployment.customDomain || spec.metadata.slug + '.saveaday.ai'}"
`;

    writeFile(join(outputDir, 'deploy.sh'), content);
}
