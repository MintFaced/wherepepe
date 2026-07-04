import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// TEMPORARY diagnostic — reveals the real OpenSea data model for the
// rare-pepe-curated collection. Returns only structural samples, never secrets.
const SLUG = 'rare-pepe-curated';
const OS = 'https://api.opensea.io/api/v2';

export async function GET() {
  const key = process.env.OPENSEA_API_KEY;
  if (!key) return NextResponse.json({ ok: false, error: 'OPENSEA_API_KEY not set' }, { status: 400 });
  const h = { accept: 'application/json', 'x-api-key': key };
  const out = { slug: SLUG };

  try {
    // Full raw first listing (minus the huge protocol_data blob) — does it
    // carry the asset name, so we can skip full NFT enumeration for floors?
    const listRes = await fetch(`${OS}/listings/collection/${SLUG}/best?limit=1`, { headers: h, signal: AbortSignal.timeout(15000) });
    const listData = await listRes.json();
    out.listingsStatus = listRes.status;
    const first = (listData.listings || [])[0];
    if (first) {
      const { protocol_data, ...rest } = first;
      out.rawFirstListing = rest;
      out.offerTokenId = protocol_data?.parameters?.offer?.[0]?.identifierOrCriteria ?? null;
    }

    // How many active listings total? (Caps at 12 pages to stay within timeout.)
    let cursor = null, pages = 0, count = 0, capped = false;
    do {
      const url = `${OS}/listings/collection/${SLUG}/best?limit=100${cursor ? `&next=${cursor}` : ''}`;
      const r = await fetch(url, { headers: h, signal: AbortSignal.timeout(15000) });
      const d = await r.json();
      count += (d.listings || []).length;
      cursor = d.next || null;
      pages += 1;
      if (pages >= 12) { capped = Boolean(cursor); break; }
    } while (cursor);
    out.listingCount = count;
    out.listingCountCapped = capped; // true => there are more than we counted

    out.ok = true;
  } catch (e) {
    out.ok = false;
    out.error = String(e);
  }

  return NextResponse.json(out);
}
