/**
 * POST /api/validate — Validate a spec file
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
    const result = execSync(
      `npx tsx engine/cli.ts validate "${specPath}" 2>&1`,
      { cwd: FACTORY_ROOT, encoding: 'utf-8', timeout: 30000 }
    );

    // Strip ANSI escape codes
    const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');
    const cleanResult = stripAnsi(result);

    // Parse the output lines into structured checks
    const checks = cleanResult
      .split('\n')
      .filter((line) => line.includes('✓') || line.includes('✗'))
      .map((line) => {
        const passed = line.includes('✓');
        const cleaned = line.replace(/[✓✗●→!]\s*/g, '').trim();
        const [name, ...rest] = cleaned.split(':');
        return {
          passed,
          name: name?.trim() || cleaned,
          message: rest.join(':').trim() || '',
        };
      });

    const allPassed = checks.every((c) => c.passed);

    return NextResponse.json({ passed: allPassed, checks, raw: cleanResult });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Validation failed';
    return NextResponse.json({ passed: false, error: message }, { status: 500 });
  }
}
