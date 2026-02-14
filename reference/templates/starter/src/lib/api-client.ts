/**
 * API Client for interacting with the centralized backend API (apps/api).
 * This client handles common request logic, headers, and authentication state.
 */

/**
 * The base URL for API requests. 
 * Uses relative URLs with Next.js rewrites to avoid CORS issues.
 * The rewrites in next.config.ts proxy requests to the main API server.
 */
const isBrowser = typeof window !== 'undefined';
const API_BASE_URL = isBrowser
    ? (process.env.NEXT_PUBLIC_API_URL?.includes('localhost') ? '' : (process.env.NEXT_PUBLIC_API_URL || ''))
    : (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3011');

/**
 * Configuration options for making an API request.
 */
interface ApiOptions {
    /** HTTP method to use for the request */
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    /** Data to be sent in the request body (auto-stringified to JSON) */
    body?: unknown;
    /** Additional custom headers to include in the request */
    headers?: Record<string, string>;
}

/**
 * Generic function to perform authenticated API requests using the fetch API.
 * 
 * @template T - The expected return type of the API response.
 * @param {string} endpoint - The API endpoint path (e.g., '/api/v1/resource').
 * @param {ApiOptions} [options={}] - Request configuration including method, body, and headers.
 * @returns {Promise<T>} A promise that resolves to the parsed JSON response of type T.
 * 
 * @example
 * const data = await apiClient<MyType>('/api/v1/items');
 */
export async function apiClient<T = unknown>(
    endpoint: string,
    options: ApiOptions = {}
): Promise<T> {
    const { method = 'GET', body, headers = {} } = options;

    const config: RequestInit = {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
        // IMPORTANT: 'include' ensures that cross-origin requests (e.g., from localhost:3012 to localhost:3021)
        // include the session cookies required for server-side authentication.
        credentials: 'include',
    };

    if (body) {
        config.body = JSON.stringify(body);
    }

    const url = `${API_BASE_URL}${endpoint}`;
    const response = await fetch(url, config);

    if (!response.ok) {
        // Handle non-2xx responses by throwing a structured error
        throw new Error(`API Error: ${response.statusText} (${response.status})`);
    }

    return response.json();
}

/**
 * Convenience methods for CRUD operations on starter items.
 * These serve as examples of how to build domain-specific API modules.
 */
export const itemsApi = {
    /** List all items for the authenticated user */
    list: () => apiClient('/api/v1/starter-items'),
    /** Get a single item by its ID */
    get: (id: string) => apiClient(`/api/v1/starter-items/${id}`),
    /** Create a new item */
    create: (data: unknown) => apiClient('/api/v1/starter-items', { method: 'POST', body: data }),
    /** Update an existing item */
    update: (id: string, data: unknown) => apiClient(`/api/v1/starter-items/${id}`, { method: 'PATCH', body: data }),
    /** Delete an item */
    delete: (id: string) => apiClient(`/api/v1/starter-items/${id}`, { method: 'DELETE' }),
};
