import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// TEMPORARY diagnostic — reveals the real OpenSea data model for the
// rare-pepe-curated collection so we can build the per-card count/floor parser
// against reality. Returns only structural samples (names, traits, a listing),
// never secrets. Safe to delete once the sweep is finalized.
const SLUG = 'rare-pepe-curated';
const OS = 'https://api.opensea.io/api/v2';

export async function GET() {
  const key = process.env.OPENSEA_API_KEY;
  if (!key) return NextResponse.json({ ok: false, error: 'OPENSEA_API_KEY not set' }, { status: 400 });
  const h = { accept: 'application/json', 'x-api-key': key };
  const out = { slug: SLUG };

  try {
    // 1) A page of NFTs — do names/traits identify the card?
    const nftsRes = await fetch(`${OS}/collection/${SLUG}/nfts?limit=8`, { headers: h, signal: AbortSignal.timeout(15000) });
    const nftsData = await nftsRes.json();
    out.nftsStatus = nftsRes.status;
    out.nftsSample = (nftsData.nfts || []).map((n) => ({
      identifier: n.identifier,
      name: n.name,
      traits: n.traits, // may be absent on the list endpoint
    }));
    out.nftsNext = Boolean(nftsData.next);

    // 2) A single NFT's full detail (traits usually live here, not on the list).
    const firstId = out.nftsSample[0]?.identifier;
    if (firstId) {
      const one = await fetch(`${OS}/collection/${SLUG}/nfts/${firstId}`, { headers: h, signal: AbortSignal.timeout(15000) })
        .then((r) => r.json()).catch(() => null);
      out.singleNftTraits = one?.nft?.traits ?? null;
      out.singleNftName = one?.nft?.name ?? null;
    }

    // 3) A page of best listings — shape of price + how the NFT is referenced.
    const listRes = await fetch(`${OS}/listings/collection/${SLUG}/best?limit=3`, { headers: h, signal: AbortSignal.timeout(15000) });
    const listData = await listRes.json();
    out.listingsStatus = listRes.status;
    out.listingsSample = (listData.listings || []).map((l) => ({
      priceValue: l?.price?.current?.value,
      priceCurrency: l?.price?.current?.currency,
      priceDecimals: l?.price?.current?.decimals,
      offerToken: l?.protocol_data?.parameters?.offer?.[0]?.token,
      offerTokenId: l?.protocol_data?.parameters?.offer?.[0]?.identifierOrCriteria,
    }));
    out.listingsKeys = (listData.listings || [])[0] ? Object.keys(listData.listings[0]) : [];
    out.ok = true;
  } catch (e) {
    out.ok = false;
    out.error = String(e);
  }

  return NextResponse.json(out);
}
