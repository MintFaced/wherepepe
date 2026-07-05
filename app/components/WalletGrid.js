'use client';

import { useState } from 'react';
import Link from 'next/link';
import { fmtEth } from '../../lib/format';

export default function WalletGrid({ cards }) {
  const [sort, setSort] = useState('series');
  const sorted = [...cards].sort((a, b) =>
    sort === 'value'
      ? (b.floorEth ?? -1) - (a.floorEth ?? -1)
      : (a.series - b.series) || (a.card - b.card),
  );

  return (
    <>
      <div className="controls">
        <div className="toggle-group" role="group" aria-label="Sort collection">
          <button className={sort === 'series' ? 'active' : ''} onClick={() => setSort('series')}>By series</button>
          <button className={sort === 'value' ? 'active' : ''} onClick={() => setSort('value')}>By value</button>
        </div>
      </div>
      <div className="grid">
        {sorted.map((c) => (
          <Link key={c.asset} href={`/card/${c.asset}`} className="tile">
            <div className="tile-img">
              {c.image ? <img src={c.image} alt={c.title} loading="lazy" /> : null}
              {c.series != null && <span className="tile-serie">S{c.series}·{c.card}</span>}
            </div>
            <div className="tile-body">
              <div className="tile-name" title={c.title}>{c.title}</div>
              <div className="tile-row">
                <span style={{ color: 'var(--eth)' }}>Value</span>
                <b className="tile-floor">{fmtEth(c.floorEth)}</b>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
