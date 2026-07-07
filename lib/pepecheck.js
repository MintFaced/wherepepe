// PepeCheck — verification + classification on top of WherePepe's audited
// Emblem integration. SERVER-SIDE ONLY. Reuses lib/emblemVault.js (vaultStatus)
// and lib/curatedAssets.js (allow-list); adds the badge-state machine, the
// Neon-backed index, and OpenSea listing ingestion for the legacy contract.

import { neon } from '@neondatabase/serverless';
import { vaultStatus } from './emblemVault';
import { lookupBundled } from './curatedAssets';
import bundled from './curatedAssets.json';
import { COLLECTIONS, CONTRACT_TO_ID } from './collections';

export const LEGACY_CONTRACT = '0x82c7a8f707110f5fbb16184a5933e9f78a34c6ab';

export const PC_STATES = {
  verified: { label: 'VERIFIED', emoji: '✅', blurb: 'Contents match the claim — Emblem shows the card loaded in this vault.' },
  loading: { label: 'NOT LOADED', emoji: '🟡', blurb: 'The card is confirmed on Counterparty at the vault address, but Emblem hasn’t loaded it yet. Fine to watch, risky to buy until it flips green.' },
  empty: { label: 'EMPTY', emoji: '⚠️', blurb: 'Nothing found at this vault’s addresses. Do not buy expecting a card.' },
  mismatch: { label: 'MISMATCH', emoji: '⛔', blurb: 'What’s inside doesn’t match what the vault claims. This is the classic vault scam pattern — walk away.' },
  other: { label: 'NOT A PEPE', emoji: '·', blurb: 'This vault isn’t a Rare Pepe or Fake Rares card, so PepeCheck doesn’t track it (yet).' },
};

// ---------- verification ----------

// Word-boundary matcher for classifying legacy-vault titles (longest first so
// PEPECASHX can't be claimed by PEPECASH).
const _names = Object.keys(bundled).sort((a, b) => b.length - a.length);
const _cardRe = new RegExp(`\\b(${_names.join('|')})\\b`, 'i');
export function matchCardInText(text) {
  const m = String(text || '').match(_cardRe);
  return m ? m[1].toUpperCase() : null;
}

// Full verification of one vault → badge state.
// { state, card, collection, contents, btcAddress, recordedProject,
//   expectedProject, loaded, source, image, checkedAt }
export async function verifyVault(tokenId, { nudge = true } = {}) {
  const s = await vaultStatus(tokenId, { nudge });
  const card = s.asset || '';
  const known = card ? lookupBundled(card) : null;

  if (!known) {
    return { state: 'other', card: card || null, collection: null, contents: [], btcAddress: '', recordedProject: s.recordedProject || '', expectedProject: '', loaded: false, source: s.source, image: '', checkedAt: new Date().toISOString() };
  }

  const containsCard = (s.values || []).some((c) => String(c?.name || '').toUpperCase() === card && Number(c?.balance ?? 1) >= 1);
  let state;
  if (s.mismatch) state = 'mismatch';                       // wrong collection — can never mint/unwrap cleanly
  else if (s.loaded && containsCard) state = 'verified';
  else if (s.loaded && !containsCard) state = 'mismatch';   // loaded with the WRONG thing
  else if (!s.loaded && containsCard) state = 'loading';    // on-chain, not indexed by Emblem
  else if (!s.loaded && (s.values || []).length) state = 'mismatch';
  else state = 'empty';

  return {
    state, card, collection: known.collection, contents: s.values || [],
    btcAddress: s.btcAddress || '', recordedProject: s.recordedProject || '',
    expectedProject: s.expectedProject || '', loaded: s.loaded, source: s.source,
    image: known.image, checkedAt: new Date().toISOString(),
  };
}

// ---------- Neon index ----------

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
export function hasPcDb() { return Boolean(sql); }
export { sql };

export async function upsertVault(tokenId, contract, v) {
  if (!sql) return;
  await sql`
    INSERT INTO pc_vaults (token_id, contract, card, collection, state, contents, btc_address, recorded_project, expected_project, verified_at, history)
    VALUES (${tokenId}, ${contract}, ${v.card}, ${v.collection}, ${v.state}, ${JSON.stringify(v.contents)}, ${v.btcAddress}, ${v.recordedProject}, ${v.expectedProject}, now(),
            jsonb_build_array(jsonb_build_object('state', ${v.state}, 'at', now())))
    ON CONFLICT (token_id) DO UPDATE SET
      card = EXCLUDED.card, collection = EXCLUDED.collection, state = EXCLUDED.state,
      contents = EXCLUDED.contents, btc_address = EXCLUDED.btc_address,
      recorded_project = EXCLUDED.recorded_project, expected_project = EXCLUDED.expected_project,
      verified_at = now(),
      history = CASE WHEN pc_vaults.state IS DISTINCT FROM EXCLUDED.state
                     THEN pc_vaults.history || jsonb_build_object('state', EXCLUDED.state, 'at', now())
                     ELSE pc_vaults.history END`;
}

export async function upsertListing(l, card, collection) {
  if (!sql) return;
  await sql`
    INSERT INTO pc_listings (order_hash, token_id, contract, card, collection, price_eth, currency, seller, expires_at, active, updated_at)
    VALUES (${l.orderHash}, ${l.tokenId}, ${l.contract}, ${card}, ${collection}, ${l.priceEth}, ${l.currency}, ${l.seller}, ${l.expiresAt}, true, now())
    ON CONFLICT (order_hash) DO UPDATE SET
      price_eth = EXCLUDED.price_eth, expires_at = EXCLUDED.expires_at, active = true, updated_at = now()`;
}

export async function deactivateStaleListings(freshHashes, contract) {
  if (!sql || !freshHashes.length) return;
  await sql`UPDATE pc_listings SET active = false WHERE contract = ${contract} AND active AND NOT (order_hash = ANY(${freshHashes}))`;
}

export async function browseListings({ collection = null, state = null, limit = 120 } = {}) {
  if (!sql) return [];
  return sql`
    SELECT l.*, v.state, v.verified_at FROM pc_listings l
    LEFT JOIN pc_vaults v ON v.token_id = l.token_id
    WHERE l.active AND (v.state IS NULL OR v.state <> 'other')
      AND (${collection}::text IS NULL OR l.collection = ${collection})
      AND (${state}::text IS NULL OR v.state = ${state})
    ORDER BY (v.state = 'verified') DESC, l.price_eth ASC LIMIT ${limit}`;
}

export async function listingsForCard(card) {
  if (!sql) return [];
  return sql`
    SELECT l.*, v.state FROM pc_listings l
    LEFT JOIN pc_vaults v ON v.token_id = l.token_id
    WHERE l.active AND l.card = ${card} ORDER BY l.price_eth ASC LIMIT 50`;
}

export async function staleVaultTokenIds(limit = 20) {
  if (!sql) return [];
  return sql`
    SELECT l.token_id, l.contract FROM pc_listings l
    LEFT JOIN pc_vaults v ON v.token_id = l.token_id
    WHERE l.active AND (v.token_id IS NULL OR v.verified_at < now() - interval '6 hours')
    ORDER BY v.verified_at ASC NULLS FIRST LIMIT ${limit}`;
}

export async function getKnownVault(tokenId) {
  if (!sql) return null;
  const r = await sql`SELECT card, collection, state FROM pc_vaults WHERE token_id = ${tokenId}`;
  return r[0] || null;
}

// ---------- OpenSea listings ingestion ----------

const OSKEY = process.env.OPENSEA_API_KEY || '';
async function os(path, attempt = 0) {
  const r = await fetch(`https://api.opensea.io/api/v2${path}`, {
    headers: { 'x-api-key': OSKEY, accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (r.status === 429 && attempt < 4) { await new Promise((s) => setTimeout(s, 1000 * (attempt + 1))); return os(path, attempt + 1); }
  if (!r.ok) throw new Error(`OpenSea ${r.status} on ${path}`);
  return r.json();
}

// Sources to index: the two curated slugs already in lib/collections.js,
// plus the mixed legacy contract (slug resolved once, cached in pc_contracts).
export async function listingSources() {
  const out = Object.values(COLLECTIONS).map((c) => ({ slug: c.osSlug, contract: c.contract, collection: c.id, legacy: false }));
  let slug = null;
  if (sql) {
    const hit = await sql`SELECT slug FROM pc_contracts WHERE address = ${LEGACY_CONTRACT}`;
    slug = hit[0]?.slug || null;
  }
  if (!slug) {
    const d = await os(`/chain/ethereum/contract/${LEGACY_CONTRACT}`).catch(() => null);
    slug = d?.collection || null;
    if (slug && sql) await sql`INSERT INTO pc_contracts (address, slug) VALUES (${LEGACY_CONTRACT}, ${slug}) ON CONFLICT (address) DO UPDATE SET slug = EXCLUDED.slug`;
  }
  if (slug) out.push({ slug, contract: LEGACY_CONTRACT, collection: null, legacy: true });
  return out;
}

export async function* osListings(slug) {
  let next = '';
  do {
    const d = await os(`/listings/collection/${slug}/all?limit=100${next ? `&next=${next}` : ''}`);
    for (const l of d.listings || []) yield l;
    next = d.next || '';
  } while (next);
}

export async function osNftName(contract, tokenId) {
  const d = await os(`/chain/ethereum/contract/${contract}/nfts/${tokenId}`).catch(() => null);
  return d?.nft?.name || '';
}

export function normalizeListing(l) {
  const p = l?.price?.current;
  if (!p || !['ETH', 'WETH'].includes(String(p.currency || '').toUpperCase())) return null;
  const offer = l?.protocol_data?.parameters?.offer?.[0];
  if (!offer) return null;
  return {
    orderHash: l.order_hash,
    contract: String(offer.token || '').toLowerCase(),
    tokenId: String(offer.identifierOrCriteria || ''),
    priceEth: Number(p.value) / 10 ** Number(p.decimals ?? 18),
    currency: p.currency,
    seller: l?.protocol_data?.parameters?.offerer || '',
    expiresAt: l?.protocol_data?.parameters?.endTime ? new Date(Number(l.protocol_data.parameters.endTime) * 1000).toISOString() : null,
  };
}
