'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Header from './Header';
import { fmtEth } from '../../lib/format';

const POLL_MS = 3000;
const TOKEN_KEY = 'chatpepe:token';
const IDENT_KEY = 'chatpepe:identity';
const EMOJIS = ['🐸', '🐋', '💎', '🚀', '🔥', '😂', '😎', '👀', '🙌', '💚', '🤝', '🫡',
  '😭', '🤔', '👍', '🎉', '💰', '📈', '📉', '🧠', '🤯', '😤', '🙏', '✨', '🐳', '🫶', '💀', '🥲', '🤡', '👑'];
const REACTIONS = ['🐸', '🔥', '💎', '🚀', '😂', '💚', '👀', '🙌', '😭', '💀'];

// Render message text, highlighting @handle mentions green (brighter if it's you).
function renderText(text, handles, myHandle) {
  const t = String(text || '');
  const out = [];
  let buf = '';
  let i = 0;
  let key = 0;
  const flush = () => { if (buf) { out.push(buf); buf = ''; } };
  while (i < t.length) {
    if (t[i] === '@') {
      const rest = t.slice(i + 1);
      const m = handles.find((h) => rest.startsWith(h));
      if (m) {
        flush();
        out.push(<span key={`m${key++}`} className={`mention${m === myHandle ? ' mine' : ''}`}>@{m}</span>);
        i += 1 + m.length;
        continue;
      }
    }
    buf += t[i];
    i += 1;
  }
  flush();
  return out;
}

// Resize/crop an image File to a small square webp data URL for a PFP.
function fileToPfp(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        const s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        let out = canvas.toDataURL('image/webp', 0.8);
        if (out.length > 58000) out = canvas.toDataURL('image/webp', 0.5);
        resolve(out);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

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
  const [xcpInput, setXcpInput] = useState('');
  const [pfpUpload, setPfpUpload] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileErr, setProfileErr] = useState('');
  const [replyTarget, setReplyTarget] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [online, setOnline] = useState(0);
  const [mentionCtx, setMentionCtx] = useState(null);   // { at, q }
  const [mentionMatches, setMentionMatches] = useState([]);
  const listRef = useRef(null);
  const tokenRef = useRef(null);
  const inputRef = useRef(null);
  const atBottomRef = useRef(true);

  // Restore a previous session.
  useEffect(() => {
    try {
      const t = localStorage.getItem(TOKEN_KEY);
      const id = localStorage.getItem(IDENT_KEY);
      if (t && id) { setToken(t); setIdentity(JSON.parse(id)); setStatus('ready'); }
    } catch {}
  }, []);

  useEffect(() => { tokenRef.current = token; }, [token]);

  // Poll messages (+ presence when signed in).
  const loadMessages = useCallback(async () => {
    try {
      const t = tokenRef.current;
      const res = await fetch(`/api/chat/messages${t ? `?token=${encodeURIComponent(t)}` : ''}`);
      const data = await res.json();
      setConfigured(data.configured !== false);
      if (Array.isArray(data.messages)) setMessages(data.messages);
      if (typeof data.online === 'number') setOnline(data.online);
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
    setXcpInput(identity?.xcp || '');
    setPfpUpload(null);
    setShowProfile(true);
    if (myPepes.length === 0) {
      fetch(`/api/chat/my-pepes?token=${encodeURIComponent(token)}`)
        .then((r) => r.json()).then((d) => { if (d.ok) setMyPepes(d.pepes || []); }).catch(() => {});
    }
  }

  async function onUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToPfp(file);
      if (dataUrl.length > 60000) { setProfileErr('Image too detailed — try a simpler one.'); return; }
      setPfpUpload(dataUrl);
      setSelectedPfp(null);
    } catch {
      setProfileErr('Could not read that image.');
    }
  }

  async function saveProfile() {
    setSavingProfile(true); setProfileErr('');
    try {
      const payload = { token, handle: handleInput, xcp: xcpInput };
      if (pfpUpload) payload.pfpUpload = pfpUpload;
      else payload.pfpAsset = selectedPfp;
      const res = await fetch('/api/chat/profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
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

  async function react(msgId, emoji) {
    try {
      await fetch('/api/chat/react', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, msgId, emoji }),
      });
      loadMessages();
    } catch {}
  }

  async function del(msgId) {
    if (typeof window !== 'undefined' && !window.confirm('Delete this message?')) return;
    try {
      await fetch('/api/chat/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, msgId }),
      });
      loadMessages();
    } catch {}
  }

  // Known handles (longest-first) for @mention highlighting.
  const handles = useMemo(() => {
    const set = new Set();
    messages.forEach((m) => m.handle && identity && m.handle !== identity.handle && set.add(m.handle));
    return [...set].sort((a, b) => b.length - a.length);
  }, [messages, identity]);

  // All handles (incl. self) for rendering highlights.
  const allHandles = useMemo(() => {
    const set = new Set();
    messages.forEach((m) => m.handle && set.add(m.handle));
    return [...set].sort((a, b) => b.length - a.length);
  }, [messages]);

  function onInputChange(e) {
    const val = e.target.value;
    setInput(val);
    const cursor = e.target.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const at = before.lastIndexOf('@');
    if (at >= 0) {
      const charBefore = at > 0 ? before[at - 1] : ' ';
      const q = before.slice(at + 1);
      if ((at === 0 || /\s/.test(charBefore)) && !/\n/.test(q)) {
        const list = (q
          ? handles.filter((h) => h.toLowerCase().startsWith(q.toLowerCase()) && h.toLowerCase() !== q.toLowerCase())
          : handles).slice(0, 6);
        if (list.length) { setMentionCtx({ at, q }); setMentionMatches(list); return; }
      }
    }
    setMentionCtx(null);
  }

  function insertMention(handle) {
    if (!mentionCtx) return;
    const { at, q } = mentionCtx;
    const cursorEnd = at + 1 + q.length;
    const next = (input.slice(0, at) + '@' + handle + ' ' + input.slice(cursorEnd)).slice(0, 280);
    setInput(next);
    setMentionCtx(null);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) { const pos = at + handle.length + 2; el.focus(); el.setSelectionRange(pos, pos); }
    });
  }

  function onInputKeyDown(e) {
    if (mentionCtx && mentionMatches.length) {
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionMatches[0]); }
      else if (e.key === 'Escape') { setMentionCtx(null); }
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
        body: JSON.stringify({ token, text, replyId: replyTarget?.id || null }),
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
      setReplyTarget(null);
      setShowEmoji(false);
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
          <h1>🐸 ChatPepe {online > 0 && <span className="online-pill"><span className="online-dot" />{online} online</span>}</h1>
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
              <Message
                key={m.id}
                m={m}
                mine={identity && m.address === identity.address}
                onReply={identity && identity.holder ? () => { setReplyTarget({ id: m.id, handle: m.handle, text: m.text }); } : null}
                onReact={identity && identity.holder ? (emoji) => react(m.id, emoji) : null}
                onDelete={identity && m.address === identity.address ? () => del(m.id) : null}
                handles={allHandles}
                myHandle={identity?.handle}
              />
            ))}
          </div>

          {status === 'ready' && identity && identity.holder ? (
            <div className="chat-inputwrap">
              {replyTarget && (
                <div className="reply-banner">
                  Replying to <b>{replyTarget.handle}</b>: <span className="reply-snip">{replyTarget.text}</span>
                  <button className="reply-x" onClick={() => setReplyTarget(null)} aria-label="Cancel reply">×</button>
                </div>
              )}
              {showEmoji && (
                <div className="emoji-pop">
                  {EMOJIS.map((e) => (
                    <button key={e} type="button" onClick={() => setInput((v) => (v + e).slice(0, 280))}>{e}</button>
                  ))}
                </div>
              )}
              {mentionCtx && mentionMatches.length > 0 && (
                <div className="mention-pop">
                  {mentionMatches.map((h) => (
                    <button
                      key={h}
                      type="button"
                      className="mention-opt"
                      onMouseDown={(e) => { e.preventDefault(); insertMention(h); }}
                    >@{h}</button>
                  ))}
                </div>
              )}
              <form className="chat-input" onSubmit={send}>
                <span className="chat-me">
                  {identity.pfp
                    ? <img className="avatar" src={identity.pfp} alt="" />
                    : <span className="avatar" style={{ background: identity.avatar }} />}
                  <span className="chat-me-name">
                    {identity.handle}
                    {identity.artist && <span className="artist">RP</span>}
                    <span className="holder">HOLDER</span>
                  </span>
                </span>
                <button type="button" className="emoji-btn" onClick={() => setShowEmoji((v) => !v)} title="Emoji" aria-label="Emoji">😀</button>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={onInputChange}
                  onKeyDown={onInputKeyDown}
                  placeholder="Message the pond… (@ to tag someone)"
                  maxLength={280}
                  aria-label="Message"
                  autoComplete="off"
                />
                <button type="submit" disabled={sending || !input.trim()}>Send</button>
              </form>
            </div>
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

              <div className="pfp-upload">
                <label className="upload-btn">
                  ⬆ Upload your own
                  <input type="file" accept="image/*" onChange={onUpload} hidden />
                </label>
                {pfpUpload && <img className="upload-preview" src={pfpUpload} alt="preview" />}
                {pfpUpload && <button type="button" className="linkbtn" onClick={() => setPfpUpload(null)}>remove</button>}
              </div>

              <label className="modal-label">Link a free wallet (Counterparty / BTC) — shows your native Rare Pepes on your profile</label>
              <input
                className="modal-input"
                value={xcpInput}
                onChange={(e) => setXcpInput(e.target.value)}
                placeholder="1… or bc1…"
                spellCheck={false}
              />

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

function Message({ m, mine, onReply, onReact, onDelete, handles, myHandle }) {
  const [pick, setPick] = useState(false);
  const time = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <div className={`msg${mine ? ' msg--mine' : ''}`}>
      {m.pfp
        ? <img className="avatar" src={m.pfp} alt="" />
        : <span className="avatar" style={{ background: m.avatar }} aria-hidden="true" />}
      <div className="msg-body">
        <div className="msg-meta">
          <a href={`/u/${m.address}`} className="msg-handle">{m.handle}</a>
          {m.artist && <span className="artist" title={`Rare Pepe Artist: ${m.artist}`}>RP ARTIST</span>}
          {m.holder && <span className="holder">HOLDER</span>}
          <span className="msg-time">{time}</span>
          <span className="msg-actions">
            {onReply && <button className="msg-reply" onClick={onReply} title="Reply">↩</button>}
            {onDelete && <button className="msg-del" onClick={onDelete} title="Delete">🗑</button>}
          </span>
        </div>
        {m.replyTo && (
          <div className="msg-quote">
            <span className="msg-quote-handle">{m.replyTo.handle}</span>
            <span className="msg-quote-text">{m.replyTo.text}</span>
          </div>
        )}
        <div className="msg-text">{renderText(m.text, handles || [], myHandle)}</div>
        {(m.reactions?.length > 0 || onReact) && (
          <div className="reactions">
            {(m.reactions || []).map((r) => (
              <button
                key={r.emoji}
                className={`react-chip${r.mine ? ' mine' : ''}`}
                onClick={() => onReact && onReact(r.emoji)}
                disabled={!onReact}
              >{r.emoji} {r.count}</button>
            ))}
            {onReact && (
              <span className="react-addwrap">
                <button className="react-add" onClick={() => setPick((v) => !v)} title="React">😊﹢</button>
                {pick && (
                  <div className="react-pick">
                    {REACTIONS.map((e) => (
                      <button key={e} onClick={() => { onReact(e); setPick(false); }}>{e}</button>
                    ))}
                  </div>
                )}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
