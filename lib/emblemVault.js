// Emblem Vault integration — SERVER-SIDE ONLY (holds the API key). Calls Emblem's
// REST API directly (no SDK bundle). Auth: header  x-api-key: <EMBLEM_API_KEY>.
//   GET  v2.emblemvault.io/curated                          -> curated collections
//   POST v2.emblemvault.io/create-curated  (template)       -> { tokenId, addresses }
//   GET  v3.emblemvault.io/vault/balance/{tokenId}?live=true -> { balances }
//   POST v2.emblemvault.io/mint-curated    (sig)            -> remote mint signature

const KEY = process.env.EMBLEM_API_KEY || '';
const V2 = 'https://v2.emblemvault.io';
const V3 = 'https://v3.emblemvault.io';
const CURATED_NAME = { 'rare-pepe': 'Rare Pepe', 'fake-rare': 'Fake Rares' };

export function hasEmblemKey() { return Boolean(KEY); }

// Bounded fetch that always resolves (or throws a clear error) — never hangs.
async function ev(url, { method = 'GET', body, timeout = 18000 } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { 'x-api-key': KEY, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    throw new Error(e?.name === 'TimeoutError' ? `Emblem API timed out (${url.replace(/^https?:\/\//, '').split('/')[0]})` : `Emblem API unreachable: ${String(e?.message || e)}`);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) {
    const msg = (data && (data.msg || data.error || data.err)) || text?.slice(0, 200) || res.statusText;
    throw new Error(`Emblem ${res.status}: ${msg}`);
  }
  return data;
}

// Cache the curated list (large-ish, stable) so create isn't slow every call.
let _curated = null;
async function curatedByName(name) {
  if (!_curated) _curated = await ev(`${V2}/curated`);
  const list = Array.isArray(_curated) ? _curated : _curated?.data || [];
  return list.find((c) => c && c.name === name) || null;
}

export async function createVault({ collection, toAddress }) {
  const name = CURATED_NAME[collection] || 'Rare Pepe';
  const contract = await curatedByName(name);
  if (!contract) throw new Error(`Curated collection "${name}" not found in Emblem's list.`);
  const template = { ...contract, chainId: 1, toAddress };
  if (template.targetContract) { delete template.targetContract[5]; }
  const res = await ev(`${V2}/create-curated`, { method: 'POST', body: template, timeout: 40000 });
  const vault = res?.data || res;
  if (res?.err || res?.error) throw new Error(`create-curated: ${res.msg || res.error || res.err}`);
  if (!vault || !vault.tokenId) throw new Error(`Unexpected create-curated response: ${JSON.stringify(res).slice(0, 300)}`);
  return vault;
}

export async function vaultStatus(tokenId) {
  const res = await ev(`${V3}/vault/balance/${tokenId}?live=true`);
  return res?.balances || [];
}

export async function remoteMintSignature({ tokenId, signature }) {
  return ev(`${V2}/mint-curated`, { method: 'POST', body: { method: 'buyWithSignedPrice', tokenId, signature, chainId: '1' } });
}
