# WherePepe × Emblem Vault — Integration Audit (reconciled)

**Scope:** the "MovePepe" wrap/mint flow at `wherepepe.com/moves`.
**Sources of truth:** the real `emblem-vault-sdk@2.11.0` (installed + run), the **main-branch TypeScript source** (`src/evm-operations.ts`, `types.ts`, `utils.ts`, `signing-messages.ts`), the official skill, and **live `mint-curated` calls with a key I control**.
**Reconciles two independent audits:** this one (create-side / funding) and *Fable's* (client-side mint). **Both were correct and complementary.**

Everything below is confirmed, not theorized. The single live test that unlocked it:

```
create vault with CORRECT allow-list targetAsset → sign as creator → POST mint-curated {method:'buyWithSignedPrice'}
→ {"err":true, "signedByCreator":true, "loaded":false, "msg":"Not Loaded"}
```

That one response proves (a) the method was wrong, and (b) the true gate is "loaded".

---

## Verdict

The mint had **two real client/server bugs that masked the real state**, plus a **create-side correctness violation**. In priority order:

1. **Wrong `mint-curated` method** — we sent `buyWithQuote`; the current SDK sends **`buyWithSignedPrice`**. `buyWithQuote` is unrecognized and returns a *generic* `signedByCreator:false`, which is the misleading "must be signed by the same wallet that created the vault" the user kept seeing. With `buyWithSignedPrice` the server returns the **truth**: `signedByCreator:true, msg:"Not Loaded"`. **[Confirmed live]**
2. **`toBig` can't parse Emblem's `{hex}` BigNumbers** (Fable Bug 1) — `_price/_tokenId/_nonce` are typed `{hex:string} | string | number` (types.ts:175-178); the SDK ships `parseBigIntValue()` for exactly this. Our `BigInt(String(v))` throws `Cannot convert [object Object] to a BigInt`. Latent until the mint gets past auth — but a guaranteed breaker once it does. **[Confirmed vs source]**
3. **The vault must be `loaded`** — mint-curated refuses an unfunded vault with `msg:"Not Loaded"`. A vault auto-loads when Emblem detects a balance (`utils.ts:451 autoLoad && balance.length>0`). Our vaults show empty because Emblem hasn't indexed the Counterparty deposit yet. **[Confirmed live]**
4. **Invented `targetAsset` on `select` collections** — both Rare Pepe and Fake Rares are `select` (allow-list only); `targetAsset` must be copied from `getAssetMetadata()`. We built it from WherePepe's own catalog (wrong image) and never validated the asset↔collection pairing (PEPECASH, a Rare Pepe, was vaulted into Fake Rares). This does **not** block *loading* (the balance scan keys on the asset at the address, not the image), but it is a contract violation that produces structurally-wrong vaults and fails `allowed()`. **[Confirmed vs SDK]**

**The earlier "checksum" and "Emblem outage" theories in my first pass were misdiagnoses** (see §5). The checksum diff was display-only; the 504s were real but separate noise.

---

## 1. Fix — mint method + BigNumber (the actual mint breakers)

**Server (`lib/emblemVault.js`):**
```js
body: { method: 'buyWithSignedPrice', tokenId, signature, chainId: '1' }   // was buyWithQuote
```

**Client (`app/components/MovesPanel.js`):**
```js
// {hex}-aware, mirrors the SDK's parseBigIntValue()
const toBig = (v) => {
  if (typeof v === 'bigint') return v;
  if (v && typeof v === 'object' && 'hex' in v) return BigInt(v.hex);
  return BigInt(String(v ?? 0));
};
```
On-chain call reverted to the SDK's exact shape (`evm-operations.ts:210-228`) — **no quote contract, no hardcoded $20** (kills Fable Bug 2):
```js
const price  = toBig(m._price);                       // the signed wei price IS the value
const serial = (typeof m.serialNumber === 'string' && m.serialNumber.startsWith('0x')) ? m.serialNumber : '0x'; // Fable Bug 3 guard
writeContract({ functionName: 'buyWithSignedPrice',
  args: [m._nftAddress, ZERO, price, m._to, toBig(m._tokenId), toBig(m._nonce), m._signature, serial, 1n],
  value: price });
```
All three of Fable's findings are implemented. Handler `0x2385…4460`, ZERO payment, `value = _price`, and the `Curated Minting: <tokenId>` message all match the SDK exactly (verified).

**Status: shipped.**

---

## 2. The real remaining gate — "Not Loaded"

With the method fixed, the honest error surfaces: the vault must be **loaded** (Emblem must register the Counterparty deposit). This is server-side and out of our code's control. For our two vaults, `metadata.values` is `[]` = not loaded.

- The mint route now reports this truthfully ("Your deposit isn't loaded into the vault yet…") instead of the misleading creator error.
- **This will clear on its own** once Emblem indexes the deposit (the coins are provably on-chain at the vault address). Our earlier `refreshBalanceForTokenId` nudge + `?live=true` read is the correct trigger; it was failing only because Emblem's backend was 504ing during testing.

---

## 3. Fix — `targetAsset` from the allow-list + collection validation

Not a mint breaker, but a real contract violation to correct (create-side):
- Source `targetAsset` from `GET https://v3.emblemvault.io/asset_metadata/{asset}` (server-side, no 64 MB bundle) → use its `image` and `project_name`.
- **Derive** the collection from the asset's `project_name` instead of a free UI toggle; reject assets not on any allow-list. This prevents the PEPECASH-in-Fake-Rares class of invalid vault.
- Caveat found while verifying: the remote endpoint is incomplete (`/asset_metadata/FROGDNA` → `[]` though FROGDNA *is* in the bundled Fake Rares list). So the robust version must handle gaps (fall back to the bundled `getAssetMetadata`, or fail closed with a clear message). **Recommended, not yet shipped — flagged for the pair-audit.**

---

## 4. Funded-detection fallback masks state (still true, now contextualized)

`vaultStatus()` falls back to reading raw Counterparty balance and tells the user "✅ … is in the vault (confirmed on Counterparty)". That is **on-chain truth but not Emblem-loaded truth**. It let the user attempt a mint the server will reject with "Not Loaded". Keep the Counterparty read as an *informational* "coins arrived" note; gate mint readiness on Emblem's `metadata.values` / a successful `mint-curated`, not on Counterparty.

---

## 5. Misdiagnoses (kept for the record)

- **"Checksum"** — the recovered-vs-stored case difference was display-only; Emblem normalizes stored addresses to lowercase. `signedByCreator:false` came from the wrong *method*, not case. (The `checksum()` on outbound addresses is harmless hygiene; keep it, it's not the fix.)
- **"Emblem outage / indexer globally down"** — the 504s were real but a separate transient issue; they blocked my *reproduction*, not the integration. The CEO's "everything is in the skill" was the right nudge: running the SDK against the vault (10 min) beat hours of symptom-theorizing.

**Process lesson:** I should have installed and run the SDK against the live vault on turn one. Fable did essentially that (read the source) and landed Bug 1 immediately.

---

## 6. State of the two vaults

| tokenId | asset / collection | correctness | can it mint? |
|---|---|---|---|
| `43602762693212971` | FROGDNA / Fake Rares | name+collection correct, **image** wrong | **Yes**, once Emblem *loads* the deposit — image doesn't block loading. Deploy the mint fix, wait for load, mint. |
| `73221677409551751` | PEPECASH / **Fake Rares** | **wrong collection** (PEPECASH is Rare Pepe) | No — structurally invalid. Recreate correctly (PEPECASH → Rare Pepe) via the §3 fix. |

FROGDNA is safe at `1CX4qCqz…` throughout.

---

## 7. Verified-correct (do not touch)

Sign message `Curated Minting: <tokenId>` (matches `signing-messages.ts`); handler `0x23859b…4460`; `chainId:'1'` string in the mint-curated body; the create-template shape; the server-side signature-recovery diagnostic in the mint route (it's what proved the signature was valid all along); resume-by-tokenId + the truncated-tokenId recovery.

---

## 8. Patch order

1. **`buyWithSignedPrice` + `{hex}`-aware `toBig` + serial guard** — *shipped* (§1). Unmasks the real error and makes the on-chain mint robust.
2. **Wait for the FROGDNA vault to load**, then mint `43602762693212971` (§2/§6).
3. **`targetAsset` from `getAssetMetadata` + collection derivation** (§3) — for correctness and to fix the PEPECASH vault.
4. Demote the Counterparty fallback to informational (§4).

---

*Credit to Fable: Bug 1 (`{hex}` BigNumber) and the `buyWithSignedPrice` method call were the two that actually move the needle, and both are verified against the SDK source and a live mint-curated call. This document merges that with the create-side / "Not Loaded" findings so the pair-audit has one coherent picture.*
