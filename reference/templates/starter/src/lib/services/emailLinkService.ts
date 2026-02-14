import { adminAuth } from '@/lib/firebaseAdmin';

/**
 * Generate email link for passwordless authentication using Firebase Admin SDK
 * This creates a sign-in link that can be used for passwordless login
 */
export const generateEmailSignInLink = async (
  email: string,
  action: 'signup' | 'signin' = 'signup',
): Promise<{ success: boolean; link?: string; error?: string }> => {
  try {
    // Use Firebase Admin SDK to generate email verification link
    // For passwordless auth, we'll use email verification link as sign-in link
    // Include email and action in the URL so we can retrieve them when the link is clicked
    // Firebase may not preserve all query params, so we'll also store this mapping
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3012';
    const actionCodeSettings = {
      url: `${baseUrl}/auth/verify-email?email=${encodeURIComponent(email)}&action=${action}`,
      handleCodeInApp: true,
    };

    // Generate the link
    const link = await adminAuth.generateEmailVerificationLink(email, actionCodeSettings);

    // In development, log the link
    if (process.env.NODE_ENV === 'development') {
      console.log(`\n========================================`);
      console.log(`[Email Link Auth] For: ${email} (${action})`);
      console.log(`[Link]: ${link}`);
      console.log(`========================================\n`);
    }

    return {
      success: true,
      link: process.env.NODE_ENV === 'development' ? link : undefined,
    };
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    console.error('[EmailLinkService] Error generating link:', err);

    // If user doesn't exist yet (for signup), create a temporary user first
    if (error.code === 'auth/user-not-found' && action === 'signup') {
      try {
        // Create temporary user
        await adminAuth.createUser({
          email,
          emailVerified: false,
          disabled: false,
        });

        // Now generate the link
        const actionCodeSettings = {
          url: `${process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010'}/auth/verify-email?email=${encodeURIComponent(email)}&action=${action}`,
          handleCodeInApp: true,
        };
        const link = await adminAuth.generateEmailVerificationLink(email, actionCodeSettings);

        if (process.env.NODE_ENV === 'development') {
          console.log(`\n========================================`);
          console.log(`[Email Link Auth] For: ${email} (${action})`);
          console.log(`[Link]: ${link}`);
          console.log(`========================================\n`);
        }

        return {
          success: true,
          link: process.env.NODE_ENV === 'development' ? link : undefined,
        };
      } catch (createError: unknown) {
        return {
          success: false,
          error: (createError as Error).message || 'Failed to create user account',
        };
      }
    }

    return {
      success: false,
      error: (error as Error).message || 'Failed to generate email link',
    };
  }
};

/**
 * Send email with sign-in link
 */
export const sendEmailSignInLink = async (
  email: string,
  action: 'signup' | 'signin' = 'signup',
): Promise<{ success: boolean; error?: string; link?: string }> => {
  const result = await generateEmailSignInLink(email, action);

  if (!result.success || !result.link) {
    return result;
  }

  // Send email with the link
  // For now, we'll use the same email service
  // In production, you'd want to send a proper email with the link
  const emailResult = await sendEmailWithLink(email, result.link, action);

  return {
    success: emailResult.success,
    error: emailResult.error,
    link: process.env.NODE_ENV === 'development' ? result.link : undefined,
  };
};

/**
 * Send email with magic link (using Resend or similar)
 */
const sendEmailWithLink = async (
  email: string,
  link: string,
  action: 'signup' | 'signin',
): Promise<{ success: boolean; error?: string }> => {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@newsfeed.local';

  // If no Resend API key, log to console (for development)
  if (!RESEND_API_KEY) {
    console.log(`\n========================================`);
    console.log(`[Email Link] Sending to: ${email}`);
    console.log(`[Action]: ${action}`);
    console.log(`[Link]: ${link}`);
    console.log(`========================================\n`);
    return { success: true };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: email,
        subject: action === 'signup' ? 'Complete your registration' : 'Sign in to your account',
        html: `
          <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #171717; font-size: 24px; margin-bottom: 16px;">
              ${action === 'signup' ? 'Complete your registration' : 'Sign in to your account'}
            </h1>
            <p style="color: #6b7280; font-size: 16px; line-height: 1.5; margin-bottom: 24px;">
              Click the button below to ${action === 'signup' ? 'complete your registration' : 'sign in to your account'}:
            </p>
            <div style="text-align: center; margin-bottom: 24px;">
              <a href="${link}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
                ${action === 'signup' ? 'Complete Registration' : 'Sign In'}
              </a>
            </div>
            <p style="color: #6b7280; font-size: 14px; line-height: 1.5;">
              Or copy and paste this link into your browser:<br>
              <a href="${link}" style="color: #2563eb; word-break: break-all;">${link}</a>
            </p>
            <p style="color: #6b7280; font-size: 14px; line-height: 1.5; margin-top: 24px;">
              This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.
            </p>
          </div>
        `,
        text: `${action === 'signup' ? 'Complete your registration' : 'Sign in to your account'} by clicking this link: ${link}`,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.message || 'Failed to send email');
    }

    return { success: true };
  } catch (error) {
    console.error('[EmailLinkService] Failed to send email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    };
  }
};

