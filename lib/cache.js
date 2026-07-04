// Tiny in-memory TTL memo. Serverless instances stay warm between requests,
// so this caches upstream API responses across requests on the same instance.
// (We avoid Next's fetch cache for the big catalog payload, which can exceed
// its 2MB cache-entry limit.) A cold start simply repopulates on first hit.

const store = new Map();

export async function memo(key, ttlMs, fn) {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.t < ttlMs) return hit.v;
  // De-dupe concurrent misses: cache the in-flight promise.
  if (hit && hit.p) return hit.p;
  const p = Promise.resolve().then(fn);
  store.set(key, { t: hit ? hit.t : 0, v: hit ? hit.v : undefined, p });
  try {
    const v = await p;
    store.set(key, { t: Date.now(), v });
    return v;
  } catch (e) {
    // On failure, keep any stale value rather than hammering the upstream.
    if (hit && hit.v !== undefined) {
      store.set(key, { t: hit.t, v: hit.v });
      return hit.v;
    }
    store.delete(key);
    throw e;
  }
}

export const TTL = {
  CATALOG: 24 * 60 * 60 * 1000, // 1 day
  MARKET: 60 * 60 * 1000,       // 1 hour
  RATES: 10 * 60 * 1000,        // 10 min
  WRAPPED: 60 * 60 * 1000,      // 1 hour
};
