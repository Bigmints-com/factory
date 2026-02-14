import { getAdminDb } from '@saveaday/shared-firebase/admin';

export interface ConnectionRecord {
    id: string;
    ownerId: string;
    name: string;
    providerId: string; // e.g., 'github-pages-deployment'
    type: 'trigger' | 'source';
    category: string;
    config: Record<string, unknown>; // Provider-specific configuration (encrypted sensitive data)
    active: boolean;
    newsfeedId?: string; // Optional: connection specific to a newsfeed
    createdAt: string;
    updatedAt: string;
}

const COLLECTION = 'connections';

/**
 * Create a new connection
 */
export async function createConnection(
    connection: Omit<ConnectionRecord, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ConnectionRecord> {
    const db = getAdminDb();
    const now = new Date().toISOString();

    // Filter out undefined values (Firestore doesn't accept them)
    const cleanConnection = Object.fromEntries(
        Object.entries(connection).filter(([, value]) => value !== undefined)
    );

    const docRef = await db.collection(COLLECTION).add({
        ...cleanConnection,
        createdAt: now,
        updatedAt: now,
    });

    return {
        id: docRef.id,
        ...connection,
        createdAt: now,
        updatedAt: now,
    };
}

/**
 * Get all connections for a user
 */
export async function getConnections(ownerId: string): Promise<ConnectionRecord[]> {
    const db = getAdminDb();
    const snapshot = await db
        .collection(COLLECTION)
        .where('ownerId', '==', ownerId)
        .get();

    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
    } as ConnectionRecord));
}

/**
 * Get active connections by type for a user
 */
export async function getActiveConnectionsByType(
    ownerId: string,
    type: 'trigger' | 'source',
    newsfeedId?: string
): Promise<ConnectionRecord[]> {
    const db = getAdminDb();
    const query = db
        .collection(COLLECTION)
        .where('ownerId', '==', ownerId)
        .where('type', '==', type)
        .where('active', '==', true);

    const snapshot = await query.get();

    return snapshot.docs
        .map(doc => ({
            id: doc.id,
            ...doc.data(),
        } as ConnectionRecord))
        .filter(conn => !conn.newsfeedId || !newsfeedId || conn.newsfeedId === newsfeedId);
}

/**
 * Update a connection
 */
export async function updateConnection(
    id: string,
    updates: Partial<Omit<ConnectionRecord, 'id' | 'createdAt'>>
): Promise<void> {
    const db = getAdminDb();
    await db.collection(COLLECTION).doc(id).update({
        ...updates,
        updatedAt: new Date().toISOString(),
    });
}

/**
 * Delete a connection
 */
export async function deleteConnection(id: string): Promise<void> {
    const db = getAdminDb();
    await db.collection(COLLECTION).doc(id).delete();
}
