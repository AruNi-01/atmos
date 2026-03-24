import { NextResponse } from 'next/server';
import { loadExtensionFile } from '../_shared/extension-loader';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const raw = new TextDecoder().decode(await loadExtensionFile('manifest.json'));
    const manifest = JSON.parse(raw) as { version?: string };
    return NextResponse.json({ version: manifest.version ?? '0.0.0' });
  } catch {
    return NextResponse.json({ version: '0.0.0' }, { status: 500 });
  }
}
