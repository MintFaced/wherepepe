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
| Wrapped **count per card** | OpenSea v2 `/traits` (trait distribution, one call) | `OPENSEA_API_KEY` |
| Wrapped **floor per card** | OpenSea v2 item listings | *later pass — see Roadmap* |

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
| `OPENSEA_API_KEY` | optional | Enables **per-card wrapped counts** (and the wrapped-vs-native split). Without it, the app still runs and shows the collection-level Emblem floor with all supply as native. Get one at <https://docs.opensea.io/reference/api-keys>. |
| `EMBLEM_API_KEY` | optional (future) | For exact on-chain wrapped counts via Emblem vault addresses. |
| `EMBLEM_API_URL` | optional (future) | Defaults to `https://api.emblemvault.ai`. |
| `NEXT_PUBLIC_SITE_URL` | recommended | Your production URL (e.g. `https://where-pepe.vercel.app`). Used for absolute OG/Twitter image URLs. |

---

## Deploy to Vercel

1. Push this folder to a Git repository.
2. In Vercel, **New Project → Import** the repo. Framework preset auto-detects
   **Next.js** — no config needed.
3. Add the environment variables above (at minimum `NEXT_PUBLIC_SITE_URL`; add
   `OPENSEA_API_KEY` when you enable per-card wrapped data).
4. **Deploy.** Vercel runs `next build` and serves it.

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
  "wrappedCounts":  { "hasKey": true, "ok": true, "traitUsed": "Card",
                      "cardsMatched": 1700, "samples": [ ... ] },
  "summary":        { "nativeReady": true, "openSeaKey": true,
                      "perCardWrappedReady": true }
}
```

- `summary.nativeReady` should be `true` immediately (no key needed).
- After you set `OPENSEA_API_KEY`, `summary.perCardWrappedReady` flips to `true`.
  Sanity-check `wrappedCounts.traitUsed` (the auto-detected identifying trait)
  and `cardsMatched` (how many of the 1,774 cards resolved). A healthy match is
  most of them; a low number means the trait auto-detection needs a tweak.

---

## Architecture

```
Browser ──► Next.js server (Vercel) ──► pepe.wtf / tokenscan / counterparty / coingecko / opensea
                                        (all keys + external calls stay server-side)
```

- `app/page.js` — server-renders the full catalog into the gallery (instant first paint).
- `app/components/Gallery.js` — client: search, series filter, sort, infinite scroll, lazy floor enrichment.
- `app/card/[asset]/page.js` — server-rendered card detail with per-card OG tags.
- `app/api/*` — `cards` (catalog), `enrich` (batch floors for the grid), `card/[asset]` (full detail).
- `lib/*` — `catalog`, `native`, `wrapped`, `rates`, `cache`, `format`.

---

## Roadmap

- **✅ Per-card wrapped counts (OpenSea):** done — derived from the
  `rare-pepe-curated` trait distribution, with self-correcting trait detection.
  Activates when `OPENSEA_API_KEY` is set. (`lib/wrapped.js`)
- **Per-card wrapped floor:** enumerate a card's listings on OpenSea for a true
  per-card Emblem floor (currently collection-level). Heavier — per-item calls.
- **Exact on-chain split (Emblem API):** intersect Counterparty holder balances
  with the set of Emblem vault addresses for the most accurate "currently
  wrapped" count (survives stale OpenSea listings from redeemed vaults). This
  also excludes redeemed vaults that the trait count can over-include.
- Nice-to-haves: enable the "Mostly wrapped / Mostly native" filter once counts
  are live, price history (Vercel KV/Postgres), series pages.
