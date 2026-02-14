import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@saveaday/shared-auth/server';
import {
    getLLMConfigurations,
    addLLMConfiguration,
} from '@saveaday/llm-config/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/llm-config
 * Get all LLM configurations for the authenticated user
 */
export async function GET() {
    try {
        const user = await getUser();
        if (!user?.uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const result = await getLLMConfigurations(user.uid);

        if (result.success) {
            return NextResponse.json({
                success: true,
                configurations: result.data || [],
            });
        }

        return NextResponse.json(
            { success: false, error: result.error },
            { status: 500 }
        );
    } catch (error: unknown) {
        console.error('[LLM Config API] Error:', error);
        return NextResponse.json(
            { success: false, error: (error as Error).message || 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/llm-config
 * Create a new LLM configuration
 */
export async function POST(request: NextRequest) {
    try {
        const user = await getUser();
        if (!user?.uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { provider, model, apiKey, baseUrl, organization, contextSize } = body;

        if (!provider || !model) {
            return NextResponse.json(
                { success: false, error: 'Provider and model are required' },
                { status: 400 }
            );
        }

        const result = await addLLMConfiguration(
            user.uid,
            provider,
            model,
            apiKey,
            baseUrl,
            organization,
            contextSize
        );

        if (result.success) {
            return NextResponse.json({
                success: true,
                id: result.data,
            });
        }

        return NextResponse.json(
            { success: false, error: result.error },
            { status: 500 }
        );
    } catch (error: unknown) {
        console.error('[LLM Config API] Error:', error);
        return NextResponse.json(
            { success: false, error: (error as Error).message || 'Internal server error' },
            { status: 500 }
        );
    }
}
