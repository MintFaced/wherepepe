import Gallery from './components/Gallery';
import { getCatalog } from '../lib/catalog';
import { getEmblemVaultedTotal } from '../lib/emblem';

export const revalidate = 3600;

export default async function Home() {
  const [cards, emblem] = await Promise.all([
    getCatalog().catch(() => []),
    getEmblemVaultedTotal().catch(() => ({ total: null })),
  ]);

  return <Gallery initialCards={cards} emblemVaultedTotal={emblem.total ?? null} />;
}
