/**
 * Shared types for the Factory engine.
 *
 * Every type lives here — no local duplicates anywhere.
 */

// ─── Spec Types ──────────────────────────────────────────

/** Top-level app spec (parsed from YAML in .factory/specs/apps/) */
export interface AppSpec {
    appName: string;
    description: string;
    stack: StackConfig;
    frontend?: FrontendConfig;
    layout?: LayoutConfig;
    auth?: AuthConfig;
    data?: DataConfig;
    pages?: PagesConfig;
    deployment?: DeploymentConfig;
    status?: SpecStatus;
}

export interface StackConfig {
    framework: string;
    packageManager?: string;
    language?: string;
    linter?: string;
    testing?: string;
    database?: string;
    cloud?: string;
}

export interface FrontendConfig {
    ui?: string;
    theme?: string;
    icons?: string;
    fonts?: string[];
}

export interface LayoutConfig {
    sidebar?: boolean;
    topbar?: boolean;
    bottombar?: boolean;
    footer?: boolean;
}

export interface AuthConfig {
    provider?: string;
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
    type: string;
    required?: boolean;
    default?: string | number | boolean;
    description?: string;
}

export interface PagesConfig {
    dashboard?: string[];
    crud?: Array<{ table: string }>;
    custom?: string[];
}

export interface DeploymentConfig {
    port?: number;
    region?: string;
}

export type SpecStatus = 'draft' | 'ready' | 'in-progress' | 'validation' | 'review' | 'done';

// ─── Feature Spec ────────────────────────────────────────

export interface FeatureSpec {
    feature: {
        name: string;
        slug: string;
    };
    target: {
        app: string;
    };
    model?: {
        collection: string;
        fields: Array<{
            name: string;
            type: string;
            required?: boolean;
            default?: string | number | boolean;
        }>;
    };
    pages?: Array<{
        slug: string;
        type: string;
        title: string;
    }>;
}

// ─── Bridge Config (.factory/factory.yaml) ───────────────

export interface BridgeConfig {
    version: number;
    name: string;
    description: string;
    namespace?: string;
    projectId?: string;
    stack?: ProjectStack;
    registry?: { apps?: string };
    conventions?: { rules?: string; agents?: string };
    skills?: SkillsConfig;
    templates?: { starter?: string };
    apps_dir?: string;
}

export interface SkillsConfig {
    discovery?: 'auto' | 'manual';
    files?: string[];
}

export interface ProjectStack {
    framework: string;
    packageManager: string;
    linter?: string;
    testing?: string;
    database?: string;
    cloud?: string;
}

// ─── Project Management ──────────────────────────────────

export interface Project {
    id: string;
    name: string;
    path: string;
    addedAt: string;
    stack?: ProjectStack;
}

export interface ProjectsConfig {
    activeProject: string | null;
    projects: Project[];
}

// ─── LLM Settings ────────────────────────────────────────

export interface ModelConfig {
    id: string;
    name: string;
}

export interface LLMProvider {
    id: 'gemini' | 'openai' | 'ollama';
    name: string;
    enabled: boolean;
    apiKey?: string;
    baseUrl?: string;
    models: ModelConfig[];
    defaultModel?: string;
}

export interface FactorySettings {
    providers: LLMProvider[];
    activeProvider: string;
    buildModel: string;
    updatedAt?: string;
}

// ─── Build Pipeline ──────────────────────────────────────

export interface GeneratedFile {
    filename: string;
    content: string;
}

export interface BuildPlan {
    files: string[];
    architecture: string;
    decisions: string[];
}

export interface BuildResult {
    success: boolean;
    files: GeneratedFile[];
    plan: BuildPlan;
    iterations: number;
    errors?: string[];
}

export interface KnowledgeFile {
    app: string;
    filename: string;
    path: string;
    content: string;
}

export interface ProjectContext {
    bridge: BridgeConfig;
    knowledgeFiles: KnowledgeFile[];
    conventions: string[];
    stack: ProjectStack | undefined;
}

export interface ValidationResult {
    passed: boolean;
    errors: string[];
}

// ─── Helpers ─────────────────────────────────────────────

/** Slugify a string: "My App Name" → "my-app-name" */
export function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

/** Get the slug from an AppSpec */
export function specSlug(spec: AppSpec): string {
    return slugify(spec.appName);
}

/** Get the port from an AppSpec (defaults to 3000) */
export function specPort(spec: AppSpec): number {
    return spec.deployment?.port || 3000;
}

/** Get the region from an AppSpec (defaults to us-central1) */
export function specRegion(spec: AppSpec): string {
    return spec.deployment?.region || 'us-central1';
}
