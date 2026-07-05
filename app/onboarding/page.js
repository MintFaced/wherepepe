import Link from 'next/link';
import Header from '../components/Header';

const EXAMPLE = '/u/0xd40b63bf04a44e43fbfe5784bcf22acaab34a180';
const IMG = 'https://pepewtf.s3.amazonaws.com/collections';
const QUAD = {
  rare: `${IMG}/rare-pepes/small/1/RAREPEPE.jpg`,
  fake: `${IMG}/fake-rares/small/0/FREEDOMKEK.jpeg`,
  native: `${IMG}/rare-pepes/small/1/DANKPEPE.jpg`,
  emblem: `${IMG}/rare-pepes/small/1/GOXPEPE.jpg`,
};

export const metadata = {
  title: 'Claim your PepeProfile — WherePepe',
  description: 'Your whole pepe collection in one view — Rares & Fake Rares, wrapped and native. Plus a seat at ChatPepe.',
  openGraph: { title: 'Claim your PepeProfile 🐸', description: 'Your whole pepe collection in one view. Plus a seat at ChatPepe.', images: ['/og.png'], type: 'website' },
};

export default function OnboardingPage() {
  return (
    <>
      <Header />
      <div className="container onboard">
        <div className="onboard-hero">
          <h1>Claim your PepeProfile 🐸</h1>
          <p>Your whole pepe collection in one view. <b>Rares &amp; Fake Rares, wrapped and native</b> — in one place. Plus a seat at ChatPepe.</p>
          <div className="hero-cta">
            <Link href="/chat" className="cta cta-primary">Claim your profile →</Link>
            <a href={EXAMPLE} className="cta cta-secondary">View example profile</a>
          </div>
        </div>

        {/* Quad: two collections × two locations */}
        <div className="onboard-quad">
          <div className="quad-block">
            <div className="quad-label">Pepe Collection</div>
            <div className="quad-row">
              <div className="qcard qcard--rare">
                <img src={QUAD.rare} alt="Rare Pepe" loading="lazy" />
                <span className="qcard-tag">Rare Pepe</span>
              </div>
              <div className="qcard qcard--fake">
                <img src={QUAD.fake} alt="Fake Rare" loading="lazy" />
                <span className="qcard-tag">Fake Rare</span>
              </div>
            </div>
          </div>
          <div className="quad-block">
            <div className="quad-label">Held on</div>
            <div className="quad-row">
              <div className="qcard qcard--native">
                <img src={QUAD.native} alt="On Native" loading="lazy" />
                <span className="qcard-tag">On Native · BTC</span>
              </div>
              <div className="qcard qcard--emblem">
                <img src={QUAD.emblem} alt="On Emblem" loading="lazy" />
                <span className="qcard-tag">On Emblem · ETH</span>
              </div>
            </div>
          </div>
        </div>

        <div className="onboard-callout">🐸 You must own at least one Rare Pepe to use ChatPepe.</div>

        <div className="onboard-steps">
          <h2>How it works</h2>
          <ol className="steps">
            <li><span className="step-n">1</span><div><b>Go to ChatPepe and connect your wallet.</b> <span className="muted">One gas-free signature and your profile is created.</span></div></li>
            <li><span className="step-n">2</span><div><b>Share your Counterparty wallet address</b> and your native pepes appear on your profile.</div></li>
            <li><span className="step-n">3</span><div><b>Share your profile in ChatPepe.</b> It lives at <code>wherepepe.com/u/your-address</code>.</div></li>
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
          <Link href="/chat" className="cta cta-primary">Claim your PepeProfile →</Link>
        </div>
      </div>
    </>
  );
}
