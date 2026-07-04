import { NextResponse } from 'next/server';
import { getFloorsByAsset } from '../../../lib/wrapped';

export const runtime = 'nodejs';
export const revalidate = 300;
export const maxDuration = 30; // a cold hour-bucket build takes ~7s

// The full per-card comparison map from the sweep snapshot:
//   { ASSET: { wrappedFloorEth, nativeFloorEth, cheaper, savingsPct } }
// Powers the gallery's "cheapest" badges, the wrapped/native filter, and sorts.
// Returns an empty map until the first sweep runs.
export async function GET() {
  try {
    const byAsset = await getFloorsByAsset();
    return NextResponse.json({ ok: Object.keys(byAsset).length > 0, byAsset });
  } catch (e) {
    return NextResponse.json({ ok: false, byAsset: {}, error: String(e) });
  }
}
