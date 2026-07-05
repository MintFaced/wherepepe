import { memo } from './cache';
import { getCatalog } from './catalog';
import { getFloorsByAsset } from './wrapped';
import { getProfile, identityFor, getArtist } from './chat';
import { getWalletVaults } from './emblem';

const CP = 'https://api.counterparty.io:4000/v2';

// Rare Pepes held natively on a Counterparty (BTC) address — the "free wallet".
async function getNativeHoldings(xcpAddress) {
  return memo(`native:${xcpAddress}`, 5 * 60 * 1000, async () => {
    const catalog = await getCatalog().catch(() => []);
    const rpSet = new Set(catalog.map((c) => c.asset));
    const holdings = {};
    let cursor = null, pages = 0;
    do {
      const url = `${CP}/addresses/${encodeURIComponent(xcpAddress)}/balances?verbose=true&limit=500${cursor ? `&cursor=${cursor}` : ''}`;
      let d;
      try {
        const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
        if (!res.ok) break;
        d = await res.json();
      } catch {
        break;
      }
      for (const b of d.result || []) {
        const asset = String(b.asset || '').toUpperCase();
        if (!rpSet.has(asset)) continue; // catalog membership = it's a Rare Pepe
        // Use the normalized quantity so divisible cards (e.g. NAKAMOTOCARD)
        // count correctly. Round to whole "copies held".
        const qty = Math.round(Number(b.quantity_normalized ?? b.quantity) || 0);
        if (qty > 0) holdings[asset] = (holdings[asset] || 0) + qty;
      }
      cursor = d.next_cursor || null;
      pages += 1;
    } while (cursor && pages < 10);
    return holdings;
  });
}

// Full profile + collection. Profile (handle/pfp/artist/xcp) is read fresh so
// chat edits flow through immediately; the heavier collection is cached, keyed
// by the linked XCP address so linking a wallet busts it.
export async function walletCollection(address) {
  const addr = String(address).toLowerCase();
  const [profile, artist] = await Promise.all([
    getProfile(addr).catch(() => null),
    getArtist(addr).catch(() => null),
  ]);
  const xcp = profile?.xcp || null;

  const collection = await memo(`wallet:cards:${addr}:${xcp || ''}`, 5 * 60 * 1000, async () => {
    const [vaults, catalog, floors, native] = await Promise.all([
      getWalletVaults(addr),
      getCatalog().catch(() => []),
      getFloorsByAsset().catch(() => ({})),
      xcp ? getNativeHoldings(xcp) : Promise.resolve({}),
    ]);

    const catMap = new Map(catalog.map((c) => [c.asset, c]));
    const imgFor = new Map(vaults.rarePepe.map((v) => [v.asset, v.image]));
    const assets = new Set([...Object.keys(vaults.editions), ...Object.keys(native)]);
    const cards = [];
    let totalValueEth = 0, wrappedTotal = 0, nativeTotal = 0;
    for (const asset of assets) {
      const wrapped = vaults.editions[asset] || 0;
      const nat = native[asset] || 0;
      const meta = catMap.get(asset);
      const floorEth = floors[asset]?.wrappedFloorEth ?? null;
      if (floorEth) totalValueEth += floorEth * (wrapped + nat);
      wrappedTotal += wrapped;
      nativeTotal += nat;
      cards.push({
        asset,
        title: meta?.title || asset,
        series: meta?.series ?? null,
        card: meta?.card ?? null,
        image: meta?.image || imgFor.get(asset) || null,
        floorEth,
        wrapped,
        native: nat,
      });
    }
    return {
      count: cards.length,
      editionsTotal: wrappedTotal + nativeTotal,
      wrappedTotal,
      nativeTotal,
      vaultTotal: vaults.total,
      totalValueEth,
      cards,
    };
  });

  const ident = identityFor(addr);
  return {
    address: addr,
    handle: profile?.handle || ident.handle,
    avatar: ident.avatar,
    pfp: profile?.pfpImage || null,
    artist: artist || null,
    xcp,
    ...collection,
  };
}
