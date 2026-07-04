import { memo, TTL } from './cache';
import { peekWrappedSnapshot } from './sweep';

// Wrapped side = Rare Pepes held in Emblem Vaults, traded on OpenSea's
// "rare-pepe-curated" collection.
//
//  • Per-card count + per-card floor: from the scheduled sweep snapshot
//    (lib/sweep.js) — built by /api/cron/refresh, served from the Data Cache.
//  • Collection-level floor: keyless fallback (OpenSea v2 public stats) shown
//    when a card has no active listing of its own.
//
// OpenSea floors are already ETH-denominated.

const SLUG = 'rare-pepe-curated';
const OS_STATS = `https://api.opensea.io/api/v2/collections/${SLUG}/stats`;

export function hasOpenSeaKey() {
  return Boolean(process.env.OPENSEA_API_KEY);
}

// Collection-wide floor (cheapest wrapped Rare Pepe overall), in ETH. Keyless.
export async function getCollectionFloor() {
  return memo('wrapped:collectionFloor', TTL.WRAPPED, async () => {
    try {
      const res = await fetch(OS_STATS, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) throw new Error(`opensea ${res.status}`);
      const d = await res.json();
      const floor = Number(d?.total?.floor_price);
      return {
        floorEth: Number.isFinite(floor) && floor > 0 ? floor : null,
        owners: Number(d?.total?.num_owners) || null,
        ok: true,
      };
    } catch (e) {
      return { floorEth: null, owners: null, ok: false, error: String(e) };
    }
  });
}

// Full per-card map { ASSET: { count, floorEth } } from the snapshot.
export async function getWrappedByAsset() {
  const snap = await peekWrappedSnapshot();
  return snap.byAsset || {};
}

// Per-card wrapped data used by the gallery + detail page.
export async function getWrappedForCard(asset) {
  const key = String(asset || '').toUpperCase();
  const [collection, snap] = await Promise.all([getCollectionFloor(), peekWrappedSnapshot()]);
  const entry = snap.byAsset?.[key] || null;
  return {
    asset: key,
    count: entry?.count ?? null,
    floorEth: entry?.floorEth ?? null,          // per-card wrapped floor
    collectionFloorEth: collection.floorEth,    // fallback / context
    source: entry ? 'sweep' : (snap.stats?.ready ? 'no-listing' : 'pending'),
  };
}

// Diagnostics for /api/status.
export async function getWrappedStatus() {
  if (!hasOpenSeaKey()) return { hasKey: false, ok: false, reason: 'OPENSEA_API_KEY not set' };
  const snap = await peekWrappedSnapshot();
  const byAsset = snap.byAsset || {};
  const samples = ['RAREPEPE', 'PEPECASH', 'NAKAMOTOCARD', 'FEELSGOODMAN']
    .filter((a) => a in byAsset)
    .map((a) => ({ asset: a, ...byAsset[a] }));
  return {
    hasKey: true,
    ok: Boolean(snap.stats?.ready),
    builtAt: snap.builtAt ?? null,
    ...snap.stats,
    samples,
  };
}
