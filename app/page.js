import Gallery from './components/Gallery';
import { getCatalog } from '../lib/catalog';
import { getCollectionFloor } from '../lib/wrapped';
import { getRates } from '../lib/rates';

export const revalidate = 3600;

export default async function Home() {
  const [cards, collection, rates] = await Promise.all([
    getCatalog().catch(() => []),
    getCollectionFloor().catch(() => ({ floorEth: null })),
    getRates().catch(() => ({})),
  ]);

  return (
    <Gallery
      initialCards={cards}
      collectionFloorEth={collection.floorEth ?? null}
      rates={rates}
    />
  );
}
