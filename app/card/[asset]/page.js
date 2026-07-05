import Link from 'next/link';
import { notFound } from 'next/navigation';
import Header from '../../components/Header';
import { getCardMeta } from '../../../lib/catalog';
import { getNative } from '../../../lib/native';
import { getWrappedForCard } from '../../../lib/wrapped';
import { COLLECTIONS } from '../../../lib/collections';
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
  const description = `Where is ${meta.title} cheapest — native on Counterparty or wrapped in Emblem Vault? Floor prices in ETH.`;
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

  const [native, cmp] = await Promise.all([getNative(key), getWrappedForCard(key)]);

  const supply = meta.supply || native.supply || 0;
  const wrappedEth = cmp.wrappedFloorEth;
  const nativeEth = cmp.nativeFloorEth;
  const cheaper = cmp.cheaper;

  const verdict =
    cheaper === 'wrapped' ? { cls: 'wrapped', label: 'Value on Emblem — cheaper wrapped' }
    : cheaper === 'native' ? { cls: 'native', label: 'Value on Native — cheaper on Counterparty' }
    : { cls: 'none', label: (nativeEth != null || wrappedEth != null) ? 'Listed on one side only' : 'No active listings' };

  const nativeAmt =
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
            <div className="sub">{(COLLECTIONS[meta.collection] || COLLECTIONS['rare-pepe']).label} · Series {meta.series} · Card {meta.card} · {key}</div>

            <div className={`verdict verdict--${verdict.cls}`}>
              <span>{verdict.label}</span>
              {cmp.savingsPct != null && cmp.savingsPct >= 1 && (
                <span className="save">save {fmtPct(cmp.savingsPct)}</span>
              )}
            </div>

            <div className="stat-cards">
              <div className="stat-card native">
                <div className="k">Native floor (Counterparty)</div>
                <div className="v">{fmtEth(nativeEth)}</div>
                <div className="note">{nativeAmt !== '—' ? `${nativeAmt} · dispenser` : 'No open dispenser'}</div>
              </div>
              <div className="stat-card wrapped">
                <div className="k">Wrapped floor (Emblem)</div>
                <div className="v">{fmtEth(wrappedEth ?? cmp.collectionFloorEth)}</div>
                <div className="note">{wrappedEth != null ? 'Cheapest Emblem listing' : 'No listing — collection floor'}</div>
              </div>
            </div>

            <div className="meta-list">
              <div className="row"><span>Highest offer (Emblem)</span><b style={cmp.highestOfferEth != null ? { color: 'var(--eth)' } : undefined}>{fmtEth(cmp.highestOfferEth)}</b></div>
              <div className="row"><span>Total supply (issued)</span><b>{fmtSupply(supply)}</b></div>
              <div className="row"><span>Native holders</span><b>{fmtInt(native.holders)}</b></div>
              <div className="row"><span>Artist</span><b>{meta.artist ? <Link href={`/artist/${encodeURIComponent(meta.artist)}`} className="artist-link">{meta.artist}</Link> : '—'}</b></div>
              <div className="row"><span>Issued</span><b>{meta.issuance ? meta.issuance.slice(0, 10) : '—'}</b></div>
              <div className="row"><span>Est. value (USD)</span><b>{fmtUsd(native.estUsd)}</b></div>
            </div>

            <div className="links">
              <a href={`https://pepe.wtf/asset/${key}`} target="_blank" rel="noopener noreferrer">pepe.wtf ↗</a>
              <a href={`https://tokenscan.io/asset/${key}`} target="_blank" rel="noopener noreferrer">tokenscan ↗</a>
              <a href={`https://opensea.io/collection/${(COLLECTIONS[meta.collection] || COLLECTIONS['rare-pepe']).osSlug}`} target="_blank" rel="noopener noreferrer">Emblem on OpenSea ↗</a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
