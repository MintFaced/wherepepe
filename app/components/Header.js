import Link from 'next/link';

export default function Header({ right }) {
  return (
    <header className="site-header">
      <div className="container">
        <Link href="/" className="logo" aria-label="Where Pepe home">
          <span className="frog" aria-hidden="true">🐸</span>
          <span>Where<span className="accent">Pepe</span></span>
        </Link>
        {right ? <div className="header-stats">{right}</div> : null}
      </div>
    </header>
  );
}
