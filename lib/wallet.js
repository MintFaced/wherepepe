import { memo } from './cache';
import { getCatalog } from './catalog';
import { getFloorsByAsset } from './wrapped';
import { getProfile, identityFor, getArtist } from './chat';
import { getWalletVaults } from './emblem';

// A wallet's Rare Pepe collection — sourced from its **Emblem Vaults**
// (editions come free from grouping vaults by card), enriched with catalog
// metadata (series/card/art) and per-card value (the wrapped floor).

export async function walletCollection(address) {
  const addr = String(address).toLowerCase();
  return memo(`wallet:${addr}`, 5 * 60 * 1000, async () => {
    const [vaults, catalog, floors, profile, artist] = await Promise.all([
      getWalletVaults(addr),
      getCatalog().catch(() => []),
      getFloorsByAsset().catch(() => ({})),
      getProfile(addr).catch(() => null),
      getArtist(addr).catch(() => null),
    ]);

    const catMap = new Map(catalog.map((c) => [c.asset, c]));
    const imgFor = new Map(vaults.rarePepe.map((v) => [v.asset, v.image]));
    const cards = [];
    let totalValueEth = 0;
    let editionsTotal = 0;
    for (const [asset, editions] of Object.entries(vaults.editions)) {
      const meta = catMap.get(asset);
      const floorEth = floors[asset]?.wrappedFloorEth ?? null;
      if (floorEth) totalValueEth += floorEth * editions;
      editionsTotal += editions;
      cards.push({
        asset,
        title: meta?.title || asset,
        series: meta?.series ?? null,
        card: meta?.card ?? null,
        image: meta?.image || imgFor.get(asset) || null,
        floorEth,
        editions,
      });
    }

    const ident = identityFor(addr);
    return {
      address: addr,
      handle: profile?.handle || ident.handle,
      avatar: ident.avatar,
      pfp: profile?.pfpImage || null,
      artist: artist || null,
      count: cards.length,       // unique cards
      editionsTotal,             // total Rare Pepes held
      vaultTotal: vaults.total,  // total Emblem vaults (all collections)
      totalValueEth,
      cards,
    };
  });
}
