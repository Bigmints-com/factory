import { getAdminDb } from '@/lib/firebaseAdmin';
import { generateApiToken, isoNow } from '@saveaday/shared-utils';
import { DocumentData } from 'firebase-admin/firestore';

// Lazy collection access to avoid issues with Proxy initialization
// Connect to the 'users' database
const getCollection = () => getAdminDb('users').collection('users');

export interface UserRecord {
  id: string;
  email: string;
  name?: string;
  passwordHash?: string;
  provider: 'password' | 'google';
  apiToken: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  lastUsedAt?: string;
}

const mapUser = (data: DocumentData, id?: string): UserRecord => ({
  id: id || data.id || '',
  email: data.email,
  name: data.name,
  passwordHash: data.passwordHash,
  provider: data.provider ?? 'password',
  apiToken: data.apiToken,
  createdAt: data.createdAt,
  updatedAt: data.updatedAt,
  lastLoginAt: data.lastLoginAt,
  lastUsedAt: data.lastUsedAt,
});

export const getUserByEmail = async (
  email: string,
): Promise<UserRecord | null> => {
  const snapshot = await getCollection().where('email', '==', email).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return mapUser(doc.data(), doc.id);
};

export const getUserById = async (id: string): Promise<UserRecord | null> => {
  try {
    console.log(`[UserRepository] Getting user by ID: ${id}`);
    const collectionRef = getCollection();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbId = (getAdminDb('users') as any).databaseId;
    console.log(`[UserRepository] Database ID: ${dbId}`);

    const docRef = collectionRef.doc(id);
    const doc = await docRef.get();

    console.log(`[UserRepository] Doc exists: ${doc.exists}`);

    if (!doc.exists) {
      console.log(`[UserRepository] User doc ${id} not found in 'users' db`);
      return null;
    }

    const data = doc.data() as DocumentData;
    console.log(`[UserRepository] Found user data for ${data.email}, has token: ${!!data.apiToken}`);
    return mapUser(data, doc.id);
  } catch (error: unknown) {
    const err = error as { code?: number; message?: string };
    console.error(`[UserRepository] Error fetching user ${id}:`, err);
    // Handle Firestore NOT_FOUND error (database doesn't exist)
    if (err?.code === 5 || err?.message?.includes('NOT_FOUND')) {
      console.error('[UserRepository] Firestore database not found. Please ensure:');
      console.error('  1. The Firestore database exists in Firebase Console');
      console.error('  2. FIRESTORE_DATABASE_ID environment variable is set correctly');
      console.error('  3. The service account has access to the database');
      throw new Error('Firestore database not found. Please check your FIRESTORE_DATABASE_ID configuration.');
    }
    throw error;
  }
};

export const createPasswordUser = async ({
  email,
  name,
  passwordHash,
}: {
  email: string;
  name?: string;
  passwordHash: string;
}): Promise<UserRecord> => {
  const now = isoNow();
  const docRef = getCollection().doc();
  const record: UserRecord = {
    id: docRef.id,
    email,
    name,
    passwordHash,
    provider: 'password',
    apiToken: generateApiToken(),
    createdAt: now,
    updatedAt: now,
  };
  await docRef.set(record);
  return record;
};

export const upsertGoogleUser = async ({
  email,
  name,
}: {
  email: string;
  name?: string;
}): Promise<UserRecord> => {
  const existing = await getUserByEmail(email);
  if (existing) {
    const now = isoNow();
    await getCollection().doc(existing.id).update({
      name: name ?? existing.name ?? null,
      provider: 'google',
      updatedAt: now,
      lastLoginAt: now,
    });
    return (await getUserById(existing.id))!;
  }

  const now = isoNow();
  const docRef = getCollection().doc();
  const record: UserRecord = {
    id: docRef.id,
    email,
    name,
    provider: 'google',
    apiToken: generateApiToken(),
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  };
  await docRef.set(record);
  return record;
};

export const touchUserLogin = async (id: string) => {
  const now = isoNow();
  await getCollection().doc(id).update({
    lastLoginAt: now,
    updatedAt: now,
  });
};

export const regenerateApiToken = async (
  id: string,
): Promise<UserRecord | null> => {
  // First check if user exists
  const existing = await getUserById(id);
  if (!existing) {
    throw new Error(`User not found with ID: ${id}. Please ensure you are logged in correctly.`);
  }

  const token = generateApiToken();
  const now = isoNow();
  await getCollection().doc(id).update({
    apiToken: token,
    updatedAt: now,
  });
  return getUserById(id);
};

export const getUserByApiToken = async (
  token: string,
): Promise<UserRecord | null> => {
  const snapshot = await getCollection().where('apiToken', '==', token).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return mapUser(doc.data(), doc.id);
};

export const touchApiToken = async (id: string) => {
  await getCollection().doc(id).update({
    lastUsedAt: isoNow(),
  });
};
