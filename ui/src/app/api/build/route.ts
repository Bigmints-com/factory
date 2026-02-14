/**
 * POST /api/build — Run full build pipeline for a spec
 * Body: { specFile: "filename.yaml" }
 */
import { NextResponse } from 'next/server';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';

const FACTORY_ROOT = resolve(process.cwd(), '..');

export async function POST(request: Request) {
  try {
    const { specFile } = await request.json();
    if (!specFile) {
      return NextResponse.json({ error: 'specFile is required' }, { status: 400 });
    }

    const specPath = join(FACTORY_ROOT, 'specs', specFile);
    const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');
    const result = stripAnsi(execSync(
      `npx tsx engine/cli.ts build "${specPath}" 2>&1`,
      { cwd: FACTORY_ROOT, encoding: 'utf-8', timeout: 60000 }
    ));

    const success = result.includes('BUILD COMPLETE');

    return NextResponse.json({ success, output: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Build failed';
    const stdout = (err as { stdout?: string })?.stdout || '';
    return NextResponse.json(
      { success: false, error: message, output: stdout },
      { status: 500 }
    );
  }
}
