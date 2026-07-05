import { memo, TTL } from './cache';
import { KEPT_COLLECTION_NAMES, PEPEWTF_TO_ID } from './collections';

const PEPE_WTF = 'https://pepe.wtf/api/assets';

// The tracked collections (Rare Pepes + Fake Rares). pepe.wtf returns every
// collection in one payload; we keep the tracked ones and tag each card with
// its collection id.
export async function getCatalog() {
  return memo('catalog:v2', TTL.CATALOG, async () => {
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
      .filter((c) => KEPT_COLLECTION_NAMES.has(c.collectionName))
      .map(normalize)
      .sort((a, b) => (a.series - b.series) || (a.card - b.card));
  });
}

// Just one collection's cards.
export async function getCatalogFor(collectionId) {
  const cards = await getCatalog();
  return cards.filter((c) => c.collection === collectionId);
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
    collection: PEPEWTF_TO_ID[c.collectionName] || 'rare-pepe',
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
