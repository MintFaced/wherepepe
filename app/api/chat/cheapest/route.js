import { NextResponse } from 'next/server';
import { getFloorsByAsset } from '../../../../lib/wrapped';
import { getCardMeta } from '../../../../lib/catalog';

export const runtime = 'nodejs';
export const revalidate = 300;

const CONTRACT = '0x7e6027a6a84fc1f6db6782c523efe62c923e46ff';

// The single cheapest wrapped Rare Pepe — the lowest-cost way for a non-holder
// to become eligible to post in ChatPepe. Returns the card + a direct buy link.
export async function GET() {
  try {
    const byAsset = await getFloorsByAsset();
    let best = null;
    for (const [asset, v] of Object.entries(byAsset)) {
      if (v.wrappedFloorEth == null) continue;
      if (!best || v.wrappedFloorEth < best.floorEth) {
        best = { asset, floorEth: v.wrappedFloorEth, tokenId: v.wrappedTokenId };
      }
    }
    if (!best) return NextResponse.json({ ok: false });

    const meta = await getCardMeta(best.asset).catch(() => null);
    const buyUrl = best.tokenId
      ? `https://opensea.io/item/ethereum/${CONTRACT}/${best.tokenId}`
      : 'https://opensea.io/collection/rare-pepe-curated?sortAscending=true&sortBy=UNIT_PRICE';

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
