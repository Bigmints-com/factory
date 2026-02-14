import { NextRequest, NextResponse } from 'next/server';
import { testLLMConnection } from '@saveaday/llm-config/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/llm-config/test
 * Test connection to an LLM provider
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { provider, model, apiKey, baseUrl } = body;

        if (!provider || !model) {
            return NextResponse.json(
                { success: false, error: 'Provider and model are required' },
                { status: 400 }
            );
        }

        const result = await testLLMConnection(provider, model, apiKey, baseUrl);

        return NextResponse.json(result);
    } catch (error: unknown) {
        console.error('[LLM Config Test] Error:', error);
        return NextResponse.json(
            { success: false, error: (error as Error).message || 'Connection test failed' },
            { status: 500 }
        );
    }
}
