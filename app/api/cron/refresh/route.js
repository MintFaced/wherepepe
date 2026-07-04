import { NextResponse } from 'next/server';
import { refreshWrappedSnapshot } from '../../../../lib/sweep';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Pro: the full sweep is ~190 sequential calls.

// Scheduled sweep (see vercel.json cron). Also callable manually to warm the
// snapshot right after deploy. Protected by CRON_SECRET — Vercel Cron sends it
// automatically as `Authorization: Bearer <CRON_SECRET>`.
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
  }

  const started = Date.now();
  try {
    const snap = await refreshWrappedSnapshot();
    return NextResponse.json({
      ok: Boolean(snap.stats?.ready),
      builtAt: snap.builtAt,
      durationMs: Date.now() - started,
      stats: snap.stats,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), durationMs: Date.now() - started }, { status: 500 });
  }
}
