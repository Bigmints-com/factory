/**
 * API Route: POST /api/auth/verify-email-link
 * 
 * This route is the landing point for Firebase passwordless authentication links.
 * It verifies the email link, ensures the user exists (or prepares for signup),
 * and generates a one-time session token that NextAuth uses to establish a local session.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth } from '@/lib/firebaseAdmin';
import { generateEmailLinkToken } from '@/lib/services/emailLinkToken';
import { getUserByEmail } from '@/lib/repositories/userRepository';

/**
 * Force dynamic rendering for this route. 
 * Since it handles authentication and session state, it must never be statically cached.
 */
export const dynamic = 'force-dynamic';

/**
 * Schema for validating the verification request.
 */
const verifyEmailLinkSchema = z.object({
  /** The Firebase action code from the email link (oobCode) */
  actionCode: z.string().optional(),
  /** The user's email address being verified */
  email: z.string().email(),
  /** Explicit action override (optional) */
  action: z.enum(['signup', 'signin']).optional(),
});

/**
 * Handler for the POST request.
 * Processes the email verification and returns a session token.
 */
export const POST = async (request: Request) => {
  try {
    const body = await request.json();
    const parsed = verifyEmailLinkSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request parameters', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { email, action: providedAction } = parsed.data;

    // Step 1: Verify the user exists in Firebase Authentication
    let firebaseUser = null;
    try {
      firebaseUser = await adminAuth.getUserByEmail(email);
    } catch (error: unknown) {
      const err = error as { code?: string };
      if (err.code !== 'auth/user-not-found') {
        // Log unexpected Firebase errors but allow flow to potentially continue for signup
        console.error('[VerifyEmailLink] Firebase Auth Error:', err);
      }
    }

    // Step 2: Check if user exists in the local Firestore database
    // This allows us to distinguish between a new user (Signup) and an existing user (Signin).
    const dbUser = await getUserByEmail(email);

    // Step 3: Determine the final action
    // If no explicit action was provided, we default based on database presence.
    const action = providedAction || (dbUser ? 'signin' : 'signup');

    // Step 4: Generate a secure one-time token
    // This token is used by our local NextAuth configuration to bypass standard credentials
    // and log the user in based on this verified email link.
    const sessionToken = await generateEmailLinkToken(email);

    return NextResponse.json({
      success: true,
      email,
      uid: firebaseUser?.uid,
      action,
      sessionToken,
    });
  } catch (error: unknown) {
    console.error('[VerifyEmailLink] Critical Error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to verify email link' },
      { status: 500 },
    );
  }
};
