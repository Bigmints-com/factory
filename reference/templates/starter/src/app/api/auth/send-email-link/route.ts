import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmailSignInLink } from '@/lib/services/emailLinkService';
import { getUserByEmail } from '@/lib/repositories/userRepository';

// Force dynamic rendering to prevent build-time analysis
export const dynamic = 'force-dynamic';

const sendEmailLinkSchema = z.object({
  email: z.string().email('Please provide a valid email'),
  action: z.enum(['signup', 'signin']).optional().default('signup'),
});

export const POST = async (request: Request) => {
  try {
    const body = await request.json();
    const parsed = sendEmailLinkSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid email address', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { email, action } = parsed.data;

    // For signup, check if user already exists
    if (action === 'signup') {
      const existing = await getUserByEmail(email);
      if (existing) {
        return NextResponse.json(
          { error: 'An account with this email already exists.' },
          { status: 400 },
        );
      }
    } else {
      // For signin, check if user exists
      const existing = await getUserByEmail(email);
      if (!existing) {
        return NextResponse.json(
          { error: 'No account found with this email address.' },
          { status: 404 },
        );
      }
    }

    // Send email link
    const result = await sendEmailSignInLink(email, action);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send email link' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: action === 'signup' 
        ? 'Check your email to complete registration' 
        : 'Check your email to sign in',
      // Include link in dev mode for testing
      link: result.link,
    });
  } catch (error) {
    console.error('[SendEmailLink] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
};

