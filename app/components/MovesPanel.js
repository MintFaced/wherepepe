'use client';

import { useState, useEffect } from 'react';

const STEPS = {
  wrap: [
    ['1', 'Create a vault', 'We spin up an Emblem Vault for your Pepe and give you a Bitcoin deposit address.'],
    ['2', 'Send the Pepe', 'Send exactly 1 of the asset to that address from your Counterparty wallet (Freewallet, etc.).'],
    ['3', 'Mint on ETH', 'Once the deposit confirms, mint the vault NFT with your ETH wallet — now it trades on OpenSea.'],
  ],
  unwrap: [
    ['1', 'Pick a wrapped Pepe', 'Connect the ETH wallet holding the Emblem Vault you want to open.'],
    ['2', 'Sign the claim', 'Your wallet signs and burns the vault NFT to release the contents.'],
    ['3', 'Take it on BTC', 'You receive the vault’s private key — import it to control the Pepe on Counterparty again.'],
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
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/emblem/status').then((r) => r.json()).then((d) => setConfigured(Boolean(d.configured))).catch(() => setConfigured(false));
  }, []);

  async function connectWallet() {
    if (!window.ethereum) { setError('No Ethereum wallet found — install MetaMask.'); return; }
    try {
      const [addr] = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setWallet(addr);
    } catch { setError('Wallet connection cancelled.'); }
  }

  async function startWrap() {
    setError(''); setBusy(true); setVault(null);
    try {
      const r = await fetch('/api/emblem/vault', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset, collection }),
      });
      const d = await r.json();
      if (r.status === 503) { setConfigured(false); return; }
      if (!d.ok) { setError(d.error || 'Could not create the vault.'); return; }
      setVault(d.vault);
    } catch (e) { setError('Network error.'); } finally { setBusy(false); }
  }

  const depositAddr = vault?.addresses?.find?.((a) => /btc|counterparty|xcp|bitcoin/i.test(a?.coin || a?.chain || a?.name || ''))?.address
    || vault?.addresses?.[0]?.address || vault?.addresses?.[0] || '';

  return (
    <main className="container moves">
      <div className="moves-head">
        <h1>Pepe Moves</h1>
        <p className="moves-sub">Move a Pepe between chains with Emblem Vault — <b>wrap</b> a native Pepe to a tradeable ETH NFT, or <b>unwrap</b> it back to Bitcoin.</p>
      </div>

      <div className="moves-toggle" role="group" aria-label="Direction">
        <button className={dir === 'wrap' ? 'active' : ''} onClick={() => { setDir('wrap'); setVault(null); }}>🐸 → Ξ&nbsp; Wrap to ETH</button>
        <button className={dir === 'unwrap' ? 'active' : ''} onClick={() => { setDir('unwrap'); setVault(null); }}>Ξ → 🐸&nbsp; Unwrap to BTC</button>
      </div>

      {configured === false && (
        <div className="moves-banner">⏳ <b>Pepe Moves is almost live.</b> We’re just waiting on our Emblem API key — the flow below is ready and will switch on the moment it lands.</div>
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
              <button className="btn-connect" onClick={connectWallet}>{wallet ? `🔗 ${wallet.slice(0, 6)}…${wallet.slice(-4)}` : '🔗 Connect ETH wallet'}</button>
              <button className="btn-move" disabled={!asset || busy} onClick={startWrap}>{busy ? 'Creating vault…' : 'Create vault & get deposit address'}</button>
            </>
          ) : (
            <>
              <p className="mhint">Connect the ETH wallet that holds the wrapped Pepe you want to open. We’ll list your Emblem Vaults to unwrap.</p>
              <button className="btn-connect" onClick={connectWallet}>{wallet ? `🔗 ${wallet.slice(0, 6)}…${wallet.slice(-4)}` : '🔗 Connect ETH wallet'}</button>
              <button className="btn-move" disabled={!wallet} onClick={() => setError('Unwrap flow activates with the API key — coming next.')}>Find my wrapped Pepes</button>
            </>
          )}
        </div>

        {vault && (
          <div className="moves-deposit">
            <div className="mdep-k">Send exactly 1 <b>{asset}</b> to this address:</div>
            <div className="mdep-addr">{depositAddr || '(deposit address pending)'}</div>
            <button className="btn-copy" onClick={() => navigator.clipboard?.writeText(depositAddr)}>Copy address</button>
            <div className="mdep-note">Vault <code>{String(vault.tokenId).slice(0, 14)}…</code> created. After you send the Pepe, come back to mint it on ETH.</div>
          </div>
        )}

        {error && <div className="moves-error">{error}</div>}

        <div className="moves-warn">
          ⚠️ This moves a <b>real asset</b> across chains. Double-check the address and asset name — cross-chain transfers can’t be undone. Only official <b>Rare Pepe</b> and <b>Fake Rare</b> curated collections are supported.
        </div>
      </div>
    </main>
  );
}
