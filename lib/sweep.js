import { unstable_cache, revalidateTag } from 'next/cache';
import { getCatalog } from './catalog';
import { getRates } from './rates';

// ─── "Where's this pepe cheapest?" sweep ──────────────────────────────────
// For every card we compare the cheapest WRAPPED price (Emblem on OpenSea, in
// ETH) against the cheapest NATIVE price (Counterparty dispenser, BTC→ETH).
//
//  • Wrapped floor: enumerate the collection's NFTs (name → asset) to map
//    listing tokenIds to cards, then take the cheapest listing per card.
//  • Native floor: sweep all open Counterparty dispensers, min "buy-now" price
//    per card, converted to ETH.
//
// ~50 sequential calls total — runs on a schedule (/api/cron/refresh); the
// result lives in Next.js's Data Cache. Reads serve it instantly.

const SLUG = 'rare-pepe-curated';
const OS = 'https://api.opensea.io/api/v2';
const CP = 'https://api.counterparty.io:4000/v2';
const TAG = 'wrapped-snapshot';
const NFT_MAX_PAGES = 320;
const LIST_MAX_PAGES = 100;
const DISP_MAX_PAGES = 80;

export const EMPTY_SNAPSHOT = {
  byAsset: {},
  stats: { nfts: 0, listings: 0, dispensers: 0, wrappedFloors: 0, nativeFloors: 0, comparable: 0, ready: false },
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

async function getJson(url, headers, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
      if (res.status === 429 || res.status >= 500) throw new Error(`http ${res.status}`);
      if (!res.ok) throw new Error(`http ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 400 * 2 ** i));
    }
  }
  throw lastErr;
}

// tokenId → asset, from NFT names.
async function enumerateNfts(assetSet) {
  const tokenToAsset = {};
  let cursor = null, pages = 0, nfts = 0;
  do {
    const url = `${OS}/collection/${SLUG}/nfts?limit=200${cursor ? `&next=${encodeURIComponent(cursor)}` : ''}`;
    const d = await getJson(url, osHeaders());
    for (const n of d.nfts || []) {
      const asset = parseAsset(n.name);
      if (!asset || (assetSet.size && !assetSet.has(asset))) continue;
      tokenToAsset[n.identifier] = asset;
      nfts += 1;
    }
    cursor = d.next || null;
    pages += 1;
  } while (cursor && pages < NFT_MAX_PAGES);
  return { tokenToAsset, nfts, capped: Boolean(cursor) };
}

// Cheapest active listing (ETH) per tokenId.
async function sweepListings() {
  const floorByToken = {};
  let cursor = null, pages = 0, listings = 0;
  do {
    const url = `${OS}/listings/collection/${SLUG}/best?limit=100${cursor ? `&next=${encodeURIComponent(cursor)}` : ''}`;
    const d = await getJson(url, osHeaders());
    for (const l of d.listings || []) {
      const tokenId = l?.asset?.identifier || l?.protocol_data?.parameters?.offer?.[0]?.identifierOrCriteria;
      const cur = l?.price?.current;
      if (!tokenId || !cur || !['ETH', 'WETH'].includes(cur.currency)) continue;
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

// Cheapest open Counterparty dispenser (in satoshis) per card.
// Excludes divisible assets (currencies like PEPECASH — not "cards") and dust
// dispensers (spam priced near zero), which otherwise pollute the comparison.
const DUST_SATS = 1000; // ~0.00001 BTC — below this is dust/spam
async function sweepDispensers(assetSet) {
  const floorSatsByAsset = {};
  const divisible = new Set();
  let cursor = null, pages = 0, dispensers = 0;
  do {
    const url = `${CP}/dispensers?status=open&verbose=true&limit=500${cursor ? `&cursor=${cursor}` : ''}`;
    const d = await getJson(url, { accept: 'application/json' });
    for (const disp of d.result || []) {
      const asset = String(disp.asset || '').toUpperCase();
      if (!assetSet.has(asset)) continue;
      if (disp.asset_info?.divisible === true) { divisible.add(asset); continue; }
      if (!(disp.give_remaining > 0)) continue;
      const sats = Number(disp.satoshi_price ?? disp.satoshirate);
      if (!(sats >= DUST_SATS)) continue;
      if (floorSatsByAsset[asset] == null || sats < floorSatsByAsset[asset]) floorSatsByAsset[asset] = sats;
      dispensers += 1;
    }
    cursor = d.next_cursor || null;
    pages += 1;
  } while (cursor && pages < DISP_MAX_PAGES);
  return { floorSatsByAsset, divisible, dispensers, capped: Boolean(cursor) };
}

async function buildSnapshot() {
  if (!process.env.OPENSEA_API_KEY) return EMPTY_SNAPSHOT;
  try {
    const catalog = await getCatalog().catch(() => []);
    const assetSet = new Set(catalog.map((c) => c.asset));

    const [nftRes, listRes, dispRes, rates] = await Promise.all([
      enumerateNfts(assetSet),
      sweepListings(),
      sweepDispensers(assetSet),
      getRates().catch(() => ({ btcEth: null })),
    ]);

    // Wrapped floor per asset (join listings → tokenId → asset).
    const wrappedByAsset = {};
    for (const [tokenId, eth] of Object.entries(listRes.floorByToken)) {
      const asset = nftRes.tokenToAsset[tokenId];
      if (!asset) continue;
      if (wrappedByAsset[asset] == null || eth < wrappedByAsset[asset]) wrappedByAsset[asset] = eth;
    }

    // Native floor per asset (sats → BTC → ETH).
    const nativeByAsset = {};
    const btcEth = rates.btcEth;
    if (btcEth) {
      for (const [asset, sats] of Object.entries(dispRes.floorSatsByAsset)) {
        nativeByAsset[asset] = (sats / 1e8) * btcEth;
      }
    }

    const byAsset = {};
    let comparable = 0;
    const assets = new Set([...Object.keys(wrappedByAsset), ...Object.keys(nativeByAsset)]);
    for (const a of assets) {
      if (dispRes.divisible.has(a)) continue; // skip currencies (PEPECASH, etc.)
      const wrappedFloorEth = wrappedByAsset[a] ?? null;
      const nativeFloorEth = nativeByAsset[a] ?? null;
      let cheaper = null, savingsPct = null;
      if (wrappedFloorEth != null && nativeFloorEth != null) {
        const lo = Math.min(wrappedFloorEth, nativeFloorEth);
        const hi = Math.max(wrappedFloorEth, nativeFloorEth);
        cheaper = wrappedFloorEth < nativeFloorEth ? 'wrapped' : (nativeFloorEth < wrappedFloorEth ? 'native' : 'equal');
        savingsPct = hi > 0 ? ((hi - lo) / hi) * 100 : 0;
        comparable += 1;
      }
      byAsset[a] = { wrappedFloorEth, nativeFloorEth, cheaper, savingsPct };
    }

    return {
      byAsset,
      stats: {
        nfts: nftRes.nfts,
        listings: listRes.listings,
        dispensers: dispRes.dispensers,
        wrappedFloors: Object.keys(wrappedByAsset).length,
        nativeFloors: Object.keys(nativeByAsset).length,
        comparable,
        divisibleExcluded: dispRes.divisible.size,
        nftsCapped: nftRes.capped,
        ready: true,
      },
      builtAt: new Date().toISOString(),
    };
  } catch (e) {
    return { ...EMPTY_SNAPSHOT, error: String(e) };
  }
}

export const getWrappedSnapshot = unstable_cache(
  buildSnapshot,
  ['wrapped-snapshot-v2'],
  { revalidate: 3 * 60 * 60, tags: [TAG] },
);

export async function peekWrappedSnapshot() {
  return Promise.race([
    getWrappedSnapshot().catch(() => EMPTY_SNAPSHOT),
    new Promise((resolve) => setTimeout(() => resolve(EMPTY_SNAPSHOT), 4000)),
  ]);
}

export async function refreshWrappedSnapshot() {
  revalidateTag(TAG);
  return getWrappedSnapshot();
}
