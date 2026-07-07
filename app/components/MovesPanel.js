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

export default function MovesPanel({ initialAsset, initialDir, initialCollection }) {
  const [dir, setDir] = useState(initialDir || 'wrap');
  const [asset, setAsset] = useState(initialAsset || '');
  const [collection, setCollection] = useState(initialCollection || 'rare-pepe');
  const [wallet, setWallet] = useState('');
  const [configured, setConfigured] = useState(null);
  const [busy, setBusy] = useState(false);
  const [vault, setVault] = useState(null);
  const [balances, setBalances] = useState(null);
  const [error, setError] = useState('');
  const pollRef = useRef(null);

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
    setError(''); setBusy(true); setVault(null); setBalances(null);
    try {
      const r = await fetch('/api/emblem/vault', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection, toAddress: wallet }),
      });
      const d = await r.json();
      if (r.status === 503) { setConfigured(false); return; }
      if (!d.ok) { setError(d.error || 'Could not create the vault.'); return; }
      setVault(d.vault);
    } catch { setError('Network error.'); } finally { setBusy(false); }
  }

  async function checkDeposit() {
    if (!vault?.tokenId) return;
    setBusy(true); setError('');
    try {
      const d = await fetch(`/api/emblem/vault?tokenId=${encodeURIComponent(vault.tokenId)}`).then((r) => r.json());
      if (d.ok) setBalances(d.balances || []);
    } catch { setError('Could not check the vault yet — try again in a moment.'); } finally { setBusy(false); }
  }

  const depositAddr = (() => {
    const a = vault?.addresses;
    if (!a) return '';
    const arr = Array.isArray(a) ? a : Object.values(a);
    const btc = arr.find((x) => /btc|bitcoin|counterparty|xcp/i.test((x?.coin || x?.chain || x?.name || x?.network || '')));
    return btc?.address || arr[0]?.address || arr[0] || '';
  })();
  const deposited = Array.isArray(balances) && balances.length > 0;

  return (
    <main className="container moves">
      <div className="moves-head">
        <h1>MovePepe</h1>
        <p className="moves-sub">Move a Pepe between <b>Eth</b> and <b>BTC</b> blockchains using Emblem Vault.</p>
      </div>

      <div className="moves-toggle" role="group" aria-label="Direction">
        <button className={dir === 'wrap' ? 'active' : ''} onClick={() => { setDir('wrap'); setVault(null); setBalances(null); }}>🐸 → Ξ&nbsp; MovePepe to ETH</button>
        <button className={dir === 'unwrap' ? 'active' : ''} onClick={() => { setDir('unwrap'); setVault(null); setBalances(null); }}>Ξ → 🐸&nbsp; MovePepe to BTC</button>
      </div>

      {configured === false && (
        <div className="moves-banner">⏳ <b>MovePepe is almost live.</b> Waiting on the Emblem API key — the flow below activates the moment it’s set.</div>
      )}

      <div className="moves-card">
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
              <div className="mcol-toggle">
                <button className={collection === 'rare-pepe' ? 'active' : ''} onClick={() => setCollection('rare-pepe')}>Rare Pepe</button>
                <button className={collection === 'fake-rare' ? 'active' : ''} onClick={() => setCollection('fake-rare')}>Fake Rare</button>
              </div>
              <button className="btn-connect" onClick={connectWallet}>{wallet ? `🔗 ${wallet.slice(0, 6)}…${wallet.slice(-4)}` : '🔗 Connect ETH wallet (where the NFT lands)'}</button>
              <button className="btn-move" disabled={!asset || !wallet || busy} onClick={createVault}>{busy && !vault ? 'Creating vault…' : 'Create vault & get deposit address'}</button>
            </>
          ) : (
            <>
              <p className="mhint">Connect the ETH wallet holding the wrapped Pepe you want to move back to Bitcoin.</p>
              <button className="btn-connect" onClick={connectWallet}>{wallet ? `🔗 ${wallet.slice(0, 6)}…${wallet.slice(-4)}` : '🔗 Connect ETH wallet'}</button>
              <button className="btn-move" disabled={!wallet} onClick={() => setError('The unwrap (claim) step is being wired + tested next — it burns the vault NFT and returns your Pepe’s private key.')}>Find my wrapped Pepes</button>
            </>
          )}
        </div>

        {dir === 'wrap' && vault && (
          <div className="moves-deposit">
            <div className="mdep-k">Send exactly <b>1 {asset}</b> to this Bitcoin address:</div>
            <div className="mdep-addr">{depositAddr || '(deposit address pending)'}</div>
            <button className="btn-copy" onClick={() => navigator.clipboard?.writeText(depositAddr)}>Copy address</button>
            <div className="mdep-row">
              <button className="btn-connect" onClick={checkDeposit} disabled={busy}>{busy ? 'Checking…' : 'Check Pepe is in the vault'}</button>
              {deposited && <span className="mdep-ok">✅ Deposit detected — ready to mint</span>}
            </div>
            {deposited && (
              <button className="btn-move" onClick={() => setError('Mint step (buyWithSignedPrice) is being wired + tested next — your vault ' + String(vault.tokenId).slice(0, 10) + '… is safe.')}>Mint on ETH →</button>
            )}
            <div className="mdep-note">Vault <code>{String(vault.tokenId).slice(0, 16)}…</code> created for your wallet.</div>
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
