import { NextResponse } from 'next/server';
import { getNative } from '../../../lib/native';
import { getWrappedForCard } from '../../../lib/wrapped';

export const runtime = 'nodejs';

const MAX_BATCH = 40;
const ASSET_RE = /^[A-Z0-9._-]{1,40}$/;

// Batch enrichment for the gallery: given a comma-separated list of assets
// (the ones currently visible), return native floor + wrapped info for each.
export async function GET(request) {
  const raw = new URL(request.url).searchParams.get('assets') || '';
  const assets = raw
    .split(',')
    .map((a) => a.trim().toUpperCase())
    .filter((a) => ASSET_RE.test(a))
    .slice(0, MAX_BATCH);

  if (assets.length === 0) {
    return NextResponse.json({ ok: true, items: {} });
  }

  const results = await Promise.all(
    assets.map(async (asset) => {
      try {
        const [native, wrapped] = await Promise.all([
          getNative(asset),
          getWrappedForCard(asset),
        ]);
        const pctWrapped =
          wrapped.count != null && native.supply > 0
            ? Math.min(100, (wrapped.count / native.supply) * 100)
            : null;
        return [asset, {
          floorEth: native.floorEth,
          floorCcy: native.floorCcy,
          holders: native.holders,
          supply: native.supply,
          wrappedCount: wrapped.count,
          wrappedFloorEth: wrapped.floorEth,
          collectionFloorEth: wrapped.collectionFloorEth,
          pctWrapped,
        }];
      } catch {
        return [asset, null];
      }
    }),
  );

  const items = Object.fromEntries(results);
  return NextResponse.json({ ok: true, items });
}
