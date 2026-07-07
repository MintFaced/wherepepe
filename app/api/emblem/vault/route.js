import { NextResponse } from 'next/server';
import { hasEmblemKey, createVault, vaultStatus } from '../../../../lib/emblemVault';
import { getCardMeta } from '../../../../lib/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
const ASSET_RE = /^[A-Z0-9._-]{1,40}$/;

// Create a curated vault — returns tokenId + the BTC/XCP deposit address.
export async function POST(request) {
  if (!hasEmblemKey()) {
    return NextResponse.json({ ok: false, configured: false, error: 'MovePepe is awaiting its Emblem API key.' }, { status: 503 });
  }
  try {
    const body = await request.json();
    const collection = body?.collection === 'fake-rare' ? 'fake-rare' : 'rare-pepe';
    const toAddress = String(body?.toAddress || '');
    const asset = String(body?.asset || '').toUpperCase();
    if (!ADDR_RE.test(toAddress)) return NextResponse.json({ ok: false, error: 'Connect an ETH wallet first.' }, { status: 400 });
    if (!ASSET_RE.test(asset)) return NextResponse.json({ ok: false, error: 'Enter a valid Pepe asset name.' }, { status: 400 });
    const meta = await getCardMeta(asset).catch(() => null);
    const vault = await createVault({ collection, toAddress, asset, image: meta?.image || meta?.media });
    return NextResponse.json({ ok: true, vault });
  } catch (e) {
    console.error('[MovePepe] create-vault failed:', e?.message || e);
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}

// Poll a vault's live balance (deposit confirmation).
export async function GET(request) {
  if (!hasEmblemKey()) return NextResponse.json({ ok: false, configured: false }, { status: 503 });
  const tokenId = new URL(request.url).searchParams.get('tokenId');
  if (!tokenId) return NextResponse.json({ ok: false, error: 'tokenId required' }, { status: 400 });
  try {
    const { values, raw, source, btcAddress } = await vaultStatus(tokenId);
    return NextResponse.json({ ok: true, balances: values, raw, source, btcAddress });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
