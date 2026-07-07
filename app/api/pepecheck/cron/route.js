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

const NEW_TOKEN_BUDGET = 40; // fresh tokens to classify per run (all sources)
const VERIFY_BUDGET = 20;    // stale vaults to re-verify per run

export async function GET(request) {
  const auth = request.headers.get('authorization') || '';
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPcDb() || !process.env.OPENSEA_API_KEY || !hasEmblemKey()) {
    return NextResponse.json({ ok: false, error: 'missing env: DATABASE_URL / OPENSEA_API_KEY / EMBLEM_API_KEY' }, { status: 503 });
  }

  const report = { listings: 0, classified: 0, verified: 0, verifyErrors: 0, skipped: 0 };
  let newTokenBudget = NEW_TOKEN_BUDGET;

  for (const src of await listingSources()) {
    const fresh = [];
    for await (const raw of osListings(src.slug)) {
      const l = normalizeListing(raw);
      if (!l) continue;

      // Which card? Known vaults answer instantly; unknown tokens (curated OR
      // legacy — curated titles carry the asset name too) classify via the
      // OpenSea NFT title against the allow-list, on a per-run budget.
      let card = null, collection = src.collection;
      const known = await getKnownVault(l.tokenId);
      if (known) {
        if (known.state === 'other') { report.skipped++; continue; }
        card = known.card; collection = known.collection || collection;
      } else if (newTokenBudget > 0) {
        newTokenBudget--;
        card = matchCardInText(await osNftName(src.contract, l.tokenId));
        if (card) {
          collection = lookupBundled(card)?.collection || collection;
          report.classified++;
        } else if (src.legacy) {
          // Legacy is mixed collections — a non-matching title means not a pepe.
          await upsertVault(l.tokenId, src.contract, { state: 'other', card: null, collection: null, contents: [], btcAddress: '', recordedProject: '', expectedProject: '' });
          report.skipped++; continue;
        }
      } else if (src.legacy) {
        continue; // over budget — next run picks it up
      }

      await upsertListing(l, card, collection);
      fresh.push(l.orderHash);
      report.listings++;
    }
    await deactivateStaleListings(fresh, src.contract);
  }

  // Verify new + stale vaults; backfill the card onto the listing rows so the
  // browse grid always has names/images once a vault is verified.
  for (const row of await staleVaultTokenIds(VERIFY_BUDGET)) {
    try {
      const v = await verifyVault(row.token_id, { nudge: false });
      await upsertVault(row.token_id, row.contract, v);
      if (v.card) {
        await sql`UPDATE pc_listings SET card = ${v.card}, collection = ${v.collection} WHERE token_id = ${row.token_id} AND card IS NULL`;
      }
      report.verified++;
    } catch (e) {
      report.verifyErrors++;
      console.error('[PepeCheck] verify failed', row.token_id, String(e?.message || e).slice(0, 120));
    }
  }

  return NextResponse.json({ ok: true, ...report });
}
