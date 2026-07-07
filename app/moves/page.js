import Header from '../components/Header';
import MovesPanel from '../components/MovesPanel';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Pepe Moves — wrap to ETH, unwrap to BTC · WherePepe',
  description: 'Move a Pepe between Bitcoin (Counterparty) and Ethereum with Emblem Vault. Wrap a native Pepe to a tradeable ETH NFT, or unwrap it back to BTC.',
};

export default async function MovesPage({ searchParams }) {
  const sp = (await searchParams) || {};
  const initialAsset = typeof sp.asset === 'string' ? sp.asset.toUpperCase() : '';
  const initialDir = sp.dir === 'unwrap' ? 'unwrap' : 'wrap';
  const initialCollection = sp.collection === 'fake-rare' ? 'fake-rare' : 'rare-pepe';
  return (
    <>
      <Header />
      <MovesPanel initialAsset={initialAsset} initialDir={initialDir} initialCollection={initialCollection} />
    </>
  );
}
