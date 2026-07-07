import { NextResponse } from 'next/server';
import { hasEmblemKey, myVaults } from '../../../../lib/emblemVault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

export async function GET(request) {
  if (!hasEmblemKey()) return NextResponse.json({ ok: false, configured: false }, { status: 503 });
  const url = new URL(request.url);
  const address = String(url.searchParams.get('address') || '');
  const vaultType = url.searchParams.get('vaultType') || 'created';
  if (!ADDR_RE.test(address)) return NextResponse.json({ ok: false, error: 'valid address required' }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, vaults: await myVaults(address, vaultType) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
