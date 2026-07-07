import Link from 'next/link';
import { verifyVault, upsertVault, hasPcDb, PC_STATES } from '../../../lib/pepecheck';
import { hasEmblemKey } from '../../../lib/emblemVault';
import { COLLECTIONS } from '../../../lib/collections';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function generateMetadata({ params }) {
  const { tokenId } = await params;
  return { title: `Vault ${tokenId} — PepeCheck` };
}

export default async function CheckPage({ params }) {
  const { tokenId: raw } = await params;
  const tokenId = String(raw).replace(/\D/g, '');
  if (!hasEmblemKey()) return <main className="container"><div className="pc-sheet"><div /><div><h1>PepeCheck</h1><p className="pc-blurb">Awaiting configuration.</p></div></div></main>;

  let v = null, err = '';
  try {
    v = await verifyVault(tokenId);
    if (hasPcDb()) await upsertVault(tokenId, null, v).catch(() => {});
  } catch (e) { err = String(e.message || e); }

  if (!v) {
    return (
      <main className="container">
        <div className="pc-sheet">
          <div />
          <div>
            <h1>Vault {tokenId}</h1>
            <p className="pc-sub">could not verify</p>
            <p className="pc-blurb">{err || 'Emblem didn’t answer — try again in a moment.'}</p>
          </div>
        </div>
      </main>
    );
  }

  const st = PC_STATES[v.state] || PC_STATES.other;
  const os = `https://opensea.io/assets/ethereum/0x82c7a8f707110f5fbb16184a5933e9f78a34c6ab/${tokenId}`;

  return (
    <main className="container">
      <div className="pc-sheet">
        <div>{v.image ? <img className="pc-art" src={v.image} alt={v.card || 'vault'} /> : null}</div>
        <div>
          <h1>{v.card || `Vault ${tokenId}`}</h1>
          <p className="pc-sub">
            {v.collection ? `${COLLECTIONS[v.collection]?.label} · ` : ''}vault {tokenId} · checked {new Date(v.checkedAt).toUTCString().replace(' GMT', ' UTC')}
          </p>
          <div className={`pc-stamp pc-s-${v.state}`}>{st.emoji} {st.label}</div>
          <p className="pc-blurb">{st.blurb}</p>

          <div className="pc-ledger">
            <div className="pc-row"><span className="pc-k">claims to contain</span><span className="pc-v">{v.card || '—'} ({v.recordedProject || '—'})</span></div>
            <div className="pc-row"><span className="pc-k">actually contains</span><span className="pc-v">{v.contents.length ? v.contents.map((c) => `${c.balance ?? ''} ${c.name}`.trim()).join(', ') : 'nothing'}</span></div>
            <div className="pc-row"><span className="pc-k">seen by</span><span className="pc-v">{v.source === 'counterparty' ? 'Counterparty (not yet loaded by Emblem)' : 'Emblem (loaded)'}</span></div>
            {v.expectedProject && v.recordedProject && v.recordedProject !== v.expectedProject ? (
              <div className="pc-row"><span className="pc-k">collection error</span><span className="pc-v">created as {v.recordedProject}, card belongs to {v.expectedProject}</span></div>
            ) : null}
            {v.btcAddress ? <div className="pc-row"><span className="pc-k">vault BTC address</span><span className="pc-v"><a href={`https://xchain.io/address/${v.btcAddress}`} target="_blank" rel="noreferrer">{v.btcAddress}</a></span></div> : null}
          </div>

          <div className="pc-rows">
            {v.card ? <Link className="pc-lrow" href={`/card/${v.card}`}><span>{v.card} floors — native vs wrapped</span><span>→</span></Link> : null}
            <a className="pc-lrow" href={os} target="_blank" rel="noreferrer"><span>View on OpenSea</span><span>↗</span></a>
            {v.card ? <a className="pc-lrow" href={`https://xchain.io/asset/${v.card}`} target="_blank" rel="noreferrer"><span>Card on xchain</span><span>↗</span></a> : null}
          </div>
        </div>
      </div>
    </main>
  );
}
