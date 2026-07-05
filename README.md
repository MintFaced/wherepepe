# 🐸 Where Pepe

**Where's this pepe cheapest?**

For each of the 1,774 cards in the Rare Pepe Directory, Where Pepe compares the
floor price **native** on Counterparty (Bitcoin) against the floor **wrapped** in
Emblem Vault (Ethereum) — both in **ETH** — and tells you which side is cheaper,
and by how much. It also shows the authoritative total of Rare Pepes vaulted in
Emblem (from Emblem's own API).

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
| Wrapped **floor per card** | OpenSea sweep (NFT enumeration + listings), scheduled | `OPENSEA_API_KEY` |
| Native **floor per card** | Counterparty open dispensers (bulk sweep), scheduled | none |
| Wrapped **total** (authoritative) | Emblem v3 `/asset_metadata/projects/vaulted` | `EMBLEM_API_KEY` |

> **Why not a per-card supply %?** The OpenSea "rare-pepe-curated" collection is
> one ERC-1155 token per card *without* the supply extension (`totalSupply`
> reverts), and its "Total Supply" trait is the Counterparty issuance — so the
> exact wrapped-edition count per card isn't exposed. Where Pepe compares
> *floors* instead (real, available data) and reports Emblem's authoritative
> aggregate (49,050) for the total-wrapped figure.

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

`/api/cron/refresh` builds the per-card comparison snapshot:

1. **Wrapped floor** — enumerate the OpenSea collection's NFTs (the name encodes
   the card, `RAREPEPE | Series 1 Card 1`) to map listing `tokenId`s to cards,
   then take the cheapest listing per card.
2. **Native floor** — sweep all open Counterparty dispensers (bulk, cursor
   paginated), min "buy-now" satoshi price per card, converted BTC → ETH.
3. **Verdict** — per card, compare the two and record which is cheaper + the %
   saving.

The snapshot is stored in Next.js's **Data Cache** (persistent on Vercel — no
external store). Page reads serve it instantly and never block on the sweep.
~50 sequential calls; runs on `maxDuration` 300s (Pro).

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
                      "nfts": 1689, "listings": 2628, "dispensers": 900,
                      "wrappedFloors": 1156, "nativeFloors": 800,
                      "comparable": 600, "samples": [ … ] },
  "emblem":         { "hasKey": true, "ok": true, "vaultedTotal": 49050 },
  "summary":        { "nativeReady": true, "openSeaKey": true,
                      "snapshotReady": true, "wrappedFloors": 1156,
                      "nativeFloors": 800, "comparable": 600, "emblemReady": true }
}
```

- `summary.nativeReady` should be `true` immediately (no key needed).
- After the first sweep runs (`OPENSEA_API_KEY` set + `/api/cron/refresh` hit),
  `summary.snapshotReady` flips to `true`. Check `wrappedFloors` (cards with an
  Emblem listing), `nativeFloors` (cards with an open dispenser), and
  `comparable` (cards priced on **both** sides — these get a cheaper-side
  verdict). `wrappedCounts.builtAt` shows sweep age.

---

## ChatPepe (`/chat`)

A **token-gated** global chat. Anyone can read; to **post you must hold at least
one Rare Pepe** (checked against the OpenSea `rare-pepe-curated` collection).
Users connect an Ethereum wallet, sign one message (no gas) to prove ownership,
receive a deterministic Pepe identity (`SmugPepe·a3f2` + avatar) and a **HOLDER**
badge, and chat. The gate is enforced **server-side** (`/api/chat/send` rejects
non-holders with 403), not just in the UI. Non-holders see the **cheapest Rare
Pepe to buy** (with a direct link) instead of a dead end. Members can **edit
their profile** — set a custom handle and pick a **PFP from a Rare Pepe they
own**. Messages poll every ~3s.

> The floor snapshot (below) is also stored in this same KV — the cron writes
> it, reads read it, and a failed sweep never wipes the last-good data.

**Wallet profiles (`/u/[address]`):** clicking a handle in chat opens that
wallet's public profile — its Rare Pepe collection sourced from its **Emblem
Vaults** (`/myvaults`, keyless), so **editions owned per card** come for free.
Each card is valued at the wrapped floor, with a collection total, sortable **by
series** or **by value**, and an "Secured by Emblem Vault" credit. The holder
gate and PFP picker are Emblem-powered too. *(Emblem's `/myvaults` is
case-sensitive — always query the checksummed address.)*

**Artist pages (`/artist/[name]`):** every Rare Pepe by an artist + a market cap
(floor × supply). Linked from each card's Artist field and the pricing filter.

**Chat presence:** a Redis sorted-set tracks who polled in the last 30s → an
"N online" pill in the ChatPepe header.

**Chat features:** emoji picker, threaded **replies** (the quote is looked up
server-side so it can't be forged), a **HOLDER** badge, and an **RP ARTIST**
badge. Artists are an admin allowlist (no reliable ETH-wallet→artist link
exists) — designate one:
```bash
curl -X POST https://<your-app>/api/chat/admin/artist \
  -H "authorization: Bearer $CRON_SECRET" \
  -H "content-type: application/json" \
  -d '{"address":"0x…","name":"Mike"}'
```
Omit `name` (or send empty) to remove the label. The label then shows in chat
and on the wallet profile.

**Setup (one-time):**
1. In Vercel: **Storage → Create Database → KV (Upstash Redis)**, then connect it
   to this project. That injects `KV_REST_API_URL` + `KV_REST_API_TOKEN`.
2. Add env var **`CHAT_SECRET`** (any long random string — `openssl rand -hex 32`).
3. Redeploy. Until KV is set, `/chat` shows a "not configured" notice and stays
   read-only — the rest of the site is unaffected.

**How it works:** `POST /api/chat/login` verifies the signature (viem) and issues
a stateless HMAC session token (carrying the address + holder flag). `POST
/api/chat/send` validates the token, rate-limits (1.5s/wallet), sanitizes, and
appends to a capped Redis list (last 200). `GET /api/chat/messages` returns
them. Identities and sessions never touch the browser as secrets.

---

## Architecture

```
Browser ──► Next.js server (Vercel) ──► pepe.wtf / tokenscan / counterparty / coingecko / opensea
                                        (all keys + external calls stay server-side)
```

- `app/page.js` — server-renders the full catalog into the gallery (instant first paint).
- `app/components/Gallery.js` — client: search, series filter, sort, infinite scroll, lazy floor enrichment.
- `app/card/[asset]/page.js` — server-rendered card detail with per-card OG tags.
- `app/api/*` — `cards` (catalog), `card/[asset]` (detail), `floors` (per-card
  comparison snapshot), `cron/refresh` (scheduled sweep), `status`.
- `lib/*` — `catalog`, `native`, `wrapped`, `sweep` (OpenSea + dispenser sweep + Data Cache),
  `emblem`, `rates`, `cache`, `format`.

---

## Roadmap

- **✅ Cheapest-location verdict (native vs wrapped):** done — per-card floor
  comparison in ETH, with a cheaper-side filter and savings sort.
  (`lib/sweep.js`, `/api/cron/refresh`, `/api/floors`)
- **✅ Authoritative wrapped total (Emblem):** done — the true total of Rare
  Pepes vaulted in Emblem, via the v3 API. (`lib/emblem.js`)
- **Native floor coverage:** currently uses Counterparty *dispensers* (buy-now).
  Adding open DEX orders (XCP/PEPECASH markets) would cover cards that trade only
  on the order book.
- **Exact per-card wrapped supply %:** would need per-token ERC-1155 editions —
  not exposed on-chain (no `totalSupply`) or by OpenSea; a third-party indexer
  (Reservoir/Alchemy) exposes 1155 supply if this is wanted later.
- Nice-to-haves: price history (Vercel KV/Postgres), series pages, USD toggle.
