/**
 * POST /api/feature-build — Build a feature from a feature spec
 * Body: { specFile: "features/filename.yaml" }
 */
import { NextResponse } from 'next/server';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';

const FACTORY_ROOT = resolve(process.cwd(), '..');

const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');

export async function POST(request: Request) {
  try {
    const { specFile, action = 'build' } = await request.json();
    if (!specFile) {
      return NextResponse.json({ error: 'specFile is required' }, { status: 400 });
    }

    const specPath = join(FACTORY_ROOT, 'specs', specFile);
    const cmd = action === 'validate' ? 'validate' : 'build';

    const result = stripAnsi(execSync(
      `npx tsx engine/cli.ts feature ${cmd} "${specPath}" 2>&1`,
      { cwd: FACTORY_ROOT, encoding: 'utf-8', timeout: 60000 }
    ));

    const success = result.includes('COMPLETE') || result.includes('PASSED');

    return NextResponse.json({ success, output: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Feature build failed';
    const output = (err as any)?.stdout || (err as any)?.stderr || message;
    return NextResponse.json(
      { success: false, error: message, output: stripAnsi(String(output)) },
      { status: 500 }
    );
  }
}
