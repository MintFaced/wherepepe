import './globals.css';

// Resolve a valid absolute site URL no matter how the env var is set.
// Accepts values with or without a protocol; falls back safely so the build
// never crashes on `new URL(...)` (which broke Vercel's /_not-found prerender).
function resolveSiteUrl() {
  let raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'https://where-pepe.vercel.app';
  raw = String(raw).trim();
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  try {
    return new URL(raw).origin;
  } catch {
    return 'https://where-pepe.vercel.app';
  }
}

const SITE_URL = resolveSiteUrl();

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Where Pepe — Wrapped vs Native Rare Pepe Tracker',
  description:
    'For every Rare Pepe card: how many are wrapped in Emblem Vault (Ethereum) ' +
    'vs still native on Counterparty (Bitcoin), with floor prices in ETH.',
  openGraph: {
    title: 'Where Pepe',
    description:
      'Wrapped vs native supply and floor prices for every Rare Pepe card.',
    url: SITE_URL,
    siteName: 'Where Pepe',
    type: 'website',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Where Pepe',
    description:
      'Wrapped vs native supply and floor prices for every Rare Pepe card.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
