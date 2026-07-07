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

// Bounded fetch that always resolves (or throws a clear, labelled error).
async function ev(url, { method = 'GET', body, timeout = 18000, label = 'Emblem' } = {}) {
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { 'x-api-key': KEY, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    if (e?.name === 'TimeoutError') throw new Error(`Timed out while ${label} (>${timeout / 1000}s)`);
    throw new Error(`Failed while ${label}: ${String(e?.message || e)}`);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) {
    const msg = (data && (data.msg || data.error || data.err)) || text?.slice(0, 200) || res.statusText;
    throw new Error(`Emblem ${res.status} while ${label}: ${msg}`);
  }
  console.log(`[MovePepe] ${label} ok in ${Date.now() - t0}ms`);
  return data;
}

// Cache the curated list (large + stable) so we only pay for it once per warm fn.
let _curated = null;
async function curatedByName(name) {
  if (!_curated) _curated = await ev(`${V2}/curated`, { timeout: 30000, label: 'listing collections' });
  const list = Array.isArray(_curated) ? _curated : _curated?.data || [];
  return list.find((c) => c && c.name === name) || null;
}

// Build the exact create-curated template the SDK produces:
//   { fromAddress, toAddress, chainId, experimental, targetContract:{name,[chainId]:addr}, targetAsset:{name,image,projectName} }
export async function createVault({ collection, toAddress, asset, image }) {
  const name = CURATED_NAME[collection] || 'Rare Pepe';
  const c = await curatedByName(name);
  if (!c) throw new Error(`Curated collection "${name}" not found in Emblem's list.`);
  const addr = c.contracts?.['1'];
  if (!addr) throw new Error(`No Ethereum-mainnet contract for ${name}.`);
  const template = {
    fromAddress: toAddress,
    toAddress,
    chainId: 1,
    experimental: true,
    targetContract: { name: c.name, 1: addr },
    targetAsset: { name: asset, image: image || undefined, projectName: c.name },
  };
  const res = await ev(`${V2}/create-curated`, { method: 'POST', body: template, timeout: 25000, label: 'creating the vault' });
  const vault = res?.data || res;
  if (res?.err || res?.error) throw new Error(`create-curated: ${res.msg || res.error || res.err}`);
  if (!vault || !vault.tokenId) throw new Error(`Unexpected create-curated response: ${JSON.stringify(res).slice(0, 300)}`);
  return vault;
}

export async function vaultStatus(tokenId) {
  // Nudge Emblem to re-scan the vault's BTC address (a fresh Counterparty deposit
  // isn't reflected until the vault is refreshed), then read the live balance.
  try { await ev(`${V2}/refreshBalanceForTokenId`, { method: 'POST', body: { tokenId }, timeout: 20000, label: 'refreshing the vault' }); } catch { /* best effort */ }
  const res = await ev(`${V3}/vault/balance/${tokenId}?live=true`, { timeout: 20000, label: 'checking the vault' });
  // Assets live under `values` (v3), older shapes used `balances`.
  const values = res?.values || res?.data?.values || res?.balances || [];
  return { values, raw: res };
}

// Vaults an address has created (so a user can resume / mint one they made).
export async function myVaults(address, vaultType = 'created') {
  const r = await ev(`${V2}/myvaults/${address}?vaultType=${vaultType}`, { timeout: 20000, label: 'finding your vaults' });
  const list = Array.isArray(r) ? r : r?.data || [];
  return list.map((v) => ({
    tokenId: String(v.tokenId ?? v.id ?? ''),
    asset: v.targetAsset?.name || v.name || v.assetName || '',
    addresses: v.addresses || [],
  })).filter((v) => v.tokenId);
}

// Authorize the on-chain mint. The signature must come from the wallet that
// created the vault. Returns the remote mint signature blob for buyWithSignedPrice.
export async function remoteMintSignature({ tokenId, signature }) {
  const r = await ev(`${V2}/mint-curated`, {
    method: 'POST', timeout: 20000, label: 'authorizing the mint',
    body: { method: 'buyWithSignedPrice', tokenId, signature, chainId: '1' },
  });
  if (r?.success === false) {
    throw new Error(r.signedByCreator === false
      ? 'Mint must be signed by the same wallet that created the vault.'
      : (r.msg || r.error || 'Mint authorization failed — is the Pepe in the vault yet?'));
  }
  return r?.data || r;
}
