import { NextRequest, NextResponse } from 'next/server';
import '@/lib/integrations'; // Import to trigger registration
import { getTrigger } from '@saveaday/integrations/server';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { providerId, config } = body;

        if (!providerId || !config) {
            return NextResponse.json(
                { success: false, error: 'Missing providerId or config' },
                { status: 400 }
            );
        }

        // Get the trigger provider
        const trigger = getTrigger(providerId);

        if (!trigger) {
            return NextResponse.json(
                { success: false, error: `Provider '${providerId}' not found` },
                { status: 404 }
            );
        }

        if (!trigger.testConnection) {
            return NextResponse.json(
                { success: false, error: `Provider '${providerId}' does not support connection testing` },
                { status: 400 }
            );
        }

        // Test the connection
        const result = await trigger.testConnection(config);

        return NextResponse.json(result);
    } catch (error) {
        console.error('[API] Connection test error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Connection test failed'
            },
            { status: 500 }
        );
    }
}
