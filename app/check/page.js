import Link from 'next/link';
import { redirect } from 'next/navigation';
import { browseListings, hasPcDb, PC_STATES } from '../../lib/pepecheck';
import { lookupBundled } from '../../lib/curatedAssets';
import { COLLECTIONS } from '../../lib/collections';

export const dynamic = 'force-dynamic';

// Accepts a raw tokenId or a pasted OpenSea URL; extracts the id server-side.
async function check(formData) {
  'use server';
  const raw = String(formData.get('q') || '');
  const fromUrl = raw.match(/\/(\d{6,})(?:[/?#]|$)/)?.[1];
  const id = fromUrl || raw.replace(/\D/g, '');
  if (id) redirect(`/check/${id}`);
}

export default async function PepeCheckHome({ searchParams }) {
  const sp = await searchParams;
  const collection = COLLECTIONS[sp?.collection] ? sp.collection : null;
  const state = PC_STATES[sp?.state] && sp.state !== 'other' ? sp.state : null;
  const rows = hasPcDb() ? await browseListings({ collection, state }) : [];

  const filt = (k, v, label) => {
    const on = (k === 'collection' ? collection : state) === v;
    const q = new URLSearchParams();
    if (k === 'collection' ? !on : collection) q.set('collection', k === 'collection' ? v : collection);
    if (k === 'state' ? !on : state) q.set('state', k === 'state' ? v : state);
    return <Link key={k + v} href={`/check?${q}`} className={`badge ${on ? 'pc-on' : ''}`}>{label}</Link>;
  };

  return (
    <main className="container">
      <section className="hero">
        <h1 className="hero-h1">Don’t buy an <span style={{ color: 'var(--pepe)' }}>empty</span> vault.</h1>
        <p className="hero-sub">
          <span className="hero-line">Paste any Emblem vault — token ID or OpenSea link —</span>
          <span className="hero-line">and PepeCheck reads what’s actually inside, straight from Emblem and Counterparty.</span>
        </p>
        <form className="pc-checkform" action={check}>
          <div className="search">
            <input name="q" placeholder="Vault token ID or OpenSea URL" autoComplete="off" inputMode="numeric" aria-label="Vault token ID or OpenSea URL" />
          </div>
          <button type="submit" className="btn-move">Check it</button>
        </form>
      </section>

      <div className="pc-filters">
        {filt('collection', 'rare-pepe', 'Rare Pepe')}
        {filt('collection', 'fake-rare', 'Fake Rares')}
        {filt('state', 'verified', '✅ verified')}
        {filt('state', 'loading', '🟡 not loaded')}
        {filt('state', 'mismatch', '⛔ mismatch')}
      </div>

      {rows.length === 0 ? (
        <p className="pc-empty-note">{hasPcDb() ? 'No listings match yet — the crawler runs every 10 minutes. Check a vault directly above in the meantime.' : 'Vault index not configured — the checker above still works.'}</p>
      ) : (
        <div className="grid">
          {rows.map((r) => {
            const card = lookupBundled(r.card);
            const st = PC_STATES[r.state] ? r.state : 'loading';
            return (
              <Link key={r.order_hash} href={`/check/${r.token_id}`} className="tile">
                <div className="tile-img">
                  {card?.image ? <img src={card.image} alt={r.card} loading="lazy" /> : null}
                  <span className={`pc-chip pc-s-${st}`}>{PC_STATES[st].label}</span>
                </div>
                <div className="tile-body">
                  <div className="tile-name">{r.card}</div>
                  <div className="tile-row">
                    <span>{COLLECTIONS[r.collection]?.label || 'Emblem vault'}</span>
                    <b className="pc-price">Ξ {Number(r.price_eth).toFixed(4)}</b>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
