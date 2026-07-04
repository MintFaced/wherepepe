import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// TEMPORARY diagnostic — reveals the real OpenSea OFFER (bid) structure for the
// rare-pepe-curated collection so the "highest offer" sweep/sort is built
// against reality (price shape, item vs collection/trait offers, how the NFT is
// referenced). Structural samples only. Delete once the offers sweep ships.
const SLUG = 'rare-pepe-curated';
const OS = 'https://api.opensea.io/api/v2';

export async function GET() {
  const key = process.env.OPENSEA_API_KEY;
  if (!key) return NextResponse.json({ ok: false, error: 'OPENSEA_API_KEY not set' }, { status: 400 });
  const h = { accept: 'application/json', 'x-api-key': key };
  const out = { slug: SLUG };

  const trimOffer = (o) => {
    if (!o) return null;
    const params = o?.protocol_data?.parameters || {};
    return {
      price: o?.price,                                   // full price object
      keys: Object.keys(o),
      offerItems: (params.offer || []).map((x) => ({ itemType: x.itemType, token: x.token, amount: x.startAmount, id: x.identifierOrCriteria })),
      considerationItems: (params.consideration || []).map((x) => ({ itemType: x.itemType, token: x.token, id: x.identifierOrCriteria })),
    };
  };

  try {
    // All offers (item + collection + trait), sorted best-first.
    const allRes = await fetch(`${OS}/offers/collection/${SLUG}/all?limit=5`, { headers: h, signal: AbortSignal.timeout(15000) });
    const allData = await allRes.json();
    out.allStatus = allRes.status;
    out.allTopKeys = Object.keys(allData || {});
    out.allSample = (allData.offers || allData.orders || []).slice(0, 4).map(trimOffer);
    out.allNext = Boolean(allData.next);

    // Collection offers only (criteria offers that apply to any card).
    const colRes = await fetch(`${OS}/offers/collection/${SLUG}?limit=3`, { headers: h, signal: AbortSignal.timeout(15000) });
    const colData = await colRes.json();
    out.collectionStatus = colRes.status;
    out.collectionSample = (colData.offers || []).slice(0, 3).map(trimOffer);

    out.ok = true;
  } catch (e) {
    out.ok = false;
    out.error = String(e);
  }

  return NextResponse.json(out);
}
