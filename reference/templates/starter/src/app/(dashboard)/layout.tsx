/**
 * Dashboard Layout Component
 * 
 * Provides the standardized shell for all authenticated pages within the dashboard.
 * includes:
 * - Basic authentication protection (checks session)
 * - Sidebar navigation with core links
 * - Onboarding flow management via OnboardingProvider
 * - Global footer
 */

import { redirect } from 'next/navigation';
import { OnboardingProvider } from '@/components/providers/onboarding-provider';
import { DashboardShell, Footer, LayoutProvider } from '@saveaday/shared-ui';
import { DashboardSidebarWrapper } from '@/components/layout/DashboardSidebarWrapper';

/**
 * Runtime Configuration:
 * We use 'nodejs' runtime because getServerSession/getUser depends on Node.js-specific APIs.
 * We force 'dynamic' rendering to ensure fresh authentication checks on every request.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { getUser } = await import('@saveaday/shared-auth/server');
    const user = await getUser();

    // Simple authentication guard: redirect to login if no session user is found
    if (!user) {
        redirect('/login');
    }

    return (
        <LayoutProvider>
            <OnboardingProvider>
                <DashboardShell
                    sidebar={(
                        <DashboardSidebarWrapper
                            user={{
                                id: user.uid,
                                name: user.displayName || undefined,
                                email: user.email || undefined,
                                photoURL: user.photoURL || undefined,
                            }}
                        />
                    )}
                    footer={<Footer />}
                    mainClassName="bg-gray-50 px-8 py-8"
                >
                    {children}
                </DashboardShell>
            </OnboardingProvider>
        </LayoutProvider>
    );
}
