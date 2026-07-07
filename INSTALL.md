# PepeCheck → wherepepe.com integration

PepeCheck lives at **wherepepe.com/check**. All new code is namespaced
(pc_ tables, pc- CSS classes, /api/pepecheck/*) so nothing collides with
the existing site.

## Files — where they go (GitHub web UI)

NEW files:
- app/check/layout.js
- app/check/pc.css
- app/check/page.js
- app/check/[tokenId]/page.js
- app/api/pepecheck/verify/route.js
- app/api/pepecheck/cron/route.js
- lib/pepecheck.js
- PC_SCHEMA.sql            (not deployed — run it in Neon, keep in repo for reference)

REPLACE existing files:
- vercel.json              (adds the 10-min PepeCheck cron alongside the hourly refresh)
- lib/emblemVault.js       (one change: vaultStatus now takes { nudge } so bulk
                            verification can skip the slow refresh call)
- app/components/MovesPanel.js  (one addition: "Verify on PepeCheck ✓" link
                            next to the vault id)

EDIT by hand:
- package.json → add to dependencies:  "@neondatabase/serverless": "^0.10.4"

## Setup

1. Neon: create a database (or reuse one), run PC_SCHEMA.sql in the SQL console.
2. Vercel env vars (EMBLEM_API_KEY and OPENSEA_API_KEY already exist):
   - DATABASE_URL  — Neon connection string
   - CRON_SECRET   — any random string (Vercel Cron sends it automatically)
3. Deploy. First index: hit /api/pepecheck/cron once with
   Authorization: Bearer <CRON_SECRET>, or wait 10 minutes.

## What ships

- /check            — checker hero (paste tokenId or OpenSea URL) + badge grid
- /check/{tokenId}  — shareable rubber-stamp verdict, links to your existing
                      /card/{ASSET} floor pages (native vs wrapped — the two
                      products complete each other)
- /api/pepecheck/verify?tokenId= — public JSON verdict
- Indexer: curated Rare Pepe + Fake Rares slugs (already in lib/collections.js)
  plus the Emblem Legacy contract, classified via the allow-list; vault-state
  history recorded on every state change.

Build verified: `next build` exit 0 with all four routes registered.
(Note: the build shows a pre-existing warning about getWrappedByAsset in
app/api/wrapped-counts/route.js — it was there before this drop.)
