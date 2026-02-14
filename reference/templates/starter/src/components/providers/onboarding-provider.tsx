'use client';

import { checkLLMConfigStatus, saveLLMConfigAction } from '@/app/actions/llm-actions';
import { OnboardingStatus, OnboardingWizard, useOnboardingStatus } from '@saveaday/onboarding';
import { useUser } from '@saveaday/shared-auth/client';
import React from 'react';

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
    const { user } = useUser();

    // Custom status fetcher that checks real LLM config
    const statusFetcher = async (): Promise<OnboardingStatus | null> => {
        const { hasConfig } = await checkLLMConfigStatus();
        const skipped = typeof window !== 'undefined' && localStorage.getItem('saveaday_onboarding_skipped_llm') === 'true';

        return {
            steps: {
                'llm-config': hasConfig || skipped, // TRUE if config exists or skipped
                'changelog': true,
                'profile-setup': false,
                'welcome': true
            },
            isFullyOnboarded: hasConfig, // If LLM config exists, we consider them onboarded for now
            currentStepId: hasConfig ? undefined : 'llm-config'
        };
    };

    const { status, updateStep } = useOnboardingStatus(user?.uid || '', statusFetcher);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleSaveConfig = async (config: any) => {
        const result = await saveLLMConfigAction(config);
        if (result.success) {
            await updateStep('llm-config', true);
        }
        return result;
    };

    const handleCompleteStep = async (stepId: string) => {
        await updateStep(stepId, true);
    };

    // If onboarding is not complete, show ONLY the wizard (blocking)
    if (user && status && !status.isFullyOnboarded && !status.steps['llm-config']) {
        return (
            <OnboardingWizard
                userId={user.uid}
                isOpen={true}
                onClose={() => {
                    // Mark as completed when they skip/close
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('saveaday_onboarding_skipped_llm', 'true');
                    }
                    updateStep('llm-config', true);
                }}
                onComplete={() => {
                    updateStep('llm-config', true);
                }}
                actions={{
                    saveLLMConfig: handleSaveConfig,
                    completeStep: handleCompleteStep
                }}
            />
        );
    }

    // Otherwise, show the dashboard
    return <>{children}</>;
}
