import { NextResponse } from 'next/server';
import { getCardMeta } from '../../../../lib/catalog';
import { getNative } from '../../../../lib/native';
import { getWrappedForCard } from '../../../../lib/wrapped';

export const runtime = 'nodejs';

const ASSET_RE = /^[A-Z0-9._-]{1,40}$/;

// Full detail for one card: catalog meta + native market + wrapped breakdown.
export async function GET(request, { params }) {
  const { asset: rawAsset } = await params;
  const asset = String(rawAsset || '').toUpperCase();
  if (!ASSET_RE.test(asset)) {
    return NextResponse.json({ ok: false, error: 'invalid asset' }, { status: 400 });
  }

  try {
    const meta = await getCardMeta(asset);
    if (!meta) {
      return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
    }
    const [native, wrapped] = await Promise.all([
      getNative(asset),
      getWrappedForCard(asset, meta.supply),
    ]);

    const supply = meta.supply || native.supply || 0;
    const wrappedCount = wrapped.count;
    const nativeCount = wrappedCount != null ? Math.max(0, supply - wrappedCount) : null;
    const pctWrapped = wrappedCount != null && supply > 0 ? (wrappedCount / supply) * 100 : null;

    return NextResponse.json({
      ok: true,
      meta,
      supply,
      native: {
        floorEth: native.floorEth,
        floorCcy: native.floorCcy,
        floorAmount: native.floorAmount,
        floorBtc: native.floorBtc,
        floorXcp: native.floorXcp,
        estUsd: native.estUsd,
        holders: native.holders,
        count: nativeCount,
      },
      wrapped: {
        count: wrappedCount,
        floorEth: wrapped.floorEth,
        collectionFloorEth: wrapped.collectionFloorEth,
        source: wrapped.source,
      },
      pctWrapped,
      rates: native.rates,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 502 });
  }
}
