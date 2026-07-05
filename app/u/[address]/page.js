import Link from 'next/link';
import { isAddress } from 'viem';
import { notFound } from 'next/navigation';
import Header from '../../components/Header';
import WalletGrid from '../../components/WalletGrid';
import { walletCollection } from '../../../lib/wallet';
import { fmtEth } from '../../../lib/format';

export const revalidate = 300;

function shortAddr(a) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export async function generateMetadata({ params }) {
  const { address } = await params;
  if (!isAddress(address)) return { title: 'Wallet — WherePepe Prices' };
  const w = await walletCollection(address);
  const title = `${w.handle}’s Rare Pepes — WherePepe Prices`;
  const description = `${w.count} Rare Pepes worth ${fmtEth(w.totalValueEth)} — ${shortAddr(w.address)}`;
  return {
    title,
    description,
    openGraph: { title, description, images: [w.pfp || '/og.png'], type: 'profile' },
    twitter: { card: 'summary_large_image', title, description, images: [w.pfp || '/og.png'] },
  };
}

export default async function WalletPage({ params }) {
  const { address } = await params;
  if (!isAddress(address)) notFound();
  const w = await walletCollection(address);

  return (
    <>
      <Header />
      <div className="container">
        <Link href="/chat" className="back">← ChatPepe</Link>

        <div className="wallet-head">
          {w.pfp
            ? <img className="wallet-avatar" src={w.pfp} alt="" />
            : <span className="wallet-avatar" style={{ background: w.avatar }} />}
          <div>
            <h1>{w.handle}</h1>
            <div className="sub">{shortAddr(w.address)}</div>
            <div className="wallet-stats">
              <span><b>{w.count.toLocaleString()}</b> Rare Pepes</span>
              <span><b style={{ color: 'var(--eth)' }}>{fmtEth(w.totalValueEth)}</b> collection value</span>
            </div>
          </div>
          <a
            className="wallet-os"
            href={`https://opensea.io/${w.address}`}
            target="_blank"
            rel="noopener noreferrer"
          >OpenSea ↗</a>
        </div>

        {w.count === 0 ? (
          <div className="loadmore">No Rare Pepes in this wallet yet. 🐸</div>
        ) : (
          <WalletGrid cards={w.cards} />
        )}
      </div>
    </>
  );
}
