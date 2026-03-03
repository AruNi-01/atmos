import { NextResponse } from 'next/server';

// Required for `next build` with `output: export` in desktop packaging.
export const dynamic = 'force-static';

export async function GET() {
  // Static export build cannot serve dynamic route handlers.
  return new NextResponse('Not available in static export', { status: 404 });
}
