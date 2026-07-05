'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Left/right arrow keys flip through the collection.
export default function CardKeyNav({ prev, next }) {
  const router = useRouter();
  useEffect(() => {
    if (prev) router.prefetch(`/card/${prev}`);
    if (next) router.prefetch(`/card/${next}`);
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft' && prev) router.push(`/card/${prev}`);
      else if (e.key === 'ArrowRight' && next) router.push(`/card/${next}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, router]);
  return null;
}
