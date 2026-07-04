import Link from 'next/link';
import { notFound } from 'next/navigation';
import Header from '../../components/Header';
import { getCardMeta } from '../../../lib/catalog';
import { getNative } from '../../../lib/native';
import { getWrappedForCard } from '../../../lib/wrapped';
import { fmtEth, fmtBtc, fmtXcp, fmtUsd, fmtInt, fmtSupply, fmtPct } from '../../../lib/format';

export const revalidate = 3600;
const ASSET_RE = /^[A-Z0-9._-]{1,40}$/;

export async function generateMetadata({ params }) {
  const { asset } = await params;
  const key = String(asset || '').toUpperCase();
  if (!ASSET_RE.test(key)) return { title: 'Where Pepe' };
  const meta = await getCardMeta(key);
  if (!meta) return { title: 'Card not found — Where Pepe' };
  const title = `${meta.title} — Series ${meta.series}, Card ${meta.card} · Where Pepe`;
  const description = `${meta.title}: supply ${fmtSupply(meta.supply)}, wrapped vs native breakdown and floor prices in ETH.`;
  return {
    title,
    description,
    openGraph: { title, description, images: meta.media ? [meta.media] : ['/og.png'], type: 'article' },
    twitter: { card: 'summary_large_image', title, description, images: meta.media ? [meta.media] : ['/og.png'] },
  };
}

export default async function CardPage({ params }) {
  const { asset } = await params;
  const key = String(asset || '').toUpperCase();
  if (!ASSET_RE.test(key)) notFound();

  const meta = await getCardMeta(key);
  if (!meta) notFound();

  const [native, wrapped] = await Promise.all([
    getNative(key),
    getWrappedForCard(key, meta.supply),
  ]);

  const supply = meta.supply || native.supply || 0;
  const wrappedCount = wrapped.count;
  const nativeCount = wrappedCount != null ? Math.max(0, supply - wrappedCount) : null;
  const pctWrapped = wrappedCount != null && supply > 0 ? Math.min(100, (wrappedCount / supply) * 100) : null;

  const nativeFloorRaw =
    native.floorCcy === 'BTC' ? fmtBtc(native.floorAmount)
    : native.floorCcy === 'XCP' ? fmtXcp(native.floorAmount)
    : '—';

  return (
    <>
      <Header />
      <div className="container">
        <Link href="/" className="back">← All cards</Link>

        <div className="detail">
          <div className="detail-art">
            {meta.media ? <img src={meta.media} alt={meta.title || key} /> : null}
          </div>

          <div>
            <h1>{meta.title || key}</h1>
            <div className="sub">Series {meta.series} · Card {meta.card} · {key}</div>

            <div className="stat-cards">
              <div className="stat-card native">
                <div className="k">Native floor (Counterparty)</div>
                <div className="v">{fmtEth(native.floorEth)}</div>
                <div className="note">{nativeFloorRaw !== '—' ? `${nativeFloorRaw} on the ${native.floorCcy} market` : 'No active listing'}</div>
              </div>
              <div className="stat-card wrapped">
                <div className="k">Wrapped floor (Emblem)</div>
                <div className="v">{fmtEth(wrapped.floorEth ?? wrapped.collectionFloorEth)}</div>
                <div className="note">{wrapped.floorEth == null ? 'Collection floor (per-card in next phase)' : 'Per-card Emblem floor'}</div>
              </div>
            </div>

            <div className="split-block">
              <h3>Supply split — {fmtSupply(supply)} issued</h3>
              <div className="ratiobar" aria-hidden="true">
                <span style={{ width: pctWrapped != null ? `${pctWrapped}%` : '0%' }} />
              </div>
              <div className="split-legend">
                <span className="w">Wrapped <b>{wrappedCount != null ? `${fmtInt(wrappedCount)} · ${fmtPct(pctWrapped)}` : '—'}</b></span>
                <span className="n">Native <b>{nativeCount != null ? `${fmtInt(nativeCount)} · ${fmtPct(100 - pctWrapped)}` : `${fmtSupply(supply)} · 100%`}</b></span>
              </div>
              {wrappedCount == null && (
                <p className="note">
                  Exact wrapped count arrives with the OpenSea/Emblem integration (next phase).
                  Until then, all issued supply is shown as native.
                </p>
              )}
            </div>

            <div className="meta-list">
              <div className="row"><span>Total supply</span><b>{fmtSupply(supply)}</b></div>
              <div className="row"><span>Holders (addresses)</span><b>{fmtInt(native.holders)}</b></div>
              <div className="row"><span>Artist</span><b>{meta.artist || '—'}</b></div>
              <div className="row"><span>Issued</span><b>{meta.issuance ? meta.issuance.slice(0, 10) : '—'}</b></div>
              <div className="row"><span>Native floor</span><b>{nativeFloorRaw}</b></div>
              <div className="row"><span>Est. value (USD)</span><b>{fmtUsd(native.estUsd)}</b></div>
            </div>

            <div className="links">
              <a href={`https://pepe.wtf/asset/${key}`} target="_blank" rel="noopener noreferrer">pepe.wtf ↗</a>
              <a href={`https://tokenscan.io/asset/${key}`} target="_blank" rel="noopener noreferrer">tokenscan ↗</a>
              <a href="https://opensea.io/collection/rare-pepe-curated" target="_blank" rel="noopener noreferrer">Emblem on OpenSea ↗</a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
