import { NextResponse } from 'next/server';
import { execSync } from 'node:child_process';

/**
 * GET /api/settings/gemini-cli-check
 * 
 * Checks if Gemini CLI is installed and accessible on the system.
 * Returns { available: boolean, version?: string, error?: string }
 */
export async function GET() {
    try {
        const result = execSync('gemini --version 2>&1', {
            timeout: 10_000,
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: '/bin/bash',
        });
        const version = result.toString().trim();
        return NextResponse.json({ available: true, version });
    } catch (err: any) {
        const isNotFound = err.message?.includes('not found') || err.message?.includes('ENOENT');
        return NextResponse.json({
            available: false,
            error: isNotFound
                ? 'Gemini CLI is not installed'
                : `Gemini CLI check failed: ${err.message?.slice(0, 200)}`,
        });
    }
}
