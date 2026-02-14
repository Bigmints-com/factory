"use server";

import { getUser } from '@saveaday/shared-auth/server';
import { getFirestore } from '@saveaday/shared-firebase/admin';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const submissionUpdateSchema = z.object({
    name: z.string().min(1, 'Name is required').max(200),
    email: z.string().email('Invalid email').max(200),
    source: z.string().max(500).optional(),
});

const getSessionOrThrow = async () => {
    const user = await getUser();
    if (!user?.uid) {
        throw new Error('Unauthorized');
    }
    return user;
};

export const updateSubmissionAction = async (
    newsfeedId: string,
    submissionId: string,
    data: {
        name: string;
        email: string;
        source?: string;
    }
) => {
    try {
        const user = await getSessionOrThrow();

        // Validate the data
        const parsed = submissionUpdateSchema.safeParse(data);
        if (!parsed.success) {
            return {
                error: parsed.error.flatten().fieldErrors.name?.[0]
                    || parsed.error.flatten().fieldErrors.email?.[0]
                    || 'Invalid data',
            };
        }

        const db = getFirestore();

        // Get the newsfeed to verify ownership
        const newsfeedDoc = await db
            .collection('newsfeeds')
            .doc(newsfeedId)
            .get();

        if (!newsfeedDoc.exists) {
            return { error: 'Newsfeed not found' };
        }

        const newsfeed = newsfeedDoc.data();
        if (newsfeed?.ownerId !== user.uid) {
            return { error: 'Unauthorized' };
        }

        // Update the submission
        await db
            .collection('newsfeeds')
            .doc(newsfeedId)
            .collection('submissions')
            .doc(submissionId)
            .update({
                name: parsed.data.name,
                email: parsed.data.email,
                source: parsed.data.source || null,
                updatedAt: new Date().toISOString(),
            });

        revalidatePath(`/newsfeeds/${newsfeedId}/manage`);

        return { success: true };
    } catch (error) {
        console.error('[submissionActions] Update failed:', error);
        return {
            error: error instanceof Error ? error.message : 'Failed to update submission',
        };
    }
};
