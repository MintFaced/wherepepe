'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { fmtEth } from '../../lib/format';

const LABELS = { 'rare-pepe': 'Rare Pepe', 'fake-rare': 'Fake Rare' };

export default function WalletGrid({ cards }) {
  const [sort, setSort] = useState('series');
  const [col, setCol] = useState('all');

  const collections = useMemo(
    () => [...new Set(cards.map((c) => c.collection).filter(Boolean))],
    [cards],
  );
  const showColFilter = collections.length > 1;

  const shown = useMemo(() => {
    const filtered = col === 'all' ? cards : cards.filter((c) => c.collection === col);
    return [...filtered].sort((a, b) =>
      sort === 'value'
        ? (b.floorEth ?? -1) - (a.floorEth ?? -1)
        : (a.series - b.series) || (a.card - b.card),
    );
  }, [cards, col, sort]);

  return (
    <>
      <div className="controls">
        {showColFilter && (
          <div className="toggle-group" role="group" aria-label="Collection">
            <button className={col === 'all' ? 'active' : ''} onClick={() => setCol('all')}>All</button>
            {collections.includes('rare-pepe') && <button className={col === 'rare-pepe' ? 'active' : ''} onClick={() => setCol('rare-pepe')}>Rare Pepe</button>}
            {collections.includes('fake-rare') && <button className={col === 'fake-rare' ? 'active' : ''} onClick={() => setCol('fake-rare')}>Fake Rare</button>}
          </div>
        )}
        <div className="toggle-group" role="group" aria-label="Sort collection">
          <button className={sort === 'series' ? 'active' : ''} onClick={() => setSort('series')}>By series</button>
          <button className={sort === 'value' ? 'active' : ''} onClick={() => setSort('value')}>By value</button>
        </div>
      </div>
      <div className="grid">
        {shown.map((c) => (
          <Link key={c.asset} href={`/card/${c.asset}`} className="tile">
            <div className="tile-img">
              {c.image ? <img src={c.image} alt={c.title} loading="lazy" /> : null}
              {c.series != null && <span className="tile-serie">S{c.series}·{c.card}</span>}
              {c.collection === 'fake-rare' && <span className="tile-col tile-col--fake">FAKE</span>}
            </div>
            <div className="tile-body">
              <div className="tile-name" title={c.title}>{c.title}</div>
              <div className="tile-row">
                <span style={{ color: 'var(--eth)' }}>Value</span>
                <b className="tile-floor">{fmtEth(c.floorEth)}</b>
              </div>
              {(c.wrapped > 0 || c.native > 0) && (
                <div className="own-tags">
                  {c.wrapped > 0 && <span className="own-tag own-tag--wrapped">×{c.wrapped} wrapped</span>}
                  {c.native > 0 && <span className="own-tag own-tag--native">×{c.native} native</span>}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
