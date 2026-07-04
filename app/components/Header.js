import Link from 'next/link';

export default function Header({ right }) {
  return (
    <header className="site-header">
      <div className="container">
        <Link href="/" className="logo" aria-label="WherePepe Prices home">
          <span className="frog" aria-hidden="true">🐸</span>
          <span>Where<span className="accent">Pepe</span> <span className="logo-sub">Prices</span></span>
          <span className="wpp" aria-hidden="true">WPP</span>
        </Link>
        {right ? <div className="header-stats">{right}</div> : null}
      </div>
    </header>
  );
}
