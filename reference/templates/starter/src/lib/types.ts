/**
 * Core Data Models for the SaveADay platform.
 * These interfaces define the shared structure for data used across the starter app.
 */

/**
 * Represents a connection/integration between the user's account and an external provider.
 */
export interface Connection {
    /** Unique identifier for the connection (typically a Firestore document ID) */
    id: string;
    /** Human-readable name for the connection (e.g., 'Primary Slack') */
    name?: string;
    /** Whether the connection is currently enabled and functional */
    active: boolean;
    /** Identifier for the service provider (e.g., 'slack', 'github', 'webhook') */
    providerId: string;
    /** Optional reference to a specific item this connection belongs to */
    itemId?: string;
    /** ISO 8601 timestamp string for when the connection was created */
    createdAt: string;
}

/**
 * Represents a generic item or resource managed within the starter app.
 * This can be customized to represent specific domain objects (e.g., Projects, Tasks, Forms).
 */
export interface Item {
    /** Unique identifier for the item */
    id: string;
    /** Display name of the item */
    name: string;
}

/**
 * Configuration for Large Language Model (LLM) providers.
 * Used for AI-enhanced features across the platform.
 */
export interface LLMConfig {
    /** Unique identifier for the configuration */
    id: string;
    /** User-defined name for this configuration (e.g., 'Default OpenAI GPT-4') */
    name: string;
    /** The LLM provider (e.g., 'openai', 'anthropic', 'google') */
    provider: string;
    /** The specific model name to use (e.g., 'gpt-4o', 'claude-3-5-sonnet') */
    model: string;
    /** API key for authentication (should be handled securely/masked in UI) */
    apiKey?: string;
    /** Optional custom base URL for the API (e.g., for self-hosted or proxy services) */
    baseUrl?: string;
    /** Optional organization identifier (if required by the provider, like OpenAI) */
    organizationId?: string;
    /** ISO 8601 timestamp string for when the config was created */
    createdAt: string;
    /** ISO 8601 timestamp string for the last time the config was modified */
    updatedAt: string;
}
