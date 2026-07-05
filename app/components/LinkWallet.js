'use client';

import { useState, useEffect } from 'react';

// Decode the wallet address from the (unverified) session token, just to tell
// if this is the viewer's own profile. The server re-verifies on save.
function addressFromToken(token) {
  try {
    let b = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    const p = JSON.parse(atob(b));
    return p.a || null;
  } catch {
    return null;
  }
}

export default function LinkWallet({ profileAddress, currentXcp }) {
  const [token, setToken] = useState(null);
  const [mine, setMine] = useState(false);
  const [xcp, setXcp] = useState(currentXcp || '');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let t = null;
    try { t = localStorage.getItem('chatpepe:token'); } catch {}
    setToken(t);
    if (t && addressFromToken(t) === String(profileAddress).toLowerCase()) setMine(true);
  }, [profileAddress]);

  if (!mine) return null;

  async function save(clear) {
    setSaving(true); setStatus('');
    try {
      const value = clear ? '' : xcp;
      const res = await fetch('/api/chat/profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, xcp: value }),
      });
      const d = await res.json();
      if (!d.ok) { setStatus(d.error || 'Could not save.'); return; }
      setStatus('Saved — pulling in your native Rare Pepes…');
      setTimeout(() => window.location.reload(), 900);
    } catch {
      setStatus('Network error.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="link-wallet">
      <div className="link-wallet-label">🟧 Your free (Counterparty / BTC) wallet — add it to show your native Rare Pepes here</div>
      <div className="link-wallet-row">
        <input
          value={xcp}
          onChange={(e) => setXcp(e.target.value)}
          placeholder="e.g. 1GpCYqHS3sqvg4n837NJmcsmWLfAssXcqK"
          spellCheck={false}
        />
        <button className="connect-btn" onClick={() => save(false)} disabled={saving || !xcp.trim()}>
          {saving ? 'Saving…' : (currentXcp ? 'Update' : 'Link wallet')}
        </button>
        {currentXcp && <button className="linkbtn" onClick={() => { setXcp(''); save(true); }}>unlink</button>}
      </div>
      {status && <div className="link-wallet-status">{status}</div>}
    </div>
  );
}
