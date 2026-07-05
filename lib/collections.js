// The pepe collections WherePepe tracks. Each maps a pepe.wtf collection to its
// Emblem-curated OpenSea collection (wrapped) + ERC-1155 contract.
export const COLLECTIONS = {
  'rare-pepe': {
    id: 'rare-pepe',
    label: 'Rare Pepe',
    pepeWtf: 'Rare Pepes',
    osSlug: 'rare-pepe-curated',
    contract: '0x7e6027a6a84fc1f6db6782c523efe62c923e46ff',
  },
  'fake-rare': {
    id: 'fake-rare',
    label: 'Fake Rare',
    pepeWtf: 'Fake Rares',
    osSlug: 'fake-rares-curated',
    contract: '0x4c03bcad293fb0562d26faa7d90a0cb3ea74c919',
  },
};

export const COLLECTION_LIST = Object.values(COLLECTIONS);

export const PEPEWTF_TO_ID = Object.fromEntries(COLLECTION_LIST.map((c) => [c.pepeWtf, c.id]));
export const CONTRACT_TO_ID = Object.fromEntries(COLLECTION_LIST.map((c) => [c.contract, c.id]));
export const KEPT_COLLECTION_NAMES = new Set(COLLECTION_LIST.map((c) => c.pepeWtf));
