import { NextResponse } from 'next/server';
import { getWrappedCounts } from '../../../lib/wrapped';

export const runtime = 'nodejs';
export const revalidate = 3600;

// The full per-card wrapped-count map in one call (from OpenSea's trait
// distribution). Powers the gallery's wrapped/native toggle, %-sort, and
// ratio bars without per-card requests. Returns an empty map (ok:false) when
// OPENSEA_API_KEY is not set — the client degrades gracefully.
export async function GET() {
  try {
    const r = await getWrappedCounts();
    return NextResponse.json({
      ok: Boolean(r.ok),
      traitUsed: r.traitUsed ?? null,
      matched: r.matched ?? 0,
      byAsset: r.byAsset || {},
    });
  } catch (e) {
    return NextResponse.json({ ok: false, byAsset: {}, error: String(e) });
  }
}
