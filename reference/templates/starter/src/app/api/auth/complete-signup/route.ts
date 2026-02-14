import { NextRequest } from 'next/server';
import { completeSignupHandler } from '@saveaday/shared-auth/server';

export async function POST(request: NextRequest) {
  return completeSignupHandler.POST(request);
}
