import { memo, TTL } from './cache';

// Emblem Vault is the authoritative source for "wrapped" — it IS the wrapping
// protocol. We call its v3 metadata API directly (the official emblem-vault-sdk
// pulls in 300+ web3/minting packages we don't need for read-only queries).
//
// What Emblem exposes:
//  • /asset_metadata/projects/vaulted → vaulted count PER PROJECT (authoritative
//    total for "Rare Pepe" as a whole — NOT per card).
//  • /asset_metadata/{asset}          → authoritative per-card metadata.
//
// Per-card vaulted counts are NOT exposed by the API (per-vault data needs an
// owner address or tokenId), so per-card wrapped distribution still comes from
// OpenSea traits (lib/wrapped.js). Emblem gives us the authoritative aggregate.

const V3 = process.env.EMBLEM_V3_URL || 'https://v3.emblemvault.io';
const RARE_PEPE_PROJECT = 'rare pepe';

export function hasEmblemKey() {
  return Boolean(process.env.EMBLEM_API_KEY);
}

function emblemHeaders() {
  const h = { accept: 'application/json' };
  if (process.env.EMBLEM_API_KEY) h['x-api-key'] = process.env.EMBLEM_API_KEY;
  return h;
}

// Authoritative total number of Rare Pepe units currently vaulted in Emblem.
export async function getEmblemVaultedTotal() {
  return memo('emblem:vaultedTotal', TTL.WRAPPED, async () => {
    try {
      const res = await fetch(`${V3}/asset_metadata/projects/vaulted`, {
        headers: emblemHeaders(),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`emblem ${res.status}`);
      const d = await res.json();
      const rp = Array.isArray(d)
        ? d.find((x) => String(x.project || '').trim().toLowerCase() === RARE_PEPE_PROJECT)
        : null;
      return { total: rp ? Number(rp.project_count) : null, ok: Boolean(rp) };
    } catch (e) {
      return { total: null, ok: false, error: String(e) };
    }
  });
}

// Authoritative per-card metadata from Emblem (artist, supply, image, issuer).
// Used as a cross-source on the detail page; null on any failure.
export async function getEmblemAssetMeta(asset) {
  const key = String(asset || '').toUpperCase();
  if (!key) return null;
  return memo(`emblem:meta:${key}`, TTL.CATALOG, async () => {
    try {
      const res = await fetch(`${V3}/asset_metadata/${encodeURIComponent(key)}`, {
        headers: emblemHeaders(),
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) throw new Error(`emblem ${res.status}`);
      const d = await res.json();
      const a = Array.isArray(d) ? d[0] : d;
      if (!a || !a.asset_name) return null;
      return {
        asset: String(a.asset_name).toUpperCase(),
        supply: Number(a.supply) || null,
        artist: a.artist_name || null,
        series: a.series ?? null,
        card: a.card_number ?? null,
        image: a.image || null,
        link: a.link || null,
        issuer: a.misc?.issuer || null,
      };
    } catch {
      return null;
    }
  });
}
