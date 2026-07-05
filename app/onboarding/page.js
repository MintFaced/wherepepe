import Link from 'next/link';
import Header from '../components/Header';

const EXAMPLE = '/u/0xd40b63bf04a44e43fbfe5784bcf22acaab34a180';

export const metadata = {
  title: 'Create your WherePepe profile',
  description: 'See every Rare Pepe & Fake Rare you own — wrapped and native — in one place, valued in ETH. Plus a seat at ChatPepe.',
  openGraph: { title: 'Create your WherePepe profile', description: 'Your whole pepe collection in one place, valued in ETH.', images: ['/og.png'], type: 'website' },
};

export default function OnboardingPage() {
  return (
    <>
      <Header />
      <div className="container onboard">
        <div className="onboard-hero">
          <h1>Create your WherePepe profile 🐸</h1>
          <p>Your whole pepe collection — <b>Rare Pepe &amp; Fake Rare</b>, wrapped and native — in one place, valued in ETH. Plus a seat at ChatPepe.</p>
          <div className="hero-cta">
            <Link href="/chat" className="cta cta-primary">Connect wallet →</Link>
            <a href={EXAMPLE} className="cta cta-secondary">View example profile</a>
          </div>
        </div>

        <div className="onboard-benefits">
          <div className="benefit">
            <div className="benefit-icon">🖼️</div>
            <h3>All your cards in one place</h3>
            <p>Every Rare Pepe and Fake Rare you own — <span style={{ color: 'var(--eth)' }}>wrapped in Emblem Vault</span> (ETH) and <span style={{ color: 'var(--btc)' }}>native on Counterparty</span> (BTC) — with per-card floor values, editions owned, and a collection total. Filter by collection, sort by value.</p>
          </div>
          <div className="benefit">
            <div className="benefit-icon">💬</div>
            <h3>Chat with fellow pepe owners</h3>
            <p>ChatPepe is a holder-gated lounge for collectors. React, reply, @tag, set a Rare Pepe as your PFP, and talk shop with people who actually own the cards. Click any handle to see their collection.</p>
          </div>
        </div>

        <div className="onboard-steps">
          <h2>How it works</h2>
          <ol className="steps">
            <li><span className="step-n">1</span><div><b>Connect your wallet</b> — one free signature in ChatPepe (no gas). Your profile is created instantly with a Pepe identity.</div></li>
            <li><span className="step-n">2</span><div><b>Link your free wallet</b> <span className="muted">(optional)</span> — add your Counterparty / BTC address on your profile to surface your native pepes too.</div></li>
            <li><span className="step-n">3</span><div><b>You’re live</b> — your profile lives at <code>wherepepe.com/u/your-address</code>. Share it, and browse anyone else’s from chat.</div></li>
          </ol>
        </div>

        <div className="onboard-example">
          <h2>Example profile</h2>
          <a href={EXAMPLE} className="example-shot">
            <img src="/example-profile.png" alt="Example WherePepe profile" />
          </a>
          <a href={EXAMPLE} className="cta cta-secondary">Open this profile →</a>
        </div>

        <div className="onboard-foot">
          <Link href="/chat" className="cta cta-primary">Create your profile →</Link>
        </div>
      </div>
    </>
  );
}
