import { NextResponse } from 'next/server';
import {
  sql, hasPcDb, upsertVault, upsertListing, deactivateStaleListings,
  staleVaultTokenIds, getKnownVault, listingSources, osListings, osNftName,
  osNftPages, unnamedListingTokenIds, setListingCard,
  normalizeListing, matchCardInText, verifyVault,
} from '../../../../lib/pepecheck';
import { lookupBundled } from '../../../../lib/curatedAssets';
import { hasEmblemKey } from '../../../../lib/emblemVault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const LEGACY_NAME_BUDGET = 30;  // per-token name lookups for legacy (mixed) vaults
const NFT_PAGE_BUDGET = 15;     // bulk 200-per-page name sweeps per curated contract
const VERIFY_BUDGET = 20;       // stale vaults to fully re-verify per run

export async function GET(request) {
  const auth = request.headers.get('authorization') || '';
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPcDb() || !process.env.OPENSEA_API_KEY || !hasEmblemKey()) {
    return NextResponse.json({ ok: false, error: 'missing env: DATABASE_URL / OPENSEA_API_KEY / EMBLEM_API_KEY' }, { status: 503 });
  }

  const report = { listings: 0, named: 0, verified: 0, verifyErrors: 0, skipped: 0 };
  let legacyNameBudget = LEGACY_NAME_BUDGET;

  // Pass 1 — ingest listings. ON CONFLICT preserves any card already set.
  for (const src of await listingSources()) {
    const fresh = [];
    for await (const raw of osListings(src.slug)) {
      const l = normalizeListing(raw);
      if (!l) continue;
      const known = await getKnownVault(l.tokenId);
      if (known?.state === 'other') { report.skipped++; continue; }
      await upsertListing(l, known?.card || null, known?.collection || src.collection);
      fresh.push(l.orderHash);
      report.listings++;
    }
    await deactivateStaleListings(fresh, src.contract);
  }

  // Pass 2 — name the unnamed.
  for (const src of await listingSources()) {
    const unnamed = await unnamedListingTokenIds(src.contract);
    if (!unnamed.size) continue;

    if (!src.legacy) {
      // Curated: bulk-sweep NFT names (200/call) and match against the listed set.
      for await (const n of osNftPages(src.contract, NFT_PAGE_BUDGET)) {
        if (!unnamed.has(n.identifier)) continue;
        const card = matchCardInText(n.name);
        if (card) {
          await setListingCard(n.identifier, card, lookupBundled(card)?.collection || src.collection);
          unnamed.delete(n.identifier);
          report.named++;
        }
        if (!unnamed.size) break;
      }
    } else {
      // Legacy is mixed collections: per-token lookups on a budget; non-pepes
      // are remembered as 'other' so they're skipped forever after.
      for (const tokenId of unnamed) {
        if (legacyNameBudget-- <= 0) break;
        const card = matchCardInText(await osNftName(src.contract, tokenId));
        if (card) {
          await setListingCard(tokenId, card, lookupBundled(card)?.collection || null);
          report.named++;
        } else {
          await upsertVault(tokenId, src.contract, { state: 'other', card: null, collection: null, contents: [], btcAddress: '', recordedProject: '', expectedProject: '' });
          await sql`UPDATE pc_listings SET active = false WHERE token_id = ${tokenId}`;
          report.skipped++;
        }
      }
    }
  }

  // Pass 3 — verify named vaults (newest-unverified first via the stale query).
  for (const row of await staleVaultTokenIds(VERIFY_BUDGET)) {
    try {
      const v = await verifyVault(row.token_id, { nudge: false });
      await upsertVault(row.token_id, row.contract, v);
      report.verified++;
    } catch (e) {
      report.verifyErrors++;
      console.error('[PepeCheck] verify failed', row.token_id, String(e?.message || e).slice(0, 120));
    }
  }

  return NextResponse.json({ ok: true, ...report });
}
