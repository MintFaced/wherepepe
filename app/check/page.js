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
    return <Link key={k + v} href={`/check?${q}`} className={on ? 'pc-on' : ''}>{label}</Link>;
  };

  return (
    <main>
      <section className="pc-hero">
        <h1>Don’t buy an <em>empty</em> vault.</h1>
        <p>Paste any Emblem vault — token ID or OpenSea link — and PepeCheck reads what’s actually inside, straight from Emblem and Counterparty.</p>
        <form className="pc-form" action={check}>
          <input name="q" placeholder="Vault token ID or OpenSea URL" autoComplete="off" inputMode="numeric" aria-label="Vault token ID or OpenSea URL" />
          <button type="submit">Check it</button>
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
        <p className="pc-empty-note">{hasPcDb() ? 'No listings indexed yet — the crawler runs every 10 minutes. Check a vault directly above in the meantime.' : 'Vault index not configured — the checker above still works.'}</p>
      ) : (
        <div className="pc-grid">
          {rows.map((r) => {
            const card = lookupBundled(r.card);
            const st = PC_STATES[r.state] ? r.state : 'loading';
            return (
              <Link key={r.order_hash} href={`/check/${r.token_id}`} className="pc-tile">
                <span className={`pc-chip pc-s-${st}`}>{PC_STATES[st].label}</span>
                {card?.image ? <img src={card.image} alt={r.card} loading="lazy" /> : null}
                <div className="pc-tile-body">
                  <div className="pc-tile-card">{r.card}</div>
                  <div className="pc-tile-meta">{COLLECTIONS[r.collection]?.label || 'Emblem vault'} · #{String(r.token_id).slice(0, 8)}…</div>
                  <div className="pc-tile-price">Ξ {Number(r.price_eth).toFixed(4)}</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
