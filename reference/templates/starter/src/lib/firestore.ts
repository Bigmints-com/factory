import { getAdminDb } from '@saveaday/shared-firebase/admin';
import { getDatabaseId } from './config';

/**
 * Get Firestore database instance for this app
 */
export function getDb() {
    const databaseId = getDatabaseId();
    return getAdminDb(databaseId);
}

/**
 * Example: Get a collection reference
 */
export function getItemsCollection() {
    const db = getDb();
    return db.collection('items');
}

/**
 * Example: Get a document reference
 */
export function getItemDoc(itemId: string) {
    return getItemsCollection().doc(itemId);
}
