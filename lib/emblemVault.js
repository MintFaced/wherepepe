// Emblem Vault integration — SERVER-SIDE ONLY (holds the API key). We call
// Emblem's REST API directly (no SDK bundle — the SDK ships ~64MB of browser +
// curated data). The browser only signs + submits the on-chain tx with viem.
//
// Endpoints (reverse-engineered from emblem-vault-sdk@2.10):
//   GET  v2.emblemvault.io/curated                         -> curated collections
//   POST v2.emblemvault.io/create-curated  (template)      -> { tokenId, addresses }
//   GET  v3.emblemvault.io/vault/balance/{tokenId}?live=true-> { balances }
//   POST v2.emblemvault.io/mint-curated    (sig)           -> remote mint signature
//   Auth: header  x-api-key: <EMBLEM_API_KEY>

const KEY = process.env.EMBLEM_API_KEY || '';
const V2 = 'https://v2.emblemvault.io';
const V3 = 'https://v3.emblemvault.io';

const CURATED_NAME = { 'rare-pepe': 'Rare Pepe', 'fake-rare': 'Fake Rares' };

export function hasEmblemKey() { return Boolean(KEY); }

async function ev(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'x-api-key': KEY, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && (data.msg || data.error || data.err)) || `Emblem API ${res.status}`);
  return data;
}

async function curatedByName(name) {
  const list = await ev(`${V2}/curated`);
  return Array.isArray(list) ? list.find((c) => c.name === name) : null;
}

// Create a vault targeting the asset's curated collection. Returns { tokenId, addresses }.
export async function createVault({ collection, toAddress }) {
  const name = CURATED_NAME[collection] || 'Rare Pepe';
  const contract = await curatedByName(name);
  if (!contract) throw new Error(`Emblem curated collection not found: ${name}`);
  const template = { ...contract, chainId: 1, toAddress };
  if (template.targetContract) { delete template.targetContract[5]; } // keep mainnet target
  const res = await ev(`${V2}/create-curated`, { method: 'POST', body: template });
  if (res?.err) throw new Error(res.msg || 'vault creation failed');
  return res.data || res;
}

// Live balances in the vault (confirms the deposit landed).
export async function vaultStatus(tokenId) {
  const res = await ev(`${V3}/vault/balance/${tokenId}?live=true`);
  return res?.balances || [];
}

// Remote mint signature for the on-chain buyWithSignedPrice (used in the mint stage).
export async function remoteMintSignature({ tokenId, signature }) {
  return ev(`${V2}/mint-curated`, { method: 'POST', body: { method: 'buyWithSignedPrice', tokenId, signature, chainId: '1' } });
}
