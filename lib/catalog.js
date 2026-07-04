import { memo, TTL } from './cache';

const PEPE_WTF = 'https://pepe.wtf/api/assets';
const RARE_PEPE_COLLECTION = 'Rare Pepes';

// The canonical Rare Pepe Directory: 1,774 cards across 36 series.
// pepe.wtf returns every collection in one payload; we filter to the
// official "Rare Pepes" set and normalize to our own shape.
export async function getCatalog() {
  return memo('catalog', TTL.CATALOG, async () => {
    const res = await fetch(PEPE_WTF, {
      headers: {
        'user-agent': 'where-pepe/1.0 (+https://where-pepe.vercel.app)',
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`pepe.wtf ${res.status}`);
    const all = await res.json();
    if (!Array.isArray(all)) throw new Error('pepe.wtf: unexpected shape');
    return all
      .filter((c) => c.collectionName === RARE_PEPE_COLLECTION)
      .map(normalize)
      .sort((a, b) => (a.series - b.series) || (a.card - b.card));
  });
}

export async function getCardMeta(asset) {
  const key = String(asset || '').toUpperCase();
  const cards = await getCatalog();
  return cards.find((c) => c.asset === key) || null;
}

export async function getSeriesList() {
  const cards = await getCatalog();
  const map = new Map();
  for (const c of cards) {
    if (c.series == null) continue;
    map.set(c.series, (map.get(c.series) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([series, count]) => ({ series, count }));
}

function normalize(c) {
  return {
    asset: String(c.name || '').toUpperCase(),
    title: c.title || c.name || '',
    series: intOrNull(c.serie),
    card: intOrNull(c.card),
    supply: Number(c.supply) || 0,
    artist: c.artist || null,
    issuer: c.issuer || null,
    issuance: c.issuance || null,
    image: c.imageUrl || c.mediaUrl || null,
    media: c.mediaUrl || c.imageUrl || null,
    tokenUrl: c.tokenUrl || (c.name ? `https://pepe.wtf/asset/${c.name}` : null),
  };
}

function intOrNull(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}
