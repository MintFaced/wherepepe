import { NextResponse } from 'next/server';
import { getWrappedByAsset } from '../../../lib/wrapped';

export const runtime = 'nodejs';
export const revalidate = 300;

// The full per-card wrapped map { ASSET: { count, floorEth } } from the sweep
// snapshot. Powers the gallery's wrapped/native toggle, %-sort, ratio bars, and
// per-card wrapped floors. Returns an empty map until the first sweep runs.
export async function GET() {
  try {
    const byAsset = await getWrappedByAsset();
    return NextResponse.json({ ok: Object.keys(byAsset).length > 0, byAsset });
  } catch (e) {
    return NextResponse.json({ ok: false, byAsset: {}, error: String(e) });
  }
}
