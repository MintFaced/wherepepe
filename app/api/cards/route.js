import { NextResponse } from 'next/server';
import { getCatalog } from '../../../lib/catalog';
import { getCollectionFloor } from '../../../lib/wrapped';
import { getRates } from '../../../lib/rates';

export const runtime = 'nodejs';
export const revalidate = 3600;

// The full Rare Pepe directory + light context (collection floor, rates).
// Per-card native floors are loaded lazily via /api/enrich to avoid 1,774
// upstream calls on first paint.
export async function GET() {
  try {
    const [cards, collection, rates] = await Promise.all([
      getCatalog(),
      getCollectionFloor().catch(() => ({ floorEth: null })),
      getRates().catch(() => ({})),
    ]);
    return NextResponse.json({
      ok: true,
      count: cards.length,
      collectionFloorEth: collection.floorEth ?? null,
      rates,
      cards,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 502 });
  }
}
