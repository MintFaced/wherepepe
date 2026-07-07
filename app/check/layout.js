import Link from 'next/link';
import './pc.css';

export const metadata = {
  title: 'PepeCheck — verified Rare Pepe & Fake Rares vaults',
  description: 'Every Emblem vault, checked against the chain. Don’t buy an empty vault.',
};

export default function PepeCheckLayout({ children }) {
  return (
    <div className="pc-root">
      {/* Nested layouts can't touch <head>; browsers honor stylesheet links in body. */}
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet" />
      <header className="pc-hdr">
        <Link href="/check" className="pc-wordmark">PEPE<span className="pc-wm-check">CHECK</span></Link>
        <nav className="pc-hdr-nav">
          <Link href="/check?collection=rare-pepe">Rare Pepe</Link>
          <Link href="/check?collection=fake-rare">Fake Rares</Link>
          <Link href="/">WherePepe prices</Link>
          <Link href="/moves">MovePepe</Link>
        </nav>
      </header>
      {children}
      <footer className="pc-ftr">
        <p>PepeCheck verifies vault contents against Emblem and Counterparty at the time shown. Verification is information, not a guarantee — sellers control their vaults until sale. Not affiliated with Emblem Vault.</p>
      </footer>
    </div>
  );
}
