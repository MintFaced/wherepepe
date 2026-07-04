'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import Header from './Header';
import { fmtEth, fmtPct } from '../../lib/format';

const PAGE = 60;

export default function Gallery({ initialCards, emblemVaultedTotal }) {
  const cards = initialCards || [];
  const [query, setQuery] = useState('');
  const [series, setSeries] = useState('all');
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
      if (series !== 'all' && String(c.series) !== series) return false;
      if (q && !c.asset.includes(q) && !(c.title || '').toUpperCase().includes(q)) return false;
      if (view !== 'all' && available) {
        if (floors[c.asset]?.cheaper !== view) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'savings': return (floors?.[b.asset]?.savingsPct ?? -1) - (floors?.[a.asset]?.savingsPct ?? -1);
        case 'cheapest': return minFloor(a.asset) - minFloor(b.asset);
        case 'name': return a.asset.localeCompare(b.asset);
        default: return (a.series - b.series) || (a.card - b.card);
      }
    });
    return list;
  }, [cards, query, series, sort, view, floors, available]);

  useEffect(() => { setVisible(PAGE); }, [query, series, sort, view]);
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
      <div className="header-stat"><b>{cards.length.toLocaleString()}</b><span>Cards</span></div>
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
            Every Rare Pepe, priced in ETH on both sides — native on{' '}
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

          <select className="select" value={series} onChange={(e) => setSeries(e.target.value)} aria-label="Filter by series">
            <option value="all">All series</option>
            {seriesOptions.map((s) => <option key={s} value={String(s)}>Series {s}</option>)}
          </select>

          <select className="select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            <option value="series">Sort: Series</option>
            {available && <option value="savings">Sort: Biggest savings</option>}
            {available && <option value="cheapest">Sort: Cheapest floor</option>}
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
