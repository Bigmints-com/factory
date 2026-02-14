'use client';

import { SharedRegisterForm } from '@saveaday/shared-auth/components/SharedRegisterForm';

export default function LocalRegisterForm() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full">
                <SharedRegisterForm returnUrl="/dashboard" />
            </div>
        </div>
    );
}
