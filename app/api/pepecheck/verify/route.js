import { NextResponse } from 'next/server';
import { verifyVault, upsertVault, hasPcDb } from '../../../../lib/pepecheck';
import { hasEmblemKey } from '../../../../lib/emblemVault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/pepecheck/verify?tokenId=123 — live verification with the indexer
// nudge. Public JSON on purpose: bots and tools linking here is the growth loop.
export async function GET(request) {
  if (!hasEmblemKey()) return NextResponse.json({ ok: false, error: 'PepeCheck is awaiting its Emblem API key.' }, { status: 503 });
  const tokenId = String(new URL(request.url).searchParams.get('tokenId') || '').replace(/\D/g, '');
  if (!tokenId) return NextResponse.json({ ok: false, error: 'tokenId required' }, { status: 400 });
  try {
    const v = await verifyVault(tokenId);
    if (hasPcDb()) await upsertVault(tokenId, null, v).catch(() => {});
    return NextResponse.json({ ok: true, tokenId, ...v });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
