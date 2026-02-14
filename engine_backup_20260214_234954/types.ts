/**
 * Shared types for the Factory engine.
 */

/** Status of a spec in the task queue */
export type SpecStatus = 'draft' | 'ready' | 'in-progress' | 'validation' | 'review' | 'done';

/** Stack configuration for a connected project */
export interface ProjectStack {
    framework: string;
    packageManager: string;
    linter: string;
    testing: string;
    database?: string; // e.g. "firestore", "mongodb", "postgres"
    cloud?: string;    // e.g. "gcp", "aws", "vercel"
}

// ─── App Spec (matches template.yaml) ─────────────────────

/** Top-level app spec structure (parsed from YAML) */
export interface AppSpec {
    appName: string;
    description: string;
    starter?: string;
    stack: StackConfig;
    frontend?: FrontendConfig;
    layout?: LayoutConfig;
    auth?: AuthConfig;
    data?: DataConfig;
    pages?: PagesConfig;
    deployment?: DeploymentConfig;
    // internal — set by engine, not by user
    status?: SpecStatus;
}

export interface StackConfig {
    framework: string;              // next.js | remix | vite | astro
    packageManager: string;         // pnpm | npm | yarn
    language?: string;              // typescript | javascript
    linter?: string;                // eslint | biome | none
    testing?: string;               // jest | vitest | none
    database?: string;              // supabase | postgres | mongodb | firestore | sqlite | none
    cloud?: string;                 // gcp | aws | vercel | none
}

export interface FrontendConfig {
    ui?: string;                    // shadcn/ui | tailwind | material-ui | chakra | none
    theme?: string;                 // dark | light | dark/light
    icons?: string;                 // lucide | heroicons | phosphor | none
    fonts?: string[];
}

export interface LayoutConfig {
    sidebar?: boolean;
    topbar?: boolean;
    bottombar?: boolean;
    footer?: boolean;
}

export interface AuthConfig {
    provider: string;               // firebase | nextauth | supabase | clerk | none
    methods?: {
        email?: boolean;
        google?: boolean;
        github?: boolean;
        apple?: boolean;
        phone?: boolean;
    };
    pages?: {
        login?: boolean;
        signup?: boolean;
        forgotPassword?: boolean;
    };
}

export interface DataConfig {
    tables?: TableDefinition[];
}

export interface TableDefinition {
    name: string;
    fields: Record<string, FieldDefinition>;
}

export interface FieldDefinition {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'datetime';
    required?: boolean;
    default?: unknown;
    description?: string;
}

export interface PagesConfig {
    dashboard?: string[];           // natural language descriptions
    crud?: CrudPageConfig[];        // auto-generate CRUD from table
    custom?: string[];              // free-form page descriptions
}

export interface CrudPageConfig {
    table: string;                  // reference to data.tables[].name
}

export interface DeploymentConfig {
    port?: number;
    region?: string;
}

// ─── Derived Helpers ───────────────────────────────────────

/** Slugify appName for use as directory/package name */
export function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** Get slug from spec */
export function specSlug(spec: AppSpec): string {
    return slugify(spec.appName);
}

/** Get port with default */
export function specPort(spec: AppSpec): number {
    return spec.deployment?.port || 3000;
}

/** Get region with default */
export function specRegion(spec: AppSpec): string {
    return spec.deployment?.region || 'us-central1';
}

// ─── Registry (for existing projects with apps.json) ──────

/** Registry entry in apps.json */
export interface AppRegistryEntry {
    name: string;
    path: string;
    type: string;
    url: string;
    container: string;
    port: number;
    database: string;
    group: string;
    status: string;
    region: string;
}

/** Full registry file */
export interface AppRegistry {
    apps: AppRegistryEntry[];
    packages: Array<{ name: string; status: string }>;
}

/** Validation result */
export interface ValidationResult {
    passed: boolean;
    checks: ValidationCheck[];
}

export interface ValidationCheck {
    name: string;
    passed: boolean;
    message: string;
}

/** Build report */
export interface BuildReport {
    spec: string;
    slug: string;
    timestamp: string;
    filesGenerated: string[];
    patchesGenerated: string[];
    validation: ValidationResult;
    nextSteps: string[];
}

// ─── Feature Spec (for adding features to existing apps) ──

/** Page type determines template used for generation */
export type FeaturePageType = 'list' | 'form' | 'detail' | 'custom';

/** Feature spec — defines a feature to add to an existing app */
export interface FeatureSpec {
    apiVersion: 'factory/v1';
    kind: 'FeatureSpec';
    status: SpecStatus;
    target: {
        app: string;
    };
    feature: FeatureDefinition;
    pages: FeaturePage[];
    model: FeatureModel;
    navigation?: FeatureNavigation;
}

export interface FeatureDefinition {
    name: string;
    slug: string;
    description: string;
    icon?: string;
}

export interface FeaturePage {
    route: string;
    title: string;
    type: FeaturePageType;
    dataSource?: string;
}

export interface FeatureModel {
    name: string;
    collection: string;
    fields: Record<string, FieldDefinition>;
}

export interface FeatureNavigation {
    section: 'main' | 'settings';
    label: string;
    icon?: string;
    position?: string;
}

/** Feature build report */
export interface FeatureBuildReport {
    targetApp: string;
    feature: string;
    slug: string;
    timestamp: string;
    filesGenerated: string[];
    patchesGenerated: string[];
    validation: ValidationResult;
    nextSteps: string[];
}
