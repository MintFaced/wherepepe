import { NextResponse } from 'next/server';
import {
  sql, hasPcDb, upsertVault, upsertListing, deactivateStaleListings,
  staleVaultTokenIds, getKnownVault, listingSources, osListings, osNftName,
  normalizeListing, matchCardInText, verifyVault,
} from '../../../../lib/pepecheck';
import { lookupBundled } from '../../../../lib/curatedAssets';
import { hasEmblemKey } from '../../../../lib/emblemVault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const NEW_TOKEN_BUDGET = 30; // fresh legacy tokens to classify per run
const VERIFY_BUDGET = 20;    // stale vaults to re-verify per run

export async function GET(request) {
  const auth = request.headers.get('authorization') || '';
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPcDb() || !process.env.OPENSEA_API_KEY || !hasEmblemKey()) {
    return NextResponse.json({ ok: false, error: 'missing env: DATABASE_URL / OPENSEA_API_KEY / EMBLEM_API_KEY' }, { status: 503 });
  }

  const report = { listings: 0, classified: 0, verified: 0, skipped: 0 };
  let newTokenBudget = NEW_TOKEN_BUDGET;

  for (const src of await listingSources()) {
    const fresh = [];
    for await (const raw of osListings(src.slug)) {
      const l = normalizeListing(raw);
      if (!l) continue;

      // Which card? Curated sources are single-collection; legacy is mixed,
      // so classify via the vault we already know, else the NFT title.
      let card = null, collection = src.collection;
      const known = await getKnownVault(l.tokenId);
      if (known) {
        if (known.state === 'other') { report.skipped++; continue; }
        card = known.card; collection = known.collection || collection;
      } else if (src.legacy) {
        if (newTokenBudget <= 0) continue; // next run picks it up
        newTokenBudget--;
        card = matchCardInText(await osNftName(src.contract, l.tokenId));
        if (!card) {
          await upsertVault(l.tokenId, src.contract, { state: 'other', card: null, collection: null, contents: [], btcAddress: '', recordedProject: '', expectedProject: '' });
          report.skipped++; continue;
        }
        collection = lookupBundled(card)?.collection || null;
        report.classified++;
      }

      await upsertListing(l, card, collection);
      fresh.push(l.orderHash);
      report.listings++;
    }
    await deactivateStaleListings(fresh, src.contract);
  }

  // Verify new + stale vaults (no indexer nudge in bulk — page views and
  // /api/pepecheck/verify do the full nudge-verify).
  for (const row of await staleVaultTokenIds(VERIFY_BUDGET)) {
    try {
      const v = await verifyVault(row.token_id, { nudge: false });
      await upsertVault(row.token_id, row.contract, v);
      report.verified++;
    } catch { /* next run */ }
  }

  return NextResponse.json({ ok: true, ...report });
}
