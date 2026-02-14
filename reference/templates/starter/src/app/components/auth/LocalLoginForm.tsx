'use client';

import { SharedLoginForm } from '@saveaday/shared-auth/components/SharedLoginForm';

export default function LocalLoginForm() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full">
                <SharedLoginForm returnUrl="/dashboard" />
            </div>
        </div>
    );
}
