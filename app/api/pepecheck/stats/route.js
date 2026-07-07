import { NextResponse } from 'next/server';
import { sql, hasPcDb } from '../../../../lib/pepecheck';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/pepecheck/stats — index health, read through the app's own DB
// connection. No secrets exposed; the host fragment identifies WHICH Neon
// database the app is actually talking to (two-database mishaps are the
// classic failure mode).
export async function GET() {
  if (!hasPcDb()) return NextResponse.json({ ok: false, error: 'DATABASE_URL not set' }, { status: 503 });
  try {
    const [l] = await sql`SELECT count(*)::int AS total, count(*) FILTER (WHERE active)::int AS active, count(card)::int AS with_card FROM pc_listings`;
    const byState = await sql`SELECT coalesce(state,'(unverified)') AS state, count(*)::int AS n FROM pc_vaults GROUP BY 1 ORDER BY 2 DESC`;
    const sample = await sql`SELECT order_hash, token_id, card, collection, price_eth, active FROM pc_listings ORDER BY updated_at DESC LIMIT 3`;
    const dbHost = (() => { try { return new URL(process.env.DATABASE_URL).host.split('.').slice(0, 2).join('.'); } catch { return '?'; } })();
    return NextResponse.json({ ok: true, dbHost, listings: l, vaults: byState, sample });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
