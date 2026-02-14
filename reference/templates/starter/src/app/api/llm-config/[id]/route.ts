import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@saveaday/shared-auth/server';
import {
    activateLLMConfiguration,
    deleteLLMConfiguration,
} from '@saveaday/llm-config/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/llm-config/[id]/activate
 * Activate a specific LLM configuration
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getUser();
        if (!user?.uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const result = await activateLLMConfiguration(user.uid, id);

        if (result.success) {
            return NextResponse.json({ success: true });
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
 * DELETE /api/llm-config/[id]
 * Delete a specific LLM configuration
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getUser();
        if (!user?.uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const result = await deleteLLMConfiguration(user.uid, id);

        if (result.success) {
            return NextResponse.json({ success: true });
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
