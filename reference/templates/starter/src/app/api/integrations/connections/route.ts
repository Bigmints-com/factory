import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@saveaday/shared-auth/server';
import { createConnection, getConnections } from '@/lib/repositories/connectionsRepository';

export async function GET() {
    try {
        const user = await getUser();

        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const connections = await getConnections(user.uid);
        return NextResponse.json(connections);
    } catch (error) {
        console.error('[API] Get connections error:', error);
        return NextResponse.json(
            { error: 'Failed to get connections' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await getUser();

        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { name, providerId, type, category, config, active, newsfeedId } = body;

        if (!name || !providerId || !type || !category || !config) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // TODO: Encrypt sensitive fields in config (like tokens) before saving

        const connection = await createConnection({
            ownerId: user.uid,
            name,
            providerId,
            type,
            category,
            config,
            active: active !== undefined ? active : true,
            newsfeedId,
        });

        return NextResponse.json(connection);
    } catch (error) {
        console.error('[API] Create connection error:', error);
        return NextResponse.json(
            { error: 'Failed to create connection' },
            { status: 500 }
        );
    }
}
