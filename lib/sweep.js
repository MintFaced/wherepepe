import { unstable_cache, revalidateTag } from 'next/cache';
import { getCatalog } from './catalog';

// ─── OpenSea collection sweep ─────────────────────────────────────────────
// Per-card wrapped data (count + floor) requires a tokenId→asset index, which
// only comes from enumerating the collection's NFTs (the NFT *name* encodes the
// card, e.g. "RAREPEPE | Series 1 Card 1"). Listings give tokenId + price but
// not the asset, so we join them through that index.
//
// This is ~190 sequential API calls — far too heavy for a page request. It runs
// on a schedule (see /api/cron/refresh) and the result is stored in Next.js's
// Data Cache (persistent on Vercel). Reads serve the cached snapshot instantly.

const SLUG = 'rare-pepe-curated';
const OS = 'https://api.opensea.io/api/v2';
const TAG = 'wrapped-snapshot';
const NFT_MAX_PAGES = 320;   // ~64k NFTs @ 200/page — safety cap
const LIST_MAX_PAGES = 100;  // ~10k listings @ 100/page — safety cap

export const EMPTY_SNAPSHOT = {
  byAsset: {},
  stats: { nfts: 0, listings: 0, assetsWithCount: 0, assetsWithFloor: 0, ready: false },
  builtAt: null,
};

function osHeaders() {
  const h = { accept: 'application/json' };
  if (process.env.OPENSEA_API_KEY) h['x-api-key'] = process.env.OPENSEA_API_KEY;
  return h;
}

// The Counterparty asset is the NFT name prefix before the first "|".
function parseAsset(name) {
  if (!name) return null;
  const prefix = String(name).split('|')[0].trim().toUpperCase();
  return /^[A-Z0-9._-]{1,40}$/.test(prefix) ? prefix : null;
}

// GET with retry/backoff for 429 + transient 5xx (OpenSea rate limits).
async function osGet(url, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: osHeaders(), signal: AbortSignal.timeout(20000) });
      if (res.status === 429 || res.status >= 500) throw new Error(`http ${res.status}`);
      if (!res.ok) throw new Error(`http ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      // Backoff: 0.4s, 0.8s, 1.6s
      await new Promise((r) => setTimeout(r, 400 * 2 ** i));
    }
  }
  throw lastErr;
}

async function enumerateNfts(assetSet) {
  const tokenToAsset = {};
  const countByAsset = {};
  let cursor = null, pages = 0, nfts = 0;
  do {
    const url = `${OS}/collection/${SLUG}/nfts?limit=200${cursor ? `&next=${encodeURIComponent(cursor)}` : ''}`;
    const d = await osGet(url);
    for (const n of d.nfts || []) {
      const asset = parseAsset(n.name);
      if (!asset || (assetSet.size && !assetSet.has(asset))) continue;
      tokenToAsset[n.identifier] = asset;
      countByAsset[asset] = (countByAsset[asset] || 0) + 1;
      nfts += 1;
    }
    cursor = d.next || null;
    pages += 1;
  } while (cursor && pages < NFT_MAX_PAGES);
  return { tokenToAsset, countByAsset, nfts, capped: Boolean(cursor) };
}

async function sweepListings() {
  const floorByToken = {};
  let cursor = null, pages = 0, listings = 0;
  do {
    const url = `${OS}/listings/collection/${SLUG}/best?limit=100${cursor ? `&next=${encodeURIComponent(cursor)}` : ''}`;
    const d = await osGet(url);
    for (const l of d.listings || []) {
      const tokenId = l?.asset?.identifier || l?.protocol_data?.parameters?.offer?.[0]?.identifierOrCriteria;
      const cur = l?.price?.current;
      if (!tokenId || !cur) continue;
      if (!['ETH', 'WETH'].includes(cur.currency)) continue;
      const eth = Number(cur.value) / 10 ** (cur.decimals || 18);
      if (!(eth > 0)) continue;
      if (floorByToken[tokenId] == null || eth < floorByToken[tokenId]) floorByToken[tokenId] = eth;
      listings += 1;
    }
    cursor = d.next || null;
    pages += 1;
  } while (cursor && pages < LIST_MAX_PAGES);
  return { floorByToken, listings, capped: Boolean(cursor) };
}

// The heavy build. Only runs when triggered (cron) or on a cold read.
async function buildSnapshot() {
  if (!process.env.OPENSEA_API_KEY) return EMPTY_SNAPSHOT;
  try {
    const catalog = await getCatalog().catch(() => []);
    const assetSet = new Set(catalog.map((c) => c.asset));

    // NFT enumeration and listings sweep are independent — run concurrently.
    const [nftRes, listRes] = await Promise.all([enumerateNfts(assetSet), sweepListings()]);

    const floorByAsset = {};
    for (const [tokenId, eth] of Object.entries(listRes.floorByToken)) {
      const asset = nftRes.tokenToAsset[tokenId];
      if (!asset) continue;
      if (floorByAsset[asset] == null || eth < floorByAsset[asset]) floorByAsset[asset] = eth;
    }

    const byAsset = {};
    const assets = new Set([...Object.keys(nftRes.countByAsset), ...Object.keys(floorByAsset)]);
    for (const a of assets) {
      byAsset[a] = { count: nftRes.countByAsset[a] ?? null, floorEth: floorByAsset[a] ?? null };
    }

    return {
      byAsset,
      stats: {
        nfts: nftRes.nfts,
        listings: listRes.listings,
        assetsWithCount: Object.keys(nftRes.countByAsset).length,
        assetsWithFloor: Object.keys(floorByAsset).length,
        nftsCapped: nftRes.capped,
        listingsCapped: listRes.capped,
        ready: true,
      },
      builtAt: new Date().toISOString(),
    };
  } catch (e) {
    return { ...EMPTY_SNAPSHOT, error: String(e) };
  }
}

// Cached accessor — served from Vercel's persistent Data Cache. Time-based
// revalidate serves stale-while-revalidate so reads never block once warm.
export const getWrappedSnapshot = unstable_cache(
  buildSnapshot,
  ['wrapped-snapshot-v1'],
  { revalidate: 3 * 60 * 60, tags: [TAG] },
);

// Reads use this: never block on a cold build — return empty fast if not ready.
export async function peekWrappedSnapshot() {
  return Promise.race([
    getWrappedSnapshot().catch(() => EMPTY_SNAPSHOT),
    new Promise((resolve) => setTimeout(() => resolve(EMPTY_SNAPSHOT), 4000)),
  ]);
}

// Cron uses this: force a fresh rebuild and warm the cache.
export async function refreshWrappedSnapshot() {
  revalidateTag(TAG);
  return getWrappedSnapshot();
}
