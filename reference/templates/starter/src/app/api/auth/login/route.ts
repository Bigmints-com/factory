import { NextRequest } from 'next/server';
import { loginHandler } from '@saveaday/shared-auth/server';

export async function POST(request: NextRequest) {
    return loginHandler.POST(request);
}
