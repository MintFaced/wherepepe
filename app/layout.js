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
  title: 'WherePepe Prices (WPP) — where is each Rare Pepe cheapest?',
  description:
    'For every Rare Pepe card: the floor price native on Counterparty (Bitcoin) ' +
    'vs wrapped in Emblem Vault (Ethereum), in ETH — and which side is cheaper.',
  openGraph: {
    title: 'WherePepe Prices (WPP)',
    description:
      'Where is each Rare Pepe cheapest — native on Counterparty or wrapped in Emblem? Floors in ETH.',
    url: SITE_URL,
    siteName: 'WherePepe Prices',
    type: 'website',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WherePepe Prices (WPP)',
    description:
      'Where is each Rare Pepe cheapest — native on Counterparty or wrapped in Emblem? Floors in ETH.',
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
