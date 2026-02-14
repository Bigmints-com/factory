import { NextResponse } from 'next/server';
import { revokeSession, SESSION_COOKIE_NAME, getCookieDomain } from '@saveaday/shared-auth/server';

export const dynamic = 'force-dynamic';

export async function POST() {
    try {
        // Revoke session in Firebase
        await revokeSession();

        const response = NextResponse.json({
            success: true,
            message: 'Logged out successfully'
        });

        // Clear session cookie
        const domain = getCookieDomain();

        response.cookies.set(SESSION_COOKIE_NAME, '', {
            maxAge: 0,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            domain,
            path: '/',
            sameSite: 'lax',
        });

        return response;
    } catch (error) {
        console.error('[Logout API] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
