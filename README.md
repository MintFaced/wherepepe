# 🐸 Where Pepe

**Wrapped vs native — for every Rare Pepe.**

For each of the 1,774 cards in the Rare Pepe Directory, Where Pepe shows total
supply, how much is **native** on Counterparty (Bitcoin) vs **wrapped** in Emblem
Vault (Ethereum), and the floor price at each location — all normalized to **ETH**.

Built with Next.js (App Router). All external data is fetched server-side; no
API keys ever reach the browser.

---

## Data sources

| Data | Source | Auth |
|------|--------|------|
| Card catalog (1,774 cards, art, series, supply, artist) | `pepe.wtf/api/assets` (filtered to the "Rare Pepes" collection) | none |
| Native floor (BTC / XCP → ETH) | `tokenscan.io` | none |
| Holders / supply (source of truth) | `api.counterparty.io:4000/v2` | none |
| BTC / XCP → ETH conversion | CoinGecko | none |
| Wrapped floor (collection-level) | OpenSea v2 public stats (`rare-pepe-curated`) | none |
| Wrapped **count + floor per card** | OpenSea sweep (NFT enumeration + listings), scheduled | `OPENSEA_API_KEY` |
| Wrapped **total** (authoritative) | Emblem v3 `/asset_metadata/projects/vaulted` | `EMBLEM_API_KEY` |

Responses are cached in-memory with sensible TTLs (catalog 1 day, floors 1 hour,
rates 10 min) so upstream APIs aren't hammered.

---

## Local development

```bash
npm install
cp .env.example .env.local   # optional — add your OpenSea key
npm run dev                  # http://localhost:3000
```

Production build:

```bash
npm run build && npm start
```

---

## Environment variables

Set these in the Vercel dashboard (**Project → Settings → Environment
Variables**), or in `.env.local` for local dev. All are read **server-side only**.

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENSEA_API_KEY` | optional | Enables **per-card wrapped counts + per-card wrapped floors** (built by the scheduled sweep). Without it, all supply shows as native and the collection-level floor is used. Get one at <https://docs.opensea.io/reference/api-keys>. |
| `CRON_SECRET` | recommended | Protects `/api/cron/refresh` (the sweep). Any random string (`openssl rand -hex 32`); Vercel Cron sends it automatically. |
| `EMBLEM_API_KEY` | optional | Enables the **authoritative total** count of Rare Pepes wrapped in Emblem (header stat + `/api/status`). Read-only. Without it, the stat is hidden. |
| `EMBLEM_V3_URL` | optional | Emblem v3 metadata base. Defaults to `https://v3.emblemvault.io`. |
| `NEXT_PUBLIC_SITE_URL` | recommended | Your production URL (e.g. `https://where-pepe.vercel.app`). Used for absolute OG/Twitter image URLs. |

---

## Deploy to Vercel

1. Push this folder to a Git repository.
2. In Vercel, **New Project → Import** the repo. Framework preset auto-detects
   **Next.js** — no config needed.
3. Add the environment variables above (`NEXT_PUBLIC_SITE_URL`, `OPENSEA_API_KEY`,
   `EMBLEM_API_KEY`, `CRON_SECRET`).
4. **Deploy.** Vercel runs `next build`, serves it, and auto-registers the cron
   in `vercel.json` (`/api/cron/refresh`, every 2 hours).
5. **Warm the snapshot once:** the first sweep populates per-card wrapped data.
   Either wait for the next cron tick, or trigger it manually:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>/api/cron/refresh
   ```
   It takes ~30–60s (it's ~190 OpenSea calls) and returns `{ ok, stats }`.

### The scheduled sweep

Per-card wrapped **count** and **floor** require a `tokenId → asset` index. The
OpenSea NFT *name* encodes the card (`RAREPEPE | Series 1 Card 1`); listings give
`tokenId + price` but not the asset. So `/api/cron/refresh` enumerates the
collection's NFTs (name → asset, and a per-card count) and sweeps listings
(cheapest per token → per-card floor), joining them into a snapshot stored in
Next.js's **Data Cache** (persistent on Vercel — no external store). Page reads
serve that snapshot instantly and never block on the sweep. Runs on `maxDuration`
300s (Pro).

`.gitignore` already excludes `.env*` and `node_modules`, so secrets never land
in Git.

### Verify after deploy

Hit **`/api/status`** on your deployed URL — a one-glance health + wiring check:

```jsonc
{
  "catalog":        { "ok": true, "count": 1774 },
  "rates":          { "ok": true, "btcEth": 35.7 },
  "collectionFloor":{ "ok": true, "floorEth": 0.00218 },
  "sampleNative":   { "asset": "RAREPEPE", "floorEth": 160.9, "holders": 208 },
  "wrappedCounts":  { "hasKey": true, "ok": true, "builtAt": "…",
                      "nfts": 34000, "listings": 1200,
                      "assetsWithCount": 1700, "assetsWithFloor": 600,
                      "samples": [ … ] },
  "emblem":         { "hasKey": true, "ok": true, "vaultedTotal": 49050 },
  "summary":        { "nativeReady": true, "openSeaKey": true,
                      "snapshotReady": true, "perCardCounts": 1700,
                      "perCardFloors": 600, "emblemReady": true }
}
```

- `summary.nativeReady` should be `true` immediately (no key needed).
- After the first sweep runs (`OPENSEA_API_KEY` set + `/api/cron/refresh` hit),
  `summary.snapshotReady` flips to `true`. Check `perCardCounts` (cards with a
  wrapped count — expect most of the 1,774) and `perCardFloors` (cards with an
  active listing — a smaller number). `wrappedCounts.builtAt` shows sweep age.

---

## Architecture

```
Browser ──► Next.js server (Vercel) ──► pepe.wtf / tokenscan / counterparty / coingecko / opensea
                                        (all keys + external calls stay server-side)
```

- `app/page.js` — server-renders the full catalog into the gallery (instant first paint).
- `app/components/Gallery.js` — client: search, series filter, sort, infinite scroll, lazy floor enrichment.
- `app/card/[asset]/page.js` — server-rendered card detail with per-card OG tags.
- `app/api/*` — `cards` (catalog), `enrich` (batch native floors), `card/[asset]` (detail),
  `wrapped-counts` (per-card count+floor snapshot), `cron/refresh` (scheduled sweep), `status`.
- `lib/*` — `catalog`, `native`, `wrapped`, `sweep` (OpenSea sweep + Data Cache), `emblem`, `rates`, `cache`, `format`.

---

## Roadmap

- **✅ Per-card wrapped counts + floors (OpenSea):** done — the scheduled sweep
  enumerates the collection (name → asset) and joins listings for per-card
  floors. (`lib/sweep.js`, `/api/cron/refresh`)
- **✅ Authoritative wrapped total (Emblem):** done — the true total of Rare
  Pepes vaulted in Emblem, via the v3 API. (`lib/emblem.js`)
- **Refinements:** the OpenSea per-card count includes redeemed/empty vaults the
  contract still lists; Emblem's per-project total (49,050) is the authoritative
  cross-check. A fully redemption-aware per-card split would intersect
  Counterparty balances with Emblem vault addresses (needs vault enumeration).
- Nice-to-haves: price history (Vercel KV/Postgres), series pages, a "cheapest
  location" per-card verdict (native vs wrapped, in ETH).
