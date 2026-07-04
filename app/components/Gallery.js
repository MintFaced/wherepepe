'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import Header from './Header';
import { fmtEth, fmtSupply, fmtPct } from '../../lib/format';

const PAGE = 60;
const BATCH = 30;

export default function Gallery({ initialCards, collectionFloorEth, rates }) {
  const cards = initialCards || [];
  const [query, setQuery] = useState('');
  const [series, setSeries] = useState('all');
  const [sort, setSort] = useState('series');
  const [view, setView] = useState('all'); // all | wrapped | native
  const [visible, setVisible] = useState(PAGE);
  const [floors, setFloors] = useState({});    // asset -> native floor data (lazy)
  const [counts, setCounts] = useState(null);   // asset -> wrapped count (one shot)
  const countsReady = counts !== null;
  const countsAvailable = countsReady && Object.keys(counts).length > 0;

  // One-shot: full per-card wrapped-count map (activates the wrapped/native split).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/wrapped-counts');
        const data = await res.json();
        if (!cancelled) setCounts(data.ok ? (data.byAsset || {}) : {});
      } catch {
        if (!cancelled) setCounts({});
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Wrapped % for a card, from the counts map. null until the map loads.
  const pctFor = useCallback((card) => {
    if (!countsReady || !(card.supply > 0)) return null;
    const w = counts[card.asset] || 0;
    return Math.min(100, (w / card.supply) * 100);
  }, [counts, countsReady]);

  const seriesOptions = useMemo(() => {
    const s = new Set();
    cards.forEach((c) => c.series != null && s.add(c.series));
    return [...s].sort((a, b) => a - b);
  }, [cards]);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    let list = cards.filter((c) => {
      if (series !== 'all' && String(c.series) !== series) return false;
      if (q && !c.asset.includes(q) && !(c.title || '').toUpperCase().includes(q)) return false;
      if (view !== 'all' && countsAvailable) {
        const pct = pctFor(c);
        if (pct == null) return false;
        if (view === 'wrapped' && pct < 50) return false;
        if (view === 'native' && pct >= 50) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'supplyAsc': return a.supply - b.supply;
        case 'supplyDesc': return b.supply - a.supply;
        case 'floorDesc': return (floors[b.asset]?.floorEth ?? -1) - (floors[a.asset]?.floorEth ?? -1);
        case 'wrappedDesc': return (pctFor(b) ?? -1) - (pctFor(a) ?? -1);
        case 'name': return a.asset.localeCompare(b.asset);
        default: return (a.series - b.series) || (a.card - b.card);
      }
    });
    return list;
  }, [cards, query, series, sort, view, floors, countsAvailable, pctFor]);

  useEffect(() => { setVisible(PAGE); }, [query, series, sort, view]);

  const shown = filtered.slice(0, visible);

  // Lazy-enrich native floors for the assets currently on screen, in batches.
  useEffect(() => {
    const pending = shown.map((c) => c.asset).filter((a) => !(a in floors));
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < pending.length; i += BATCH) {
        const slice = pending.slice(i, i + BATCH);
        try {
          const res = await fetch(`/api/enrich?assets=${slice.join(',')}`);
          const data = await res.json();
          if (cancelled || !data.ok) continue;
          setFloors((prev) => {
            const next = { ...prev };
            for (const a of slice) next[a] = data.items[a] || {};
            return next;
          });
        } catch {
          if (!cancelled) setFloors((prev) => {
            const next = { ...prev };
            for (const a of slice) if (!(a in next)) next[a] = {};
            return next;
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [shown, floors]);

  // Infinite scroll
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
      <div className="header-stat"><b>{fmtEth(collectionFloorEth)}</b><span>Emblem floor</span></div>
    </>
  );

  const toggleTitle = countsAvailable ? undefined : 'Set OPENSEA_API_KEY to enable per-card wrapped data';

  return (
    <>
      <Header right={headerRight} />
      <main className="container">
        <div style={{ margin: '28px 0 4px' }}>
          <h1 style={{ fontSize: 30 }}>Wrapped vs native, for every Rare Pepe</h1>
          <p style={{ color: 'var(--text-dim)', marginTop: 8, maxWidth: 640 }}>
            Supply and floor price for all {cards.length.toLocaleString()} cards — native on{' '}
            <span style={{ color: 'var(--btc)' }}>Counterparty</span> vs wrapped in{' '}
            <span style={{ color: 'var(--eth)' }}>Emblem Vault</span>, normalized to ETH.
          </p>
        </div>

        <div className="controls">
          <label className="search">
            <span aria-hidden="true">🔍</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by card name…"
              aria-label="Search cards"
            />
          </label>

          <select className="select" value={series} onChange={(e) => setSeries(e.target.value)} aria-label="Filter by series">
            <option value="all">All series</option>
            {seriesOptions.map((s) => <option key={s} value={String(s)}>Series {s}</option>)}
          </select>

          <select className="select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            <option value="series">Sort: Series</option>
            <option value="supplyAsc">Sort: Rarest (low supply)</option>
            <option value="supplyDesc">Sort: Highest supply</option>
            <option value="floorDesc">Sort: Native floor ↓</option>
            {countsAvailable && <option value="wrappedDesc">Sort: Most wrapped %</option>}
            <option value="name">Sort: Name A–Z</option>
          </select>

          <div className="toggle-group" role="group" aria-label="Wrapped/native view">
            <button className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}>All</button>
            <button
              className={view === 'wrapped' ? 'active' : ''}
              disabled={!countsAvailable}
              title={toggleTitle}
              onClick={() => setView('wrapped')}
            >Mostly wrapped</button>
            <button
              className={view === 'native' ? 'active' : ''}
              disabled={!countsAvailable}
              title={toggleTitle}
              onClick={() => setView('native')}
            >Mostly native</button>
          </div>
        </div>

        <div className="result-meta">
          Showing {Math.min(visible, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()} cards
          {!countsReady && <span> · loading wrapped data…</span>}
        </div>

        <div className="grid">
          {shown.map((c) => (
            <Tile key={c.asset} card={c} floor={floors[c.asset]} pct={pctFor(c)} />
          ))}
        </div>

        {visible < filtered.length && <div ref={sentinel} className="sentinel" aria-hidden="true" />}
        {filtered.length === 0 && (
          <div className="loadmore">
            {view !== 'all' && countsAvailable ? 'No cards in this view.' : `No cards match “${query}”.`}
          </div>
        )}
      </main>
    </>
  );
}

function Tile({ card, floor, pct }) {
  const floorLoaded = floor !== undefined;
  return (
    <Link href={`/card/${card.asset}`} className="tile">
      <div className="tile-img">
        {card.image ? <img src={card.image} alt={card.title || card.asset} loading="lazy" /> : null}
        <span className="tile-serie">S{card.series}·{card.card}</span>
      </div>
      <div className="tile-body">
        <div className="tile-name" title={card.title || card.asset}>{card.title || card.asset}</div>
        <div className="tile-row">
          <span>Supply</span>
          <b>{fmtSupply(card.supply)}</b>
        </div>
        <div className="tile-row">
          <span>Native floor</span>
          <b className="tile-floor">{floorLoaded ? fmtEth(floor?.floorEth) : <span className="skeleton">…</span>}</b>
        </div>
        <div className="tile-split">
          <div className="ratiobar" aria-hidden="true">
            <span style={{ width: pct != null ? `${pct}%` : '0%' }} />
          </div>
          <div className="labels">
            <span className="w">Wrapped {pct != null ? fmtPct(pct) : '—'}</span>
            <span className="n">Native {pct != null ? fmtPct(100 - pct) : '—'}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
