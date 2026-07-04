import { memo, TTL } from './cache';
import { peekWrappedSnapshot } from './sweep';

// Cheapest-location data: per card, the wrapped floor (Emblem/OpenSea) and the
// native floor (Counterparty dispenser), both in ETH, plus which is cheaper.
// Built by the scheduled sweep (lib/sweep.js) and served from the Data Cache.

const SLUG = 'rare-pepe-curated';
const OS_STATS = `https://api.opensea.io/api/v2/collections/${SLUG}/stats`;

export function hasOpenSeaKey() {
  return Boolean(process.env.OPENSEA_API_KEY);
}

// Collection-wide wrapped floor (keyless) — context / fallback.
export async function getCollectionFloor() {
  return memo('wrapped:collectionFloor', TTL.WRAPPED, async () => {
    try {
      const res = await fetch(OS_STATS, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
      if (!res.ok) throw new Error(`opensea ${res.status}`);
      const d = await res.json();
      const floor = Number(d?.total?.floor_price);
      return { floorEth: Number.isFinite(floor) && floor > 0 ? floor : null, ok: true };
    } catch (e) {
      return { floorEth: null, ok: false, error: String(e) };
    }
  });
}

// Full per-card comparison map { ASSET: { wrappedFloorEth, nativeFloorEth, cheaper, savingsPct } }.
export async function getFloorsByAsset() {
  const snap = await peekWrappedSnapshot();
  return snap.byAsset || {};
}

// Per-card comparison for the detail page.
export async function getWrappedForCard(asset) {
  const key = String(asset || '').toUpperCase();
  const [collection, snap] = await Promise.all([getCollectionFloor(), peekWrappedSnapshot()]);
  const entry = snap.byAsset?.[key] || null;
  return {
    asset: key,
    wrappedFloorEth: entry?.wrappedFloorEth ?? null,
    nativeFloorEth: entry?.nativeFloorEth ?? null,
    cheaper: entry?.cheaper ?? null,
    savingsPct: entry?.savingsPct ?? null,
    highestOfferEth: entry?.highestOfferEth ?? null,
    collectionFloorEth: collection.floorEth,
    ready: Boolean(snap.stats?.ready),
  };
}

// Diagnostics for /api/status.
export async function getWrappedStatus() {
  if (!hasOpenSeaKey()) return { hasKey: false, ok: false, reason: 'OPENSEA_API_KEY not set' };
  const snap = await peekWrappedSnapshot();
  const byAsset = snap.byAsset || {};
  const samples = ['RAREPEPE', 'PEPECASH', 'FEELSGOODMAN', 'DANKPEPE']
    .filter((a) => a in byAsset)
    .map((a) => ({ asset: a, ...byAsset[a] }));
  return { hasKey: true, ok: Boolean(snap.stats?.ready), builtAt: snap.builtAt ?? null, ...snap.stats, samples };
}
