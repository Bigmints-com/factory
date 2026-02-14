/**
 * Firebase Admin re-exports from shared package
 * All apps should use shared-firebase for Firebase initialization
 */
import { getAdminAuth, getAdminDb } from '@saveaday/shared-firebase/admin';

// Re-export as named exports for backward compatibility
export const adminAuth = getAdminAuth();
export const adminDb = getAdminDb();

// Also export the getter functions
export { getAdminAuth, getAdminDb };
