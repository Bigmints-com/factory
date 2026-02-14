"use server";


import { regenerateApiToken, getUserByEmail, upsertGoogleUser } from '@/lib/repositories/userRepository';
import { getUser } from '@saveaday/shared-auth/server';
import { revalidatePath } from 'next/cache';

export const regenerateApiTokenAction = async () => {
  const user = await getUser();
  if (!user?.uid || !session?.user?.email) {
    throw new Error('Unauthorized');
  }

  try {
    await regenerateApiToken(user.id);
    revalidatePath('/integrations/api');
    return { success: true };
  } catch (error) {
    // If user document doesn't exist, try to find by email or create it
    if (error instanceof Error && error.message.includes('User not found')) {
      // Try to find user by email
      let user = await getUserByEmail(user.email);
      
      // If user doesn't exist, create it (likely Google OAuth user that wasn't properly created)
      if (!user && user.email) {
        user = await upsertGoogleUser({
          email: user.email,
          name: user.name ?? undefined,
        });
      }
      
      if (user) {
        // User exists but ID mismatch - regenerate using correct ID
        await regenerateApiToken(user.id);
        revalidatePath('/integrations/api');
        return { success: true };
      }
      
      throw new Error('User record not found. Please log out and log back in.');
    }
    throw error;
  }
};
