import Link from 'next/link';
import { notFound } from 'next/navigation';
import Header from '../../components/Header';
import WalletGrid from '../../components/WalletGrid';
import { artistCollection } from '../../../lib/artist';
import { fmtEth } from '../../../lib/format';

export const revalidate = 3600;

export async function generateMetadata({ params }) {
  const { name } = await params;
  const artist = decodeURIComponent(name || '');
  const w = await artistCollection(artist);
  const title = `${w.name} — Rare Pepe artist · WherePepe Prices`;
  const description = `${w.count} Rare Pepes by ${w.name} · market cap ${fmtEth(w.marketCapEth)}`;
  return {
    title,
    description,
    openGraph: { title, description, images: [w.cards[0]?.image || '/og.png'], type: 'profile' },
    twitter: { card: 'summary_large_image', title, description, images: [w.cards[0]?.image || '/og.png'] },
  };
}

export default async function ArtistPage({ params }) {
  const { name } = await params;
  const artist = decodeURIComponent(name || '');
  const w = await artistCollection(artist);
  if (!w.count) notFound();

  return (
    <>
      <Header />
      <div className="container">
        <Link href="/" className="back">← Prices</Link>

        <div className="wallet-head">
          <div>
            <h1>{w.name}</h1>
            <div className="sub">Rare Pepe artist</div>
            <div className="wallet-stats">
              <span><b>{w.count.toLocaleString()}</b> cards</span>
              <span><b>{w.seriesCount}</b> series</span>
              <span><b style={{ color: 'var(--eth)' }}>{fmtEth(w.marketCapEth)}</b> market cap</span>
            </div>
          </div>
        </div>

        <WalletGrid cards={w.cards} />
      </div>
    </>
  );
}
