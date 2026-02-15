/**
 * GET /api/reports — Redirects to knowledge API.
 * 
 * Reports are now served from the builds table via /api/knowledge.
 * This route is kept as a stub for backward compatibility.
 */
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ 
    reports: [], 
    message: 'Reports have been moved to /api/knowledge. Use the Reports tab in the dashboard.' 
  });
}
