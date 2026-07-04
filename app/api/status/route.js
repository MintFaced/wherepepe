import { NextResponse } from 'next/server';
import { getCatalog } from '../../../lib/catalog';
import { getCollectionFloor, getWrappedStatus, hasOpenSeaKey } from '../../../lib/wrapped';
import { getEmblemVaultedTotal, hasEmblemKey } from '../../../lib/emblem';
import { getRates } from '../../../lib/rates';
import { getNative } from '../../../lib/native';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Health + wiring check. Hit /api/status after deploy to confirm every data
// source resolves — especially the OpenSea per-card wrapped counts, which
// activate only when OPENSEA_API_KEY is set.
export async function GET() {
  const out = { time: new Date().toISOString() };

  const [catalog, collection, rates, wrapped, emblem, sampleNative] = await Promise.all([
    getCatalog().then((c) => ({ ok: true, count: c.length })).catch((e) => ({ ok: false, error: String(e) })),
    getCollectionFloor().catch((e) => ({ ok: false, error: String(e) })),
    getRates().catch((e) => ({ ok: false, error: String(e) })),
    getWrappedStatus().catch((e) => ({ ok: false, error: String(e) })),
    getEmblemVaultedTotal().catch((e) => ({ ok: false, error: String(e) })),
    getNative('RAREPEPE').catch((e) => ({ error: String(e) })),
  ]);

  out.catalog = catalog;
  out.rates = { ok: Boolean(rates?.ok), btcEth: rates?.btcEth ?? null, xcpEth: rates?.xcpEth ?? null };
  out.collectionFloor = { ok: Boolean(collection?.ok), floorEth: collection?.floorEth ?? null };
  out.sampleNative = {
    asset: 'RAREPEPE',
    floorEth: sampleNative?.floorEth ?? null,
    holders: sampleNative?.holders ?? null,
    supply: sampleNative?.supply ?? null,
  };
  out.wrappedCounts = wrapped; // { hasKey, ok, traitUsed, cardsMatched, samples }
  out.emblem = { hasKey: hasEmblemKey(), ok: Boolean(emblem?.ok), vaultedTotal: emblem?.total ?? null };

  out.summary = {
    nativeReady: Boolean(catalog.ok && collection && rates?.ok),
    openSeaKey: hasOpenSeaKey(),
    snapshotReady: Boolean(wrapped?.ok),
    perCardCounts: Number(wrapped?.assetsWithCount || 0),
    perCardFloors: Number(wrapped?.assetsWithFloor || 0),
    emblemReady: Boolean(emblem?.ok),
  };

  return NextResponse.json(out, {
    status: out.summary.nativeReady ? 200 : 503,
  });
}
