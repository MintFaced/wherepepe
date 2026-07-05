'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import Header from './Header';
import { fmtEth, fmtPct } from '../../lib/format';

const PAGE = 60;

// Keep real artist names in the filter; drop BTC/ETH addresses & placeholders.
function isRealArtist(a) {
  const s = String(a || '').trim();
  if (!s) return false;
  if (/^(1|3)[a-km-zA-HJ-NP-Z1-9]{24,}$/.test(s) || /^bc1[a-z0-9]{20,}$/.test(s)) return false;
  if (/^0x[a-fA-F0-9]{40}$/.test(s)) return false;
  if (/^\d+$/.test(s)) return false;
  if (['unknown', 'n/a', 'na', '?', 'none', 'tbd'].includes(s.toLowerCase())) return false;
  return true;
}

export default function Gallery({ initialCards, emblemVaultedTotal }) {
  const cards = initialCards || [];
  const [query, setQuery] = useState('');
  const [collection, setCollection] = useState('rare-pepe');
  const [series, setSeries] = useState('all');
  const [artist, setArtist] = useState('all');
  const [sort, setSort] = useState('series');
  const [view, setView] = useState('all'); // all | wrapped | native
  const [visible, setVisible] = useState(PAGE);
  const [floors, setFloors] = useState(null); // asset -> { wrappedFloorEth, nativeFloorEth, cheaper, savingsPct }
  const ready = floors !== null;
  const available = ready && Object.keys(floors).length > 0;

  // One-shot: the full per-card comparison map.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/floors');
        const data = await res.json();
        if (!cancelled) setFloors(data.ok ? (data.byAsset || {}) : {});
      } catch {
        if (!cancelled) setFloors({});
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const seriesOptions = useMemo(() => {
    const s = new Set();
    cards.forEach((c) => c.series != null && s.add(c.series));
    return [...s].sort((a, b) => a - b);
  }, [cards]);

  const counts = useMemo(() => {
    let rare = 0, fake = 0;
    cards.forEach((c) => { if (c.collection === 'fake-rare') fake += 1; else rare += 1; });
    return { rare, fake };
  }, [cards]);

  const artistOptions = useMemo(() => {
    const s = new Set();
    cards.forEach((c) => c.artist && isRealArtist(c.artist) && s.add(c.artist));
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [cards]);

  const summary = useMemo(() => {
    if (!available) return null;
    let comparable = 0, wrapped = 0, native = 0;
    for (const v of Object.values(floors)) {
      if (v.cheaper === 'wrapped') { comparable++; wrapped++; }
      else if (v.cheaper === 'native') { comparable++; native++; }
      else if (v.cheaper === 'equal') { comparable++; }
    }
    return { comparable, wrapped, native };
  }, [floors, available]);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    const minFloor = (a) => {
      const f = floors?.[a];
      const vals = [f?.nativeFloorEth, f?.wrappedFloorEth].filter((x) => x != null);
      return vals.length ? Math.min(...vals) : Infinity;
    };
    let list = cards.filter((c) => {
      if (collection !== 'all' && c.collection !== collection) return false;
      if (series !== 'all' && String(c.series) !== series) return false;
      if (artist !== 'all' && c.artist !== artist) return false;
      if (q && !c.asset.includes(q) && !(c.title || '').toUpperCase().includes(q) && !(c.artist || '').toUpperCase().includes(q)) return false;
      if (view !== 'all' && available) {
        if (floors[c.asset]?.cheaper !== view) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'savings': return (floors?.[b.asset]?.savingsPct ?? -1) - (floors?.[a.asset]?.savingsPct ?? -1);
        case 'cheapest': return minFloor(a.asset) - minFloor(b.asset);
        case 'offer': return (floors?.[b.asset]?.highestOfferEth ?? -1) - (floors?.[a.asset]?.highestOfferEth ?? -1);
        case 'name': return a.asset.localeCompare(b.asset);
        default: return (a.series - b.series) || (a.card - b.card);
      }
    });
    return list;
  }, [cards, query, collection, series, artist, sort, view, floors, available]);

  useEffect(() => { setVisible(PAGE); }, [query, collection, series, artist, sort, view]);
  const shown = filtered.slice(0, visible);

  const sentinel = useRef(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisible((v) => (v < filtered.length ? v + PAGE : v));
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length]);

  const headerRight = (
    <>
      <div className="header-stat"><b>{counts.rare.toLocaleString()}</b><span>Rare Pepe</span></div>
      <div className="header-stat"><b style={{ color: 'var(--pepe-bright)' }}>{counts.fake.toLocaleString()}</b><span>Fake Rare</span></div>
      {emblemVaultedTotal != null && (
        <div className="header-stat">
          <b style={{ color: 'var(--eth)' }}>{emblemVaultedTotal.toLocaleString()}</b>
          <span>Wrapped · Emblem</span>
        </div>
      )}
    </>
  );

  const toggleTitle = available ? undefined : 'Floor comparison loads after the first sweep';

  return (
    <>
      <Header right={headerRight} />
      <main className="container">
        <div style={{ margin: '28px 0 4px' }}>
          <h1 style={{ fontSize: 32 }}>Where's this pepe cheapest?</h1>
          <p style={{ color: 'var(--text-dim)', marginTop: 8, maxWidth: 660 }}>
            Every Rare Pepe &amp; Fake Rare, priced in ETH on both sides — native on{' '}
            <span style={{ color: 'var(--btc)' }}>Counterparty</span> (Bitcoin) vs wrapped in{' '}
            <span style={{ color: 'var(--eth)' }}>Emblem Vault</span> (Ethereum). Find where each is cheaper.
          </p>
          {summary && (
            <p className="result-meta" style={{ marginTop: 12 }}>
              {summary.comparable.toLocaleString()} cards priced on both sides ·{' '}
              <span style={{ color: 'var(--eth)' }}>{summary.wrapped.toLocaleString()} value on Emblem</span> ·{' '}
              <span style={{ color: 'var(--btc)' }}>{summary.native.toLocaleString()} value on Native</span>
            </p>
          )}
        </div>

        <div className="controls">
          <label className="search">
            <span aria-hidden="true">🔍</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by card name…" aria-label="Search cards" />
          </label>

          <div className="toggle-group" role="group" aria-label="Collection">
            <button className={collection === 'all' ? 'active' : ''} onClick={() => setCollection('all')}>All</button>
            <button className={collection === 'rare-pepe' ? 'active' : ''} onClick={() => setCollection('rare-pepe')}>Rare Pepe</button>
            <button className={collection === 'fake-rare' ? 'active' : ''} onClick={() => setCollection('fake-rare')}>Fake Rare</button>
          </div>

          <select className="select" value={series} onChange={(e) => setSeries(e.target.value)} aria-label="Filter by series">
            <option value="all">All series</option>
            {seriesOptions.map((s) => <option key={s} value={String(s)}>Series {s}</option>)}
          </select>

          <select className="select" value={artist} onChange={(e) => setArtist(e.target.value)} aria-label="Filter by artist">
            <option value="all">All artists</option>
            {artistOptions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>

          <select className="select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            <option value="series">Sort: Series</option>
            {available && <option value="savings">Sort: Biggest savings</option>}
            {available && <option value="cheapest">Sort: Cheapest floor</option>}
            {available && <option value="offer">Sort: Highest offer</option>}
            <option value="name">Sort: Name A–Z</option>
          </select>

          <div className="toggle-group" role="group" aria-label="Cheaper-side filter">
            <button className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}>All</button>
            <button className={view === 'wrapped' ? 'active' : ''} disabled={!available} title={toggleTitle} onClick={() => setView('wrapped')}>Value on Emblem</button>
            <button className={view === 'native' ? 'active' : ''} disabled={!available} title={toggleTitle} onClick={() => setView('native')}>Value on Native</button>
          </div>
        </div>

        <div className="result-meta">
          Showing {Math.min(visible, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()} cards
          {!ready && <span> · loading prices…</span>}
        </div>

        <div className="grid">
          {shown.map((c) => (
            <Tile key={c.asset} card={c} entry={floors?.[c.asset]} ready={ready} />
          ))}
        </div>

        {visible < filtered.length && <div ref={sentinel} className="sentinel" aria-hidden="true" />}
        {filtered.length === 0 && (
          <div className="loadmore">
            {view !== 'all' && available ? 'No cards in this view.' : `No cards match “${query}”.`}
          </div>
        )}
      </main>
    </>
  );
}

function Tile({ card, entry, ready }) {
  const native = entry?.nativeFloorEth ?? null;
  const wrapped = entry?.wrappedFloorEth ?? null;
  const cheaper = entry?.cheaper ?? null;
  const savings = entry?.savingsPct ?? null;

  return (
    <Link href={`/card/${card.asset}`} className="tile">
      <div className="tile-img">
        {card.image ? <img src={card.image} alt={card.title || card.asset} loading="lazy" /> : null}
        <span className="tile-serie">S{card.series}·{card.card}</span>
        {card.collection === 'fake-rare' && <span className="tile-col tile-col--fake">FAKE</span>}
      </div>
      <div className="tile-body">
        <div className="tile-name" title={card.title || card.asset}>{card.title || card.asset}</div>
        <div className="tile-row">
          <span style={{ color: 'var(--btc)' }}>Native</span>
          <b className="tile-floor" style={cheaper === 'native' ? { color: 'var(--btc)' } : undefined}>{ready ? fmtEth(native) : <span className="skeleton">…</span>}</b>
        </div>
        <div className="tile-row">
          <span style={{ color: 'var(--eth)' }}>Wrapped</span>
          <b className="tile-floor" style={cheaper === 'wrapped' ? { color: 'var(--eth)' } : undefined}>{ready ? fmtEth(wrapped) : <span className="skeleton">…</span>}</b>
        </div>
        {cheaper === 'wrapped' || cheaper === 'native' ? (
          <div className={`cheapest cheapest--${cheaper}`}>
            {cheaper === 'wrapped' ? 'Value on Emblem' : 'Value on Native'}
            {savings != null && savings >= 1 && <span> · save {fmtPct(savings)}</span>}
          </div>
        ) : (native != null || wrapped != null) ? (
          <div className="cheapest cheapest--none">One side only</div>
        ) : (
          <div className="cheapest cheapest--none">{ready ? 'No listings' : ' '}</div>
        )}
      </div>
    </Link>
  );
}
