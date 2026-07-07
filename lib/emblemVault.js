// Emblem Vault integration — SERVER-SIDE ONLY (holds the API key; the browser
// only ever signs mint/claim with the user's wallet).
//
// PHASE 1 (scaffold): the /moves UI + routes are in place but gated. The live
// `emblem-vault-sdk` calls — createCuratedVault → refreshBalance → performMintChain
// (wrap) and performClaimChain (unwrap) — are wired in the wrap/unwrap phases,
// once EMBLEM_API_KEY is set and we can test end-to-end on a throwaway asset.
// We deliberately don't bundle the (heavy) SDK until then, so builds stay light.
//
// Reference: https://github.com/EmblemCompany/emblem-vault-sdk  (v2.10.x)
//   const sdk = new EmblemVaultSDK(process.env.EMBLEM_API_KEY)
//   sdk.fetchCuratedContractByName('Rare Pepe' | 'Fake Rares')
//   sdk.createCuratedVault(template) -> { tokenId, addresses }
//   sdk.refreshBalance(tokenId)
//   performMintChain(web3, tokenId, collectionName)   // browser wallet
//   performClaimChain(web3, tokenId, serial)          // browser wallet (unwrap)

const KEY = process.env.EMBLEM_API_KEY || '';

export function hasEmblemKey() {
  return Boolean(KEY);
}

export async function createVaultForAsset() {
  throw new Error('Emblem SDK wiring is added in the wrap phase.');
}

export async function vaultStatus() {
  throw new Error('Emblem SDK wiring is added in the wrap phase.');
}
