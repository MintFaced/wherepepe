import './globals.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://where-pepe.vercel.app';

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
