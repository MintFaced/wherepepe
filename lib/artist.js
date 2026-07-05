import { getCatalog } from './catalog';
import { getFloorsByAsset } from './wrapped';

// Every Rare Pepe by a given artist, valued at the wrapped floor, with a total
// market cap (floor × issued supply, summed).
export async function artistCollection(name) {
  const target = String(name || '').trim().toLowerCase();
  const [catalog, floors] = await Promise.all([
    getCatalog().catch(() => []),
    getFloorsByAsset().catch(() => ({})),
  ]);

  let displayName = String(name || '');
  const cards = [];
  let marketCapEth = 0;
  for (const c of catalog) {
    if ((c.artist || '').trim().toLowerCase() !== target) continue;
    displayName = c.artist || displayName;
    const floorEth = floors[c.asset]?.wrappedFloorEth ?? null;
    if (floorEth) marketCapEth += floorEth * (c.supply || 0);
    cards.push({
      asset: c.asset,
      title: c.title,
      series: c.series ?? null,
      card: c.card ?? null,
      image: c.image,
      supply: c.supply,
      floorEth,
    });
  }
  cards.sort((a, b) => (a.series - b.series) || (a.card - b.card));

  const seriesSet = new Set(cards.map((c) => c.series).filter((s) => s != null));
  return { name: displayName, count: cards.length, seriesCount: seriesSet.size, marketCapEth, cards };
}
