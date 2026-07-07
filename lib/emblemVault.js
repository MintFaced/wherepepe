// Emblem Vault integration — SERVER-SIDE ONLY (holds the API key). Calls Emblem's
// REST API directly (no SDK bundle). Auth: header  x-api-key: <EMBLEM_API_KEY>.
//   GET  v2.emblemvault.io/curated                          -> curated collections
//   POST v2.emblemvault.io/create-curated  (template)       -> { tokenId, addresses }
//   GET  v3.emblemvault.io/vault/balance/{tokenId}?live=true -> { balances }
//   POST v2.emblemvault.io/mint-curated    (sig)            -> remote mint signature

import { getAddress } from 'viem';
import { resolveCuratedAsset } from './curatedAssets';

const KEY = process.env.EMBLEM_API_KEY || '';
const V2 = 'https://v2.emblemvault.io';
const V3 = 'https://v3.emblemvault.io';

// EIP-55 checksum an address; Emblem stores createdBy exactly as sent and later
// compares it case-sensitively against the checksummed ecrecover result, so a
// lowercase address here makes the mint fail "signedByCreator: false".
function checksum(addr) { try { return getAddress(String(addr)); } catch { return String(addr); } }

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
// Rare Pepe and Fake Rares are `select` (allow-list) collections, so the
// collection is DERIVED from the asset and targetAsset comes from Emblem's
// own metadata — never from the UI or WherePepe's catalog. Unknown assets
// fail closed (prevents the PEPECASH-in-Fake-Rares class of invalid vault).
export async function createVault({ toAddress, asset }) {
  const resolved = await resolveCuratedAsset(asset, KEY);
  if (!resolved) {
    throw new Error(`${String(asset).toUpperCase()} isn't on the Rare Pepe or Fake Rares allow-lists, so Emblem can't vault it. Double-check the asset name.`);
  }
  const c = await curatedByName(resolved.projectName);
  if (!c) throw new Error(`Curated collection "${resolved.projectName}" not found in Emblem's list.`);
  const addr = c.contracts?.['1'];
  if (!addr) throw new Error(`No Ethereum-mainnet contract for ${resolved.projectName}.`);
  const owner = checksum(toAddress); // MUST be checksummed so the mint's creator-check passes
  const template = {
    fromAddress: owner,
    toAddress: owner,
    chainId: 1,
    experimental: true,
    targetContract: { name: c.name, 1: checksum(addr) },
    targetAsset: { name: resolved.asset, image: resolved.image || undefined, projectName: c.name },
  };
  const res = await ev(`${V2}/create-curated`, { method: 'POST', body: template, timeout: 25000, label: 'creating the vault' });
  const vault = res?.data || res;
  if (res?.err || res?.error) throw new Error(`create-curated: ${res.msg || res.error || res.err}`);
  if (!vault || !vault.tokenId) throw new Error(`Unexpected create-curated response: ${JSON.stringify(res).slice(0, 300)}`);
  return { ...vault, collection: resolved.collection, projectName: resolved.projectName, assetSource: resolved.source };
}

// The wallet Emblem recorded as the vault's creator (must sign the mint).
export async function vaultCreator(tokenId) {
  const meta = await ev(`${V2}/meta/${tokenId}`, { timeout: 20000, label: 'reading the vault' });
  return meta?.to || meta?.ownershipInfo?.createdBy || meta?.createdBy || '';
}

// Read a vault's Bitcoin (Counterparty) deposit address from its metadata.
export async function vaultBtcAddress(tokenId) {
  const meta = await ev(`${V2}/meta/${tokenId}`, { timeout: 20000, label: 'reading the vault' });
  const addrs = meta?.addresses || meta?.ownershipInfo?.balances || [];
  const btc = addrs.find((a) => a?.coin === 'BTC' && a?.address);
  return btc?.address || '';
}

// Direct read of a Counterparty address's asset balances (public indexer).
// Emblem's own balance indexer can lag hours behind confirmation, so this is a
// reliable second source to confirm a deposit actually landed in the vault.
async function counterpartyBalances(btcAddress) {
  try {
    const r = await fetch(`https://api.counterparty.io:4000/v2/addresses/${btcAddress}/balances`, {
      signal: AbortSignal.timeout(15000),
    });
    const d = await r.json();
    return (d?.result || [])
      .filter((b) => Number(b.quantity) > 0)
      .map((b) => ({ name: b.asset, balance: b.quantity_normalized || String(b.quantity), source: 'counterparty' }));
  } catch { return []; }
}

export async function vaultStatus(tokenId) {
  // Nudge Emblem to re-scan the vault's BTC address (a fresh Counterparty deposit
  // isn't reflected until the vault is refreshed), then read the live balance.
  try { await ev(`${V2}/refreshBalanceForTokenId`, { method: 'POST', body: { tokenId }, timeout: 20000, label: 'refreshing the vault' }); } catch { /* best effort */ }
  const res = await ev(`${V3}/vault/balance/${tokenId}?live=true`, { timeout: 20000, label: 'checking the vault' });
  // Assets live under `values` (v3), older shapes used `balances`.
  let values = res?.values || res?.data?.values || res?.balances || [];
  let source = 'emblem';
  let btcAddress = '';

  // `loaded` = Emblem's own indexer sees the deposit. mint-curated refuses an
  // unloaded vault with msg:"Not Loaded", so this — not Counterparty — is the
  // mint-readiness gate.
  const loaded = values.length > 0;

  // Informational fallback: if Emblem shows nothing, read the vault's BTC
  // address directly on Counterparty. This proves the coins ARRIVED on-chain,
  // but it does NOT mean the vault is loaded — never gate the mint on it.
  if (!loaded) {
    try {
      btcAddress = await vaultBtcAddress(tokenId);
      if (btcAddress) {
        const cp = await counterpartyBalances(btcAddress);
        if (cp.length) { values = cp; source = 'counterparty'; }
      }
    } catch { /* best effort */ }
  }
  return { values, loaded, raw: res, source, btcAddress };
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
    // `buyWithSignedPrice` is the SDK's current canonical method (evm-operations.ts):
    // the signer returns an exact wei `_price` that IS the msg.value — no quote
    // contract, no USD→ETH drift, and the signature covers that exact price.
    body: { method: 'buyWithSignedPrice', tokenId, signature, chainId: '1' },
  });
  return r; // caller inspects success / signedByCreator / raw fields
}
