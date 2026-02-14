import { adminDb } from '@/lib/firebaseAdmin';
import { isoNow } from '@saveaday/shared-utils';
import { randomBytes } from 'crypto';

/**
 * Generate a one-time token for email link authentication
 * This token is used to create a NextAuth session after email verification
 */
export const generateEmailLinkToken = async (
  email: string,
): Promise<string> => {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await adminDb.collection('emailLinkTokens').doc(token).set({
    email,
    expiresAt: expiresAt.toISOString(),
    createdAt: isoNow(),
    used: false,
  });

  return token;
};

/**
 * Verify and consume an email link token
 */
export const verifyEmailLinkToken = async (
  token: string,
): Promise<{ email: string } | null> => {
  const doc = await adminDb.collection('emailLinkTokens').doc(token).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data();
  if (!data) {
    return null;
  }

  // Check if expired
  const expiresAt = new Date(data.expiresAt);
  if (expiresAt < new Date()) {
    // Clean up expired token
    await doc.ref.delete();
    return null;
  }

  // Check if already used
  if (data.used) {
    return null;
  }

  // Mark as used
  await doc.ref.update({ used: true });

  return { email: data.email };
};

/**
 * Clean up expired tokens (run periodically)
 */
export const cleanupExpiredTokens = async () => {
  const now = isoNow();
  const snapshot = await adminDb
    .collection('emailLinkTokens')
    .where('expiresAt', '<', now)
    .get();

  const batch = adminDb.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();
};

