import { memo, TTL } from './cache';
import { getCatalog } from './catalog';

// Wrapped side = Rare Pepes held in Emblem Vaults, traded on OpenSea's
// "rare-pepe-curated" collection.
//
//  • Collection-level floor: keyless (OpenSea v2 public stats).
//  • Per-card wrapped COUNT: keyed — derived from the collection's trait
//    distribution (/api/v2/traits). One call covers all 1,774 cards.
//  • Per-card wrapped FLOOR: still collection-level for now; a true per-card
//    Emblem floor needs per-item listing enumeration (tracked for a later pass).
//
// OpenSea floors are already ETH-denominated, so no conversion is needed.

const SLUG = 'rare-pepe-curated';
const OS = 'https://api.opensea.io/api/v2';
const OS_STATS = `${OS}/collections/${SLUG}/stats`;
const OS_TRAITS = `${OS}/traits/${SLUG}`;

export function hasOpenSeaKey() {
  return Boolean(process.env.OPENSEA_API_KEY);
}

function osHeaders() {
  const h = { accept: 'application/json' };
  if (process.env.OPENSEA_API_KEY) h['x-api-key'] = process.env.OPENSEA_API_KEY;
  return h;
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

// Per-card wrapped counts, derived from the collection's trait distribution.
//
// We don't hard-code which trait names the card (it could be "Card", an asset
// trait, etc.). Instead we score every trait category by how many of its values
// match real Rare Pepe asset names, and use the best match. This self-corrects
// regardless of OpenSea's exact trait naming.
export async function getWrappedCounts() {
  if (!hasOpenSeaKey()) return { byAsset: {}, ok: false, reason: 'no-key' };

  return memo('wrapped:counts', 6 * 60 * 60 * 1000, async () => {
    try {
      const [traitsRes, catalog] = await Promise.all([
        fetch(OS_TRAITS, { headers: osHeaders(), signal: AbortSignal.timeout(15000) }),
        getCatalog().catch(() => []),
      ]);
      if (!traitsRes.ok) throw new Error(`opensea traits ${traitsRes.status}`);
      const data = await traitsRes.json();

      // OpenSea v2 traits shape is documented as { categories, counts:{trait:{value:count}} },
      // but we don't rely on that: find the trait->{value:count} map wherever it lives.
      const counts = extractTraitCounts(data);
      const assetSet = new Set(catalog.map((c) => c.asset));

      let bestTrait = null;
      let bestOverlap = 0;
      let bestMap = {};
      for (const [trait, values] of Object.entries(counts)) {
        if (!values || typeof values !== 'object') continue;
        const map = {};
        let overlap = 0;
        for (const [value, count] of Object.entries(values)) {
          const key = String(value).toUpperCase();
          if (assetSet.has(key)) {
            map[key] = (map[key] || 0) + Number(count || 0);
            overlap += 1;
          }
        }
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          bestTrait = trait;
          bestMap = map;
        }
      }

      return {
        byAsset: bestMap,
        traitUsed: bestTrait,
        matched: bestOverlap,
        ok: bestOverlap > 0,
      };
    } catch (e) {
      return { byAsset: {}, ok: false, error: String(e) };
    }
  });
}

// Locate the { traitName: { value: count } } structure in an OpenSea traits
// response without assuming the exact top-level key. Falls back to scanning
// for the first object whose values are objects-of-numbers.
function extractTraitCounts(data) {
  if (!data || typeof data !== 'object') return {};
  const looksLikeTraitMap = (obj) =>
    obj && typeof obj === 'object' &&
    Object.values(obj).some(
      (v) => v && typeof v === 'object' &&
        Object.values(v).some((n) => typeof n === 'number'),
    );
  if (looksLikeTraitMap(data.counts)) return data.counts;
  for (const val of Object.values(data)) {
    if (looksLikeTraitMap(val)) return val;
  }
  return {};
}

// Diagnostics: what did the wrapped-count wiring actually resolve to? Used by
// /api/status so a blind deploy can be verified at a glance.
export async function getWrappedStatus() {
  if (!hasOpenSeaKey()) {
    return { hasKey: false, ok: false, reason: 'OPENSEA_API_KEY not set' };
  }
  const counts = await getWrappedCounts().catch((e) => ({ ok: false, error: String(e) }));
  const byAsset = counts.byAsset || {};
  const samples = ['RAREPEPE', 'PEPECASH', 'NAKAMOTOCARD', 'FEELSGOODMAN']
    .filter((a) => a in byAsset)
    .map((a) => ({ asset: a, wrapped: byAsset[a] }));
  return {
    hasKey: true,
    ok: Boolean(counts.ok),
    traitUsed: counts.traitUsed ?? null,
    cardsMatched: counts.matched ?? 0,
    samples,
    error: counts.error ?? null,
  };
}

// Per-card wrapped data used by the gallery + detail page.
export async function getWrappedForCard(asset /*, supply */) {
  const key = String(asset || '').toUpperCase();
  const [collection, counts] = await Promise.all([
    getCollectionFloor(),
    getWrappedCounts().catch(() => ({ byAsset: {}, ok: false })),
  ]);

  const count = counts.ok && key in counts.byAsset ? counts.byAsset[key] : null;

  return {
    asset: key,
    count,                                   // exact wrapped count (OpenSea traits)
    floorEth: null,                          // per-card wrapped floor — later pass
    collectionFloorEth: collection.floorEth,
    source: count != null ? 'opensea-traits' : (hasOpenSeaKey() ? 'opensea-nomatch' : 'collection'),
  };
}
