'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Header from './Header';
import { fmtEth } from '../../lib/format';

const POLL_MS = 3000;
const TOKEN_KEY = 'chatpepe:token';
const IDENT_KEY = 'chatpepe:identity';

export default function ChatRoom() {
  const [identity, setIdentity] = useState(null);
  const [token, setToken] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('idle'); // idle | connecting | ready
  const [error, setError] = useState('');
  const [configured, setConfigured] = useState(true);
  const [sending, setSending] = useState(false);
  const [cheapest, setCheapest] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [myPepes, setMyPepes] = useState([]);
  const [handleInput, setHandleInput] = useState('');
  const [selectedPfp, setSelectedPfp] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileErr, setProfileErr] = useState('');
  const listRef = useRef(null);
  const atBottomRef = useRef(true);

  // Restore a previous session.
  useEffect(() => {
    try {
      const t = localStorage.getItem(TOKEN_KEY);
      const id = localStorage.getItem(IDENT_KEY);
      if (t && id) { setToken(t); setIdentity(JSON.parse(id)); setStatus('ready'); }
    } catch {}
  }, []);

  // Poll messages.
  const loadMessages = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/messages');
      const data = await res.json();
      setConfigured(data.configured !== false);
      if (Array.isArray(data.messages)) setMessages(data.messages);
    } catch {}
  }, []);

  useEffect(() => {
    loadMessages();
    const iv = setInterval(loadMessages, POLL_MS);
    return () => clearInterval(iv);
  }, [loadMessages]);

  // For non-holders: fetch the cheapest Pepe they could buy to get in.
  useEffect(() => {
    if (status === 'ready' && identity && !identity.holder && !cheapest) {
      fetch('/api/chat/cheapest').then((r) => r.json()).then((d) => { if (d.ok) setCheapest(d); }).catch(() => {});
    }
  }, [status, identity, cheapest]);

  // Autoscroll if the user is at the bottom.
  useEffect(() => {
    const el = listRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  async function connect() {
    setError('');
    const eth = typeof window !== 'undefined' ? window.ethereum : null;
    if (!eth) { setError('No Ethereum wallet found. Install MetaMask (or another wallet) to join.'); return; }
    setStatus('connecting');
    try {
      const accounts = await eth.request({ method: 'eth_requestAccounts' });
      const address = accounts?.[0];
      if (!address) throw new Error('No account');
      const message = `ChatPepe · sign in to chat about Pepe\n\nWallet: ${address}\nNonce: ${Date.now()}`;
      const signature = await eth.request({ method: 'personal_sign', params: [message, address] });
      const res = await fetch('/api/chat/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address, message, signature }),
      });
      const data = await res.json();
      if (!data.ok) {
        if (res.status === 503) { setConfigured(false); setError(''); setStatus('idle'); return; }
        throw new Error(data.error || 'login failed');
      }
      setToken(data.token);
      setIdentity(data.identity);
      setStatus('ready');
      try {
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem(IDENT_KEY, JSON.stringify(data.identity));
      } catch {}
    } catch (e) {
      setError(e?.message === 'User rejected the request.' ? 'Signature cancelled.' : 'Could not connect wallet.');
      setStatus('idle');
    }
  }

  function signOut() {
    setToken(null); setIdentity(null); setStatus('idle');
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(IDENT_KEY); } catch {}
  }

  function openProfile() {
    setProfileErr('');
    setHandleInput(identity?.handle || '');
    setSelectedPfp(identity?.pfpAsset || null);
    setShowProfile(true);
    if (myPepes.length === 0) {
      fetch(`/api/chat/my-pepes?token=${encodeURIComponent(token)}`)
        .then((r) => r.json()).then((d) => { if (d.ok) setMyPepes(d.pepes || []); }).catch(() => {});
    }
  }

  async function saveProfile() {
    setSavingProfile(true); setProfileErr('');
    try {
      const res = await fetch('/api/chat/profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, handle: handleInput, pfpAsset: selectedPfp }),
      });
      const data = await res.json();
      if (!data.ok) { setProfileErr(data.error || 'Could not save.'); return; }
      setIdentity(data.identity);
      try { localStorage.setItem(IDENT_KEY, JSON.stringify(data.identity)); } catch {}
      setShowProfile(false);
    } catch {
      setProfileErr('Network error.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function send(e) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, text }),
      });
      const data = await res.json();
      if (!data.ok) {
        if (res.status === 401) { signOut(); setError('Session expired — reconnect your wallet.'); }
        else if (res.status === 403) setError('Holders only — you need a Rare Pepe to post.');
        else if (res.status === 429) setError('Easy — one message at a time.');
        else setError(data.error || 'Could not send.');
        return;
      }
      setInput('');
      atBottomRef.current = true;
      loadMessages();
    } catch {
      setError('Network error.');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Header />
      <main className="container chat-wrap">
        <div className="chat-head">
          <h1>🐸 ChatPepe</h1>
          <p>Hold a Rare Pepe to post; anyone can read. Connect your wallet, get a Pepe identity, and chat about rares. Be excellent to each other.</p>
        </div>

        {!configured ? (
          <div className="chat-notice">
            ChatPepe isn’t configured yet. Add a <b>Vercel KV</b> store and a <b>CHAT_SECRET</b> env var,
            then redeploy. (See the README.)
          </div>
        ) : null}

        <div className="chat-box">
          <div className="chat-messages" ref={listRef} onScroll={onScroll}>
            {messages.length === 0 ? (
              <div className="chat-empty">No messages yet. Say hi, frog. 🐸</div>
            ) : messages.map((m) => (
              <Message key={m.id} m={m} mine={identity && m.address === identity.address} />
            ))}
          </div>

          {status === 'ready' && identity && identity.holder ? (
            <form className="chat-input" onSubmit={send}>
              <span className="chat-me">
                {identity.pfp
                  ? <img className="avatar" src={identity.pfp} alt="" />
                  : <span className="avatar" style={{ background: identity.avatar }} />}
                <span className="chat-me-name">{identity.handle}<span className="holder">HOLDER</span></span>
              </span>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Message the pond…"
                maxLength={280}
                aria-label="Message"
              />
              <button type="submit" disabled={sending || !input.trim()}>Send</button>
            </form>
          ) : status === 'ready' && identity ? (
            <div className="chat-connect">
              <div className="chat-gate">🐸 Hold a Rare Pepe to post — here’s the cheapest way in:</div>
              {cheapest ? (
                <a className="cheapest-card" href={cheapest.buyUrl} target="_blank" rel="noopener noreferrer">
                  {cheapest.image ? <img src={cheapest.image} alt={cheapest.title} /> : null}
                  <div className="cheapest-info">
                    <div className="cheapest-name">{cheapest.title}</div>
                    <div className="cheapest-meta">Series {cheapest.series} · Card {cheapest.card}</div>
                    <div className="cheapest-price">{fmtEth(cheapest.floorEth)}</div>
                    <div className="cheapest-buy">Buy on OpenSea ↗</div>
                  </div>
                </a>
              ) : (
                <a className="connect-btn" href="https://opensea.io/collection/rare-pepe-curated?sortAscending=true&sortBy=UNIT_PRICE" target="_blank" rel="noopener noreferrer">Browse Rare Pepes ↗</a>
              )}
              <span className="chat-connect-note">
                Once you own one, <button className="linkbtn" onClick={connect}>re-check</button> · connected as {identity.handle} · <button className="linkbtn" onClick={signOut}>sign out</button>
              </span>
            </div>
          ) : (
            <div className="chat-connect">
              <button className="connect-btn" onClick={connect} disabled={status === 'connecting'}>
                {status === 'connecting' ? 'Check your wallet…' : 'Connect wallet to chat'}
              </button>
              <span className="chat-connect-note">Holders post, everyone reads · one free signature, no gas.</span>
            </div>
          )}
        </div>

        {error ? <div className="chat-error">{error}</div> : null}
        {status === 'ready' && identity && identity.holder ? (
          <div className="chat-foot">
            Chatting as <b>{identity.handle}</b> · <button className="linkbtn" onClick={openProfile}>edit profile</button> · <button className="linkbtn" onClick={signOut}>sign out</button>
          </div>
        ) : null}

        {showProfile && identity ? (
          <div className="modal-overlay" onClick={() => setShowProfile(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Edit profile</h3>

              <label className="modal-label">Handle</label>
              <input
                className="modal-input"
                value={handleInput}
                onChange={(e) => setHandleInput(e.target.value)}
                maxLength={24}
                placeholder="2–24 characters"
              />

              <label className="modal-label">Profile picture — pick one of your Rare Pepes</label>
              <div className="pfp-grid">
                <button type="button" className={`pfp-opt${!selectedPfp ? ' sel' : ''}`} onClick={() => setSelectedPfp(null)} title="Default">
                  <span className="avatar" style={{ background: identity.avatar }} />
                  <span className="pfp-opt-label">Default</span>
                </button>
                {myPepes.map((p) => (
                  <button type="button" key={p.asset} className={`pfp-opt${selectedPfp === p.asset ? ' sel' : ''}`} onClick={() => setSelectedPfp(p.asset)} title={p.asset}>
                    {p.image ? <img src={p.image} alt={p.asset} /> : <span className="avatar" />}
                  </button>
                ))}
                {myPepes.length === 0 && <div className="pfp-empty">Loading your Rare Pepes…</div>}
              </div>

              {profileErr ? <div className="chat-error">{profileErr}</div> : null}
              <div className="modal-actions">
                <button className="linkbtn" onClick={() => setShowProfile(false)}>Cancel</button>
                <button className="connect-btn" onClick={saveProfile} disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </>
  );
}

function Message({ m, mine }) {
  const time = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <div className={`msg${mine ? ' msg--mine' : ''}`}>
      {m.pfp
        ? <img className="avatar" src={m.pfp} alt="" />
        : <span className="avatar" style={{ background: m.avatar }} aria-hidden="true" />}
      <div className="msg-body">
        <div className="msg-meta">
          <span className="msg-handle">{m.handle}</span>
          {m.holder && <span className="holder">HOLDER</span>}
          <span className="msg-time">{time}</span>
        </div>
        <div className="msg-text">{m.text}</div>
      </div>
    </div>
  );
}
