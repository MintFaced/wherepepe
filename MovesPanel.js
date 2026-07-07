'use client';

import { useState, useEffect, useRef } from 'react';

const STEPS = {
  wrap: [
    ['1', 'Create a place for Pepe to move to', 'We create an Emblem Vault for your Pepe and give you a Bitcoin deposit address.'],
    ['2', 'MovePepe', 'Send exactly 1 Pepe to the Bitcoin deposit address from your Counterparty wallet (Freewallet, etc.).'],
    ['3', 'Mint on ETH', 'Check Pepe has been moved into the vault. Then mint the vault NFT with your Eth wallet. Now Pepe trades on OpenSea.'],
  ],
  unwrap: [
    ['1', 'Choose which Pepe to move from ETH', 'Connect the ETH wallet holding the wrapped Pepe you want to move.'],
    ['2', 'Sign to MovePepe', 'Your wallet signs and burns the vault NFT to release the contents.'],
    ['3', 'MovePepe to BTC', 'You receive the vault’s private key. Import it to control the Pepe on Counterparty again.'],
  ],
};

// Visual journey for each direction.
const DIAGRAM = {
  wrap: [
    { ico: '₿', cls: 'btc', label: 'Pepe on BTC' },
    { ico: '🔒', cls: 'vault', label: 'Emblem Vault' },
    { ico: 'Ξ', cls: 'eth', label: 'Pepe on ETH' },
  ],
  unwrap: [
    { ico: 'Ξ', cls: 'eth', label: 'Pepe on ETH' },
    { ico: '🔥', cls: 'vault', label: 'Burn vault' },
    { ico: '₿', cls: 'btc', label: 'Pepe on BTC' },
  ],
};

// Emblem VaultHandler (mint) on Ethereum mainnet — matches the SDK's
// getHandlerContract (utils.ts). The mint is paid via buyWithSignedPrice:
// the signer's `_price` is the exact wei msg.value, so no quote contract.
const HANDLER = '0x23859b51117dbFBcdEf5b757028B18d7759a4460';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'; // _payment = native ETH
// WherePepe service fee, taken as a separate ETH transfer during mint.
// Change FEE_ADDRESS to your treasury wallet.
const FEE_ADDRESS = '0xd40B63bF04a44e43fBFE5784bCf22ACaAB34a180';
const FEE_ETH = '0.0069';
// ABI matches the SDK's canonical mint call (evm-operations.ts submitMintTransaction).
const HANDLER_ABI = [{
  name: 'buyWithSignedPrice', type: 'function', stateMutability: 'payable', outputs: [],
  inputs: [
    { name: '_nftAddress', type: 'address' }, { name: '_payment', type: 'address' },
    { name: '_price', type: 'uint256' }, { name: '_to', type: 'address' },
    { name: '_tokenId', type: 'uint256' }, { name: '_nonce', type: 'uint256' },
    { name: '_signature', type: 'bytes' }, { name: 'serialNumber', type: 'bytes' },
    { name: '_amount', type: 'uint256' },
  ],
}];
// Port of the SDK's parseBigIntValue (utils.ts): Emblem serializes _price,
// _tokenId and _nonce as ethers BigNumbers — i.e. `{ hex: '0x…' }` objects.
// A plain BigInt(String(v)) turns those into "[object Object]" and throws,
// which is exactly what killed the mint step.
const toBig = (v) => {
  if (typeof v === 'bigint') return v;
  if (v && typeof v === 'object' && 'hex' in v) return BigInt(v.hex);
  return BigInt(String(v ?? 0));
};
// serialNumber is passed on-chain as `bytes`; viem requires 0x-hex.
const toBytes = (v) => (typeof v === 'string' && v.startsWith('0x') ? v : '0x');

export default function MovesPanel({ initialAsset, initialDir, initialCollection }) {
  const [dir, setDir] = useState(initialDir || 'wrap');
  const [asset, setAsset] = useState(initialAsset || '');
  const [collection, setCollection] = useState(initialCollection || 'rare-pepe');
  const [wallet, setWallet] = useState('');
  const [configured, setConfigured] = useState(null);
  const [busy, setBusy] = useState(false);
  const [vault, setVault] = useState(null);
  const [balances, setBalances] = useState(null);
  const [loaded, setLoaded] = useState(false); // Emblem has loaded the deposit — the true mint gate
  const [mismatch, setMismatch] = useState(null); // vault created into the wrong collection — can never mint
  const [error, setError] = useState('');
  const [minted, setMinted] = useState(null);
  const [mintStatus, setMintStatus] = useState('');
  const [resumeId, setResumeId] = useState('');
  const [depositSource, setDepositSource] = useState('');
  const [myList, setMyList] = useState(null);
  const pollRef = useRef(null);

  async function findVaults(vaultType = 'created') {
    if (!wallet) { setError('Connect your ETH wallet first.'); return; }
    setError(''); setBusy(true); setMyList(null);
    try {
      const r = await fetch(`/api/emblem/my-vaults?address=${wallet}&vaultType=${vaultType}`);
      const d = await r.json().catch(() => null);
      if (d?.ok) setMyList(d.vaults || []);
      else setError(d?.error || `Could not fetch your vaults (HTTP ${r.status}).`);
    } catch { setError('Network error while fetching your vaults — try again.'); } finally { setBusy(false); }
  }

  useEffect(() => {
    fetch('/api/emblem/status').then((r) => r.json()).then((d) => setConfigured(Boolean(d.configured))).catch(() => setConfigured(false));
    return () => clearInterval(pollRef.current);
  }, []);

  async function connectWallet() {
    setError('');
    if (!window.ethereum) { setError('No Ethereum wallet found — install MetaMask.'); return; }
    try {
      const [addr] = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setWallet(addr);
    } catch { setError('Wallet connection cancelled.'); }
  }

  async function createVault() {
    setError(''); setBusy(true); setVault(null); setBalances(null); setLoaded(false); setMismatch(null);
    try {
      // Collection is derived SERVER-SIDE from the asset's allow-list entry
      // (Rare Pepe / Fake Rares are select collections) — we don't send one.
      const r = await fetch('/api/emblem/vault', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toAddress: wallet, asset }),
      });
      const d = await r.json();
      if (r.status === 503) { setConfigured(false); return; }
      if (!d.ok) { setError(d.error || 'Could not create the vault.'); return; }
      setVault(d.vault);
      if (d.vault?.collection) setCollection(d.vault.collection);
    } catch { setError('Network error.'); } finally { setBusy(false); }
  }

  async function checkDeposit() {
    if (!vault?.tokenId) return;
    setBusy(true); setError('');
    try {
      const d = await fetch(`/api/emblem/vault?tokenId=${encodeURIComponent(vault.tokenId)}`).then((r) => r.json());
      if (!d.ok) { setError(d.error || 'Check failed.'); return; }
      const b = d.balances || [];
      setBalances(b);
      setLoaded(Boolean(d.loaded)); // only Emblem's own indexer unlocks the mint
      setMismatch(d.mismatch ? { asset: d.asset, recorded: d.recordedProject, expected: d.expectedProject } : null);
      setDepositSource(d.source || b[0]?.source || '');
      // Recover the BTC deposit address for a resumed (tokenId-only) vault.
      if (d.btcAddress) setVault((v) => (v && !btcAddr(v.addresses) ? { ...v, addresses: [{ coin: 'BTC', address: d.btcAddress }] } : v));
      if (b.length === 0) {
        setError(`No Pepe detected in the vault yet — Emblem may still be indexing your Counterparty deposit. Give it a minute and check again.${d.raw?.method ? ` (${d.raw.method})` : ''}`);
      }
    } catch {
      setError('Could not check the vault yet — try again in a moment.');
    } finally { setBusy(false); }
  }

  async function doMint() {
    setError(''); setMintStatus(''); setBusy(true);
    try {
      const { createWalletClient, createPublicClient, custom, http } = await import('viem');
      const { mainnet } = await import('viem/chains');
      const walletClient = createWalletClient({ account: wallet, chain: mainnet, transport: custom(window.ethereum) });
      const publicClient = createPublicClient({ chain: mainnet, transport: http() });
      try { await walletClient.switchChain({ id: 1 }); } catch { /* already on mainnet */ }

      setMintStatus('✍️ Sign the mint request in your wallet…');
      const signature = await walletClient.signMessage({ account: wallet, message: `Curated Minting: ${vault.tokenId}` });

      setMintStatus('🔑 Authorizing the mint…');
      const r = await fetch('/api/emblem/mint', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId: vault.tokenId, signature }),
      }).then((x) => x.json());
      if (!r.ok) { setError(r.error || 'Mint authorization failed.'); setMintStatus(''); return; }
      const m = r.mintSig;

      // The signed `_price` IS the msg.value (native ETH; _payment = zero address).
      // Fields may arrive as `{ hex: '0x…' }` — toBig handles all shapes.
      const price = toBig(m._price);
      const value = price;

      // WherePepe service fee — a separate ETH transfer to the treasury.
      if (FEE_ADDRESS && Number(FEE_ETH) > 0) {
        const { parseEther } = await import('viem');
        setMintStatus(`💚 Confirm the WherePepe fee (${FEE_ETH} ETH)…`);
        const feeHash = await walletClient.sendTransaction({ account: wallet, to: FEE_ADDRESS, value: parseEther(FEE_ETH) });
        setMintStatus('⏳ Waiting for the fee to confirm…');
        await publicClient.waitForTransactionReceipt({ hash: feeHash });
      }

      setMintStatus('🚀 Confirm the mint transaction in your wallet…');
      const hash = await walletClient.writeContract({
        address: HANDLER, abi: HANDLER_ABI, functionName: 'buyWithSignedPrice',
        args: [m._nftAddress, ZERO_ADDRESS, price, m._to, toBig(m._tokenId), toBig(m._nonce), m._signature, toBytes(m.serialNumber), 1n],
        value,
      });

      setMintStatus('⏳ Waiting for confirmation…');
      await publicClient.waitForTransactionReceipt({ hash });
      setMinted({ hash, nft: m._nftAddress, tokenId: toBig(m._tokenId).toString() });
      setMintStatus('');
    } catch (e) {
      setError(e?.shortMessage || e?.details || e?.message || 'Mint failed.');
      setMintStatus('');
    } finally { setBusy(false); }
  }

  function btcAddr(a) {
    if (!a) return '';
    const arr = Array.isArray(a) ? a : Object.values(a);
    const btc = arr.find((x) => /btc|bitcoin|counterparty|xcp/i.test((x?.coin || x?.chain || x?.name || x?.network || '')));
    return btc?.address || arr[0]?.address || arr[0] || '';
  }
  const depositAddr = btcAddr(vault?.addresses);
  const deposited = Array.isArray(balances) && balances.length > 0;

  return (
    <main className="container moves">
      <div className="moves-head">
        <h1>MovePepe</h1>
        <p className="moves-sub">Move a Pepe between <b>Eth</b> and <b>BTC</b> blockchains using Emblem Vault.</p>
      </div>

      <div className="moves-toggle" role="group" aria-label="Direction">
        <button className={dir === 'wrap' ? 'active' : ''} onClick={() => { setDir('wrap'); setVault(null); setBalances(null); setLoaded(false); setMismatch(null); setMyList(null); }}>MovePepe to ETH</button>
        <button className={dir === 'unwrap' ? 'active' : ''} onClick={() => { setDir('unwrap'); setVault(null); setBalances(null); setLoaded(false); setMismatch(null); setMyList(null); }}>MovePepe to BTC</button>
      </div>

      {configured === false && (
        <div className="moves-banner">⏳ <b>MovePepe is almost live.</b> Waiting on the Emblem API key — the flow below activates the moment it’s set.</div>
      )}

      <div className="moves-card">
        <div className="mp-diagram">
          {DIAGRAM[dir].flatMap((node, i) => [
            i > 0 && <div className="mp-arrow" key={`a${i}`} aria-hidden="true">→</div>,
            <div className="mp-node" key={`n${i}`}>
              <div className={`mp-ico ${node.cls}`}>{node.ico}</div>
              <span className="mp-lbl">{node.label}</span>
            </div>,
          ]).filter(Boolean)}
        </div>

        <div className="moves-steps">
          {STEPS[dir].map(([n, t, d]) => (
            <div className="mstep" key={n}><span className="mstep-n">{n}</span><div><b>{t}</b><p>{d}</p></div></div>
          ))}
        </div>

        <div className="moves-form">
          {dir === 'wrap' ? (
            <>
              <label className="mfield">
                <span>Which Pepe?</span>
                <input value={asset} onChange={(e) => setAsset(e.target.value.toUpperCase())} placeholder="e.g. FROGDNA" />
              </label>
              <div className="mhint" style={{ fontSize: '12px' }}>Collection (Rare Pepe / Fake Rare) is detected automatically from the asset name — only allow-listed assets can be vaulted.</div>
              <button className="btn-connect" onClick={connectWallet}>{wallet ? `🔗 ${wallet.slice(0, 6)}…${wallet.slice(-4)}` : '🔗 Connect ETH wallet (where the NFT lands)'}</button>
              <button className="btn-move" disabled={!asset || !wallet || busy} onClick={createVault}>{busy && !vault ? 'Creating vault…' : 'Create vault & get deposit address'}</button>
              <div className="mresume">
                <input value={resumeId} onChange={(e) => setResumeId(e.target.value.trim())} placeholder="…or resume a vault: paste its tokenId" />
                <button className="btn-copy" onClick={() => { if (!resumeId) return; setVault({ tokenId: resumeId, addresses: [] }); setBalances(null); setLoaded(false); setMismatch(null); }}>Resume</button>
              </div>
              {wallet && <button className="btn-connect" onClick={() => findVaults('created')} disabled={busy}>🔍 Find my created vaults</button>}
              {myList && (
                <div className="mvaults">
                  {myList.length === 0
                    ? <div className="mdep-note">No created vaults for this wallet yet.</div>
                    : myList.map((v) => {
                      const btc = btcAddr(v.addresses);
                      return (
                        <button key={v.tokenId} className="mvault-item" onClick={() => { setVault({ tokenId: v.tokenId, addresses: v.addresses }); setBalances(null); setLoaded(false); setMismatch(null); setMyList(null); }}>
                          <b>{v.asset || 'Pepe'}</b>
                          {btc ? <code title={btc}>₿ {btc.slice(0, 8)}…{btc.slice(-6)}</code> : <code>{v.tokenId.slice(0, 12)}…</code>}
                          <span>Resume →</span>
                        </button>
                      );
                    })}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="mhint">Connect the ETH wallet holding the wrapped Pepe you want to move back to Bitcoin.</p>
              <button className="btn-connect" onClick={connectWallet}>{wallet ? `🔗 ${wallet.slice(0, 6)}…${wallet.slice(-4)}` : '🔗 Connect ETH wallet'}</button>
              <button className="btn-move" disabled={!wallet || busy} onClick={() => findVaults('vaulted')}>{busy ? 'Finding…' : 'Find my wrapped Pepes'}</button>
              {myList && (
                <div className="mvaults">
                  {myList.length === 0
                    ? <div className="mdep-note">No wrapped Pepes found for this wallet.</div>
                    : myList.map((v) => (
                      <a key={v.tokenId} className="mvault-item" href={`https://emblem.finance/nft2?id=${v.tokenId}`} target="_blank" rel="noopener">
                        <b>{v.asset || 'Pepe'}</b><code>{v.tokenId.slice(0, 12)}…</code><span>Unwrap on Emblem ↗</span>
                      </a>
                    ))}
                </div>
              )}
              <p className="mhint" style={{ fontSize: '12px', marginTop: '4px' }}>
                Unwrapping burns the vault NFT and releases your Pepe’s <b>Bitcoin private key</b> (via Emblem’s Torus network). For your security that key-reveal happens on <b>Emblem’s own audited app</b> — WherePepe hands you off rather than ever touching your private key.
              </p>
            </>
          )}
        </div>

        {dir === 'wrap' && vault && (
          <div className="moves-deposit">
            {depositAddr ? (
              <>
                <div className="mdep-k">Send exactly <b>1 {asset || 'Pepe'}</b> to this Bitcoin address:</div>
                <div className="mdep-addr">{depositAddr}</div>
                <button className="btn-copy" onClick={() => navigator.clipboard?.writeText(depositAddr)}>Copy address</button>
              </>
            ) : (
              <div className="mdep-k">Resumed vault — check the balance, then mint.</div>
            )}
            <div className="mdep-row">
              <button className="btn-connect" onClick={checkDeposit} disabled={busy}>{busy ? 'Checking…' : 'Check Pepe is in the vault'}</button>
              {deposited && !mismatch && loaded && (
                <span className="mdep-ok">✅ {balances[0]?.name || 'Pepe'} is loaded in the vault{vault.collection ? ` (${vault.collection === 'fake-rare' ? 'Fake Rare' : 'Rare Pepe'})` : ''} — ready to mint</span>
              )}
              {deposited && !mismatch && !loaded && (
                <span className="mdep-ok">🟡 {balances[0]?.name || 'Pepe'} arrived on-chain — waiting for Emblem to load the vault</span>
              )}
            </div>
            {mismatch && (
              <div className="moves-error">
                ⛔ <b>This vault can’t mint — it was created into the wrong collection.</b> {mismatch.asset || 'This asset'} belongs to <b>{mismatch.expected}</b>, but the vault was created as <b>{mismatch.recorded}</b>, so Emblem’s allow-list check will always reject it — waiting won’t help. Create a fresh vault for {mismatch.asset || 'the asset'} (the collection is now detected automatically){deposited ? ', and contact Emblem support to recover the coins already deposited in this one — don’t send anything more to its address' : ''}.
              </div>
            )}
            {deposited && !mismatch && !loaded && (
              <div className="mdep-note">Your Pepe is confirmed on Counterparty, but Emblem hasn’t loaded it into the vault yet — minting unlocks the moment it does. Nothing’s wrong on your end; check again in a few minutes.</div>
            )}
            {deposited && !mismatch && loaded && !minted && (
              <>
                <div className="mdep-note">Minting costs Emblem’s curated fee (priced in ETH by Emblem at mint time) + a {FEE_ETH} ETH WherePepe fee + gas. Two wallet confirmations.</div>
                <button className="btn-move" disabled={busy} onClick={doMint}>{busy ? 'Minting…' : 'Mint on ETH →'}</button>
              </>
            )}
            {mintStatus && <div className="mdep-note">{mintStatus}</div>}
            {minted && (
              <div className="moves-success">
                🎉 <b>Pepe moved to Ethereum!</b>
                <div className="mdep-row">
                  <a className="btn-connect" href={`https://opensea.io/item/ethereum/${minted.nft}/${minted.tokenId}`} target="_blank" rel="noopener">View on OpenSea ↗</a>
                  <a className="mdep-tx" href={`https://etherscan.io/tx/${minted.hash}`} target="_blank" rel="noopener">transaction ↗</a>
                </div>
              </div>
            )}
            <div className="mdep-note">Vault id <code className="mdep-tid">{String(vault.tokenId)}</code> <button className="btn-copy" onClick={() => navigator.clipboard?.writeText(String(vault.tokenId))}>copy</button> — save it to resume this vault later. <a href={`/check/${vault.tokenId}`} target="_blank" rel="noreferrer">Verify on PepeCheck ✓</a></div>
          </div>
        )}

        {error && <div className="moves-error">{error}</div>}

        <div className="moves-warn">
          ⚠️ This moves a <b>real asset</b> across chains. Double-check the address and asset name — cross-chain moves can’t be undone. Only official <b>Rare Pepe</b> and <b>Fake Rare</b> curated collections are supported.
        </div>
      </div>
    </main>
  );
}
