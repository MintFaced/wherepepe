import { memo, TTL } from './cache';
import { getCatalog } from './catalog';
import { getFloorsByAsset } from './wrapped';
import { getProfile, identityFor, getArtist } from './chat';

// A wallet's Rare Pepe collection: the cards it owns (OpenSea rare-pepe-curated),
// enriched with catalog metadata (series/card/art) and per-card value (the
// wrapped floor from our snapshot), plus the wallet's ChatPepe identity.

async function fetchOwnedAssets(address) {
  const key = process.env.OPENSEA_API_KEY;
  if (!key) return new Map();
  const owned = new Map(); // asset -> { image }
  let cursor = null, pages = 0;
  do {
    const url = `https://api.opensea.io/api/v2/chain/ethereum/account/${address}/nfts?collection=rare-pepe-curated&limit=200${cursor ? `&next=${encodeURIComponent(cursor)}` : ''}`;
    let d;
    try {
      const res = await fetch(url, { headers: { accept: 'application/json', 'x-api-key': key }, signal: AbortSignal.timeout(12000) });
      if (!res.ok) break;
      d = await res.json();
    } catch {
      break;
    }
    for (const n of d.nfts || []) {
      const asset = String(n.name || '').split('|')[0].trim().toUpperCase();
      if (!/^[A-Z0-9._-]{1,40}$/.test(asset)) continue;
      if (!owned.has(asset)) owned.set(asset, { image: n.image_url || n.display_image_url || null });
    }
    cursor = d.next || null;
    pages += 1;
  } while (cursor && pages < 12);
  return owned;
}

export async function walletCollection(address) {
  const addr = String(address).toLowerCase();
  return memo(`wallet:${addr}`, 5 * 60 * 1000, async () => {
    const [owned, catalog, floors, profile, artist] = await Promise.all([
      fetchOwnedAssets(addr),
      getCatalog().catch(() => []),
      getFloorsByAsset().catch(() => ({})),
      getProfile(addr).catch(() => null),
      getArtist(addr).catch(() => null),
    ]);

    const catMap = new Map(catalog.map((c) => [c.asset, c]));
    const cards = [];
    let totalValueEth = 0;
    for (const [asset, o] of owned) {
      const meta = catMap.get(asset);
      const floorEth = floors[asset]?.wrappedFloorEth ?? null;
      if (floorEth) totalValueEth += floorEth;
      cards.push({
        asset,
        title: meta?.title || asset,
        series: meta?.series ?? null,
        card: meta?.card ?? null,
        image: meta?.image || o.image || null,
        floorEth,
      });
    }

    const ident = identityFor(addr);
    return {
      address: addr,
      handle: profile?.handle || ident.handle,
      avatar: ident.avatar,
      pfp: profile?.pfpImage || null,
      artist: artist || null,
      count: cards.length,
      totalValueEth,
      cards,
    };
  });
}
