import { NextResponse } from 'next/server';
import { getCardMeta } from '../../../../lib/catalog';
import { COLLECTIONS } from '../../../../lib/collections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// TEMPORARY: diagnose a single asset's wrapped floor — how many tokenIds it maps
// to, and every listing we can find for it. Reveals whether the sweep is missing
// the cheapest listings.  /api/debug/asset?asset=FROGDNA
const OS = 'https://api.opensea.io/api/v2';
function osHeaders() {
  const h = { accept: 'application/json' };
  if (process.env.OPENSEA_API_KEY) h['x-api-key'] = process.env.OPENSEA_API_KEY;
  return h;
}
function parseAsset(name) {
  if (!name) return null;
  const p = String(name).split('|')[0].trim().toUpperCase();
  return /^[A-Z0-9._-]{1,40}$/.test(p) ? p : null;
}
const get = (url) => fetch(url, { headers: osHeaders(), signal: AbortSignal.timeout(15000) }).then((r) => r.json());

export async function GET(request) {
  const asset = String(new URL(request.url).searchParams.get('asset') || 'FROGDNA').toUpperCase();
  const meta = await getCardMeta(asset);
  if (!meta) return NextResponse.json({ ok: false, error: 'unknown asset' }, { status: 404 });
  const col = COLLECTIONS[meta.collection] || COLLECTIONS['rare-pepe'];

  // 1) enumerate NFTs → tokenIds for this asset
  const tokenIds = new Set();
  let cursor = null, pages = 0, nfts = 0, enumCapped = false;
  do {
    const d = await get(`${OS}/collection/${col.osSlug}/nfts?limit=200${cursor ? `&next=${encodeURIComponent(cursor)}` : ''}`);
    for (const n of d.nfts || []) { nfts += 1; if (parseAsset(n.name) === asset) tokenIds.add(String(n.identifier)); }
    cursor = d.next || null; pages += 1;
    if (pages >= 150) { enumCapped = Boolean(cursor); break; }
  } while (cursor);

  // 2) sweep best listings → any that match this asset's tokenIds
  const forAsset = [];
  let lc = null, lp = 0, totalListings = 0, listCapped = false;
  do {
    const d = await get(`${OS}/listings/collection/${col.osSlug}/best?limit=100${lc ? `&next=${encodeURIComponent(lc)}` : ''}`);
    for (const l of d.listings || []) {
      totalListings += 1;
      const tid = String(l?.asset?.identifier || l?.protocol_data?.parameters?.offer?.[0]?.identifierOrCriteria || '');
      const c = l?.price?.current;
      if (tid && tokenIds.has(tid) && c) forAsset.push({ tokenId: tid.slice(0, 12) + '…', eth: Number(c.value) / 10 ** (c.decimals || 18), cur: c.currency });
    }
    lc = d.next || null; lp += 1;
    if (lp >= 120) { listCapped = Boolean(lc); break; }
  } while (lc);

  const prices = forAsset.map((x) => x.eth).sort((a, b) => a - b);
  return NextResponse.json({
    asset, collection: meta.collection, slug: col.osSlug,
    tokenIdsForAsset: tokenIds.size, sampleTokenIds: [...tokenIds].slice(0, 10).map((t) => t.slice(0, 12) + '…'),
    listingsFound: forAsset.length, cheapestEth: prices[0] ?? null, priceSample: prices.slice(0, 15),
    nftsEnumerated: nfts, enumCapped, totalListingsScanned: totalListings, listCapped,
  });
}
