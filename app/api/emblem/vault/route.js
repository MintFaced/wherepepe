import { NextResponse } from 'next/server';
import { hasEmblemKey, createVault, vaultStatus } from '../../../../lib/emblemVault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
const ASSET_RE = /^[A-Z0-9._-]{1,40}$/;

// Create a curated vault — returns tokenId + the BTC/XCP deposit address.
// The collection is DERIVED server-side from the asset's allow-list entry
// (Rare Pepe and Fake Rares are `select` collections); any client-sent
// collection is ignored. Unknown assets fail closed with a clear message.
export async function POST(request) {
  if (!hasEmblemKey()) {
    return NextResponse.json({ ok: false, configured: false, error: 'MovePepe is awaiting its Emblem API key.' }, { status: 503 });
  }
  try {
    const body = await request.json();
    const toAddress = String(body?.toAddress || '');
    const asset = String(body?.asset || '').toUpperCase();
    if (!ADDR_RE.test(toAddress)) return NextResponse.json({ ok: false, error: 'Connect an ETH wallet first.' }, { status: 400 });
    if (!ASSET_RE.test(asset)) return NextResponse.json({ ok: false, error: 'Enter a valid Pepe asset name.' }, { status: 400 });
    const vault = await createVault({ toAddress, asset });
    return NextResponse.json({ ok: true, vault });
  } catch (e) {
    console.error('[MovePepe] create-vault failed:', e?.message || e);
    const msg = String(e.message || e);
    const status = /allow-list/i.test(msg) ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

// Poll a vault's live balance (deposit confirmation).
// `loaded` = Emblem's indexer sees the deposit (the mint-readiness gate);
// `source: 'counterparty'` = coins provably arrived on-chain but Emblem
// hasn't loaded them yet — informational only, never mint-gating.
// `mismatch` = the vault was created into the wrong select collection
// (recordedProject ≠ expectedProject) and can never mint — recreate it.
export async function GET(request) {
  if (!hasEmblemKey()) return NextResponse.json({ ok: false, configured: false }, { status: 503 });
  const tokenId = new URL(request.url).searchParams.get('tokenId');
  if (!tokenId) return NextResponse.json({ ok: false, error: 'tokenId required' }, { status: 400 });
  try {
    const { values, loaded, mismatch, asset, recordedProject, expectedProject, raw, source, btcAddress } = await vaultStatus(tokenId);
    return NextResponse.json({ ok: true, balances: values, loaded, mismatch, asset, recordedProject, expectedProject, raw, source, btcAddress });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
