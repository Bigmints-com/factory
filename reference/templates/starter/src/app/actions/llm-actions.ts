'use server';

import { addLLMConfiguration, getActiveLLMConfiguration } from '@saveaday/llm-config/server';
import { getUser } from '@saveaday/shared-auth/session';

export async function checkLLMConfigStatus() {
    try {
        const user = await getUser();
        if (!user) {
            return { hasConfig: false };
        }

        const config = await getActiveLLMConfiguration(user.uid);
        return { hasConfig: !!config.data };
    } catch (error) {
        console.error('Error checking LLM config:', error);
        return { hasConfig: false };
    }
}

export async function saveLLMConfigAction(configData: {
    provider: string;
    models?: string[];
    apiKey: string;
    baseUrl?: string;
    organization?: string;
    contextSize?: number;
}) {
    try {
        const user = await getUser();
        if (!user) {
            return { success: false, error: 'Unauthorized' };
        }

        await addLLMConfiguration(
            user.uid,
            configData.provider,
            configData.models?.[0] || '',
            configData.apiKey,
            configData.baseUrl,
            configData.organization,
            configData.contextSize
        );

        return { success: true };
    } catch (error) {
        console.error('Error saving LLM config:', error);
        return { success: false, error: 'Failed to save configuration' };
    }
}
