import { Redis } from '@upstash/redis';

// Shared Upstash/Vercel-KV client. Used by both ChatPepe and the floor snapshot.
let _redis = null;

export function getRedis() {
  if (_redis) return _redis;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

export function redisConfigured() {
  return Boolean(getRedis());
}
