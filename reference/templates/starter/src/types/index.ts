/**
 * Type definitions for the Starter app
 */

export interface User {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
}

export interface Item {
    id: string;
    ownerId: string;
    name: string;
    description?: string;
    status: 'active' | 'archived';
    createdAt: string;
    updatedAt: string;
}

export interface AppSettings {
    emailNotifications: boolean;
    analytics: boolean;
}
