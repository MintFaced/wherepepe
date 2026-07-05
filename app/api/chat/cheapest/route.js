import { NextResponse } from 'next/server';
import { getFloorsByAsset } from '../../../../lib/wrapped';
import { getCardMeta } from '../../../../lib/catalog';
import { COLLECTIONS } from '../../../../lib/collections';

export const runtime = 'nodejs';
export const revalidate = 300;

// The single cheapest wrapped Rare Pepe — the lowest-cost way for a non-holder
// to become eligible to post in ChatPepe. Returns the card + a direct buy link.
export async function GET() {
  try {
    const byAsset = await getFloorsByAsset();
    let best = null;
    for (const [asset, v] of Object.entries(byAsset)) {
      if (v.wrappedFloorEth == null) continue;
      if (!best || v.wrappedFloorEth < best.floorEth) {
        best = { asset, floorEth: v.wrappedFloorEth, tokenId: v.wrappedTokenId, collection: v.collection || 'rare-pepe' };
      }
    }
    if (!best) return NextResponse.json({ ok: false });

    const meta = await getCardMeta(best.asset).catch(() => null);
    const col = COLLECTIONS[best.collection] || COLLECTIONS['rare-pepe'];
    const buyUrl = best.tokenId
      ? `https://opensea.io/item/ethereum/${col.contract}/${best.tokenId}`
      : `https://opensea.io/collection/${col.osSlug}?sortAscending=true&sortBy=UNIT_PRICE`;

    return NextResponse.json({
      ok: true,
      asset: best.asset,
      title: meta?.title || best.asset,
      image: meta?.image || meta?.media || null,
      series: meta?.series ?? null,
      card: meta?.card ?? null,
      floorEth: best.floorEth,
      buyUrl,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) });
  }
}
