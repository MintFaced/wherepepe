import { NextResponse } from 'next/server';
import { hasEmblemKey, createVaultForAsset, vaultStatus } from '../../../../lib/emblemVault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ASSET_RE = /^[A-Z0-9._-]{1,40}$/;

// Create a curated vault for an asset (returns tokenId + BTC/XCP deposit address).
export async function POST(request) {
  if (!hasEmblemKey()) {
    return NextResponse.json({ ok: false, configured: false, error: 'Pepe Moves is awaiting its Emblem API key.' }, { status: 503 });
  }
  try {
    const body = await request.json();
    const asset = String(body?.asset || '').toUpperCase();
    const collection = body?.collection === 'fake-rare' ? 'fake-rare' : 'rare-pepe';
    if (!ASSET_RE.test(asset)) return NextResponse.json({ ok: false, error: 'invalid asset' }, { status: 400 });
    const vault = await createVaultForAsset({ asset, collection });
    return NextResponse.json({ ok: true, vault });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}

// Poll a vault's deposit/mint status.
export async function GET(request) {
  if (!hasEmblemKey()) return NextResponse.json({ ok: false, configured: false }, { status: 503 });
  const tokenId = new URL(request.url).searchParams.get('tokenId');
  if (!tokenId) return NextResponse.json({ ok: false, error: 'tokenId required' }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, meta: await vaultStatus(tokenId) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
