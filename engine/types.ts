/**
 * Shared types for the SaveADay Factory engine.
 */

/** Status of a spec in the task queue */
export type SpecStatus = 'draft' | 'ready' | 'in-progress' | 'validation' | 'review' | 'done';

/** Top-level app spec structure (parsed from YAML) */
export interface AppSpec {
    apiVersion: 'saveaday/v1';
    kind: 'AppSpec';
    status: SpecStatus;
    metadata: AppMetadata;
    deployment: DeploymentConfig;
    database: DatabaseConfig;
    api: ApiConfig;
    features?: FeatureFlags;
    publicPage?: PublicPageConfig;
    acceptance?: string[];
}

export interface AppMetadata {
    name: string;
    slug: string;
    description: string;
    icon: string;
    color: string;
    brandAccent?: string;
    group: 'superapp' | 'infrastructure' | 'independent';
}

export interface DeploymentConfig {
    port: number;
    region: string;
    customDomain?: string;
}

export interface DatabaseConfig {
    databaseId: string;
    collections: string[];
}

export interface ApiConfig {
    resources: ResourceDefinition[];
}

export interface ResourceDefinition {
    name: string;
    collection: string;
    searchFields?: string[];
    fields: Record<string, FieldDefinition>;
}

export interface FieldDefinition {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    required?: boolean;
    default?: unknown;
    description?: string;
}

export interface FeatureFlags {
    publicPage?: boolean;
    connections?: boolean;
    embed?: boolean;
}

export interface PublicPageConfig {
    hero?: {
        title: string;
        subtitle: string;
    };
    features?: Array<{
        icon: string;
        title: string;
        description: string;
    }>;
    faqs?: Array<{
        q: string;
        a: string;
    }>;
}

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

// ─── Phase 2: Feature Spec Types ──────────────────────────

/** Page type determines template used for generation */
export type FeaturePageType = 'list' | 'form' | 'detail' | 'custom';

/** Feature spec — defines a feature to add to an existing app */
export interface FeatureSpec {
    apiVersion: 'saveaday/v1';
    kind: 'FeatureSpec';
    status: SpecStatus;
    target: {
        app: string;          // slug of the target app
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
    dataSource?: string;     // reference to model name
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
    position?: string;       // e.g. "after:dashboard"
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
