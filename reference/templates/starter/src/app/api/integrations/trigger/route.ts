import { NextRequest, NextResponse } from 'next/server';
import '@/lib/integrations'; // Import to trigger registration
import { getTrigger } from '@saveaday/integrations/server';
import { getUser } from '@saveaday/shared-auth/server';
import { getConnections } from '@/lib/repositories/connectionsRepository';

export async function POST(request: NextRequest) {
    try {
        const user = await getUser();

        if (!user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { connectionId, event, payload } = body;

        if (!connectionId || !event) {
            return NextResponse.json(
                { success: false, error: 'Missing connectionId or event' },
                { status: 400 }
            );
        }

        // Get the connection
        const connections = await getConnections(user.uid);
        const connection = connections.find(c => c.id === connectionId);

        if (!connection) {
            return NextResponse.json(
                { success: false, error: 'Connection not found' },
                { status: 404 }
            );
        }

        if (!connection.active) {
            return NextResponse.json(
                { success: false, error: 'Connection is not active' },
                { status: 400 }
            );
        }

        // Get the trigger provider
        const trigger = getTrigger(connection.providerId);

        if (!trigger) {
            return NextResponse.json(
                { success: false, error: `Provider '${connection.providerId}' not found` },
                { status: 404 }
            );
        }

        // Execute the trigger
        console.log(`[API] Manually triggering ${connection.name} for event: ${event}`);

        const result = await trigger.execute(event, payload, connection.config);

        if (result.success) {
            console.log(`[API] ✓ Successfully triggered ${connection.name}`);
        } else {
            console.error(`[API] ✗ Failed to trigger ${connection.name}:`, result.error);
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error('[API] Trigger execution error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Trigger execution failed'
            },
            { status: 500 }
        );
    }
}
