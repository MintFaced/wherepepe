// Curated-asset allow-list — SERVER-SIDE lookup for the two supported
// Emblem `select` collections. Both Rare Pepe and Fake Rares are allow-list
// only: `targetAsset` must come from Emblem's own asset metadata, and the
// collection must be DERIVED from the asset (never a free UI choice) or the
// vault is structurally invalid and fails `allowed()`.
//
// Primary source:  GET v3.emblemvault.io/asset_metadata/{ASSET}  (live)
// Fallback:        ./curatedAssets.json — extracted from the SDK's bundled
//                  src/curated/metadata.json (the remote endpoint has gaps,
//                  e.g. FROGDNA returns [] though it's a real Fake Rare).
// Format: { ASSET: [ 'r'|'f', 'IMAGE_FILENAME' ] }

import bundled from './curatedAssets.json';

const IMG_PREFIX = 'https://raw.githubusercontent.com/EmblemCompany/vaultImages/master/collection/';
const SLUG = { r: 'rare-pepe', f: 'fake-rare' };
const PROJECT = { r: 'Rare Pepe', f: 'Fake Rares' };
const DIR = { r: 'rare-pepes', f: 'fake-rares' };
const PROJECT_TO_SLUG = { 'Rare Pepe': 'rare-pepe', 'Fake Rares': 'fake-rare' };

// Bundled lookup — deterministic, ships with the app.
export function lookupBundled(asset) {
  const hit = bundled[String(asset || '').toUpperCase()];
  if (!hit) return null;
  const [key, fname] = hit;
  return {
    asset: String(asset).toUpperCase(),
    collection: SLUG[key],
    projectName: PROJECT[key],
    image: fname ? `${IMG_PREFIX}${DIR[key]}/${fname}` : '',
    source: 'bundled',
  };
}

// Live lookup against Emblem's v3 asset metadata. Returns null on a gap
// (empty response), unsupported project, or any network failure — callers
// fall back to the bundled list.
export async function lookupRemote(asset, apiKey) {
  try {
    const r = await fetch(`https://v3.emblemvault.io/asset_metadata/${encodeURIComponent(String(asset).toUpperCase())}`, {
      headers: apiKey ? { 'x-api-key': apiKey } : {},
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const m = Array.isArray(d) ? d[0] : (d?.data || d);
    const projectName = m?.projectName || m?.project_name || '';
    const collection = PROJECT_TO_SLUG[projectName];
    if (!collection) return null; // unknown asset, or not on a supported allow-list
    return {
      asset: String(asset).toUpperCase(),
      collection,
      projectName,
      image: m?.image || '',
      source: 'remote',
    };
  } catch { return null; }
}

// Resolve an asset to its collection + canonical image: remote first,
// bundled fallback, null if it's on neither (=> fail closed, don't vault it).
export async function resolveCuratedAsset(asset, apiKey) {
  return (await lookupRemote(asset, apiKey)) || lookupBundled(asset);
}
