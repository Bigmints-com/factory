import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { AUTH_APP_URL } from '@saveaday/shared-auth/middleware-constants';
import LocalLoginForm from '@/app/components/auth/LocalLoginForm';

export default async function LoginPage() {
    // Check if we're on localhost
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');

    // For localhost, show the local login form
    if (isLocalhost) {
        return <LocalLoginForm />;
    }

    // For production, redirect to SSO
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const returnUrl = `${protocol}://${host}/dashboard`;
    redirect(`${AUTH_APP_URL}/login?returnUrl=${encodeURIComponent(returnUrl)}`);
}
