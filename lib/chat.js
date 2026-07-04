import crypto from 'crypto';
import { Redis } from '@upstash/redis';

// ─── ChatPepe backend ─────────────────────────────────────────────────────
// Wallet-gated global chat. Messages live in Redis (Vercel KV / Upstash);
// identities are derived deterministically from the wallet address; sessions
// are stateless HMAC tokens issued after a one-time signature.

const KEY = 'chatpepe:messages';
const MAX_MESSAGES = 200;
const RATE_MS = 1500;         // min gap between a wallet's messages
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_TEXT = 280;

let _redis = null;
export function getRedis() {
  if (_redis) return _redis;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}
export function chatConfigured() {
  return Boolean(getRedis());
}

// ── Identity ────────────────────────────────────────────────────────────
const ADJ = ['Smug', 'Rare', 'Dank', 'Comfy', 'Feels', 'Based', 'Cursed', 'Golden',
  'Neon', 'Bizarro', 'Honk', 'Chad', 'Cosmic', 'Sad', 'Angry', 'Zoomer', 'Mystic', 'Groovy'];
const NOUN = ['Pepe', 'Frog', 'Kek', 'Toad', 'Apu', 'Ribbit'];

export function identityFor(address) {
  const a = String(address).toLowerCase();
  const h = crypto.createHash('sha256').update(a).digest();
  const handle = `${ADJ[h[0] % ADJ.length]}${NOUN[h[1] % NOUN.length]}·${a.slice(-4)}`;
  const avatar = `linear-gradient(135deg, hsl(${h[2] % 360} 65% 45%), hsl(${h[3] % 360} 65% 28%))`;
  return { address: a, handle, avatar };
}

// ── Stateless session tokens (HMAC) ──────────────────────────────────────
function secret() {
  return process.env.CHAT_SECRET || 'chatpepe-dev-secret-change-me';
}
export function issueToken(address, holder) {
  const payload = { a: String(address).toLowerCase(), h: holder ? 1 : 0, exp: Date.now() + SESSION_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}
export function verifyToken(token) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const macBuf = Buffer.from(mac);
  const expBuf = Buffer.from(expected);
  if (macBuf.length !== expBuf.length || !crypto.timingSafeEqual(macBuf, expBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload.a || (payload.exp && Date.now() > payload.exp)) return null;
    return { address: payload.a, holder: Boolean(payload.h) };
  } catch {
    return null;
  }
}

// ── Messages ─────────────────────────────────────────────────────────────
export async function addMessage({ address, text, holder }) {
  const r = getRedis();
  if (!r) throw new Error('chat not configured');
  const id = crypto.randomBytes(8).toString('hex');
  const ident = identityFor(address);
  const msg = { id, address: ident.address, handle: ident.handle, avatar: ident.avatar, holder: Boolean(holder), text, ts: Date.now() };
  await r.lpush(KEY, JSON.stringify(msg));
  await r.ltrim(KEY, 0, MAX_MESSAGES - 1);
  return msg;
}

export async function listMessages() {
  const r = getRedis();
  if (!r) return [];
  const items = await r.lrange(KEY, 0, MAX_MESSAGES - 1);
  return items
    .map((x) => (typeof x === 'string' ? safeParse(x) : x))
    .filter(Boolean)
    .reverse(); // oldest → newest
}

export async function rateOk(address) {
  const r = getRedis();
  if (!r) return true;
  const res = await r.set(`chatpepe:rl:${String(address).toLowerCase()}`, '1', { nx: true, px: RATE_MS });
  return res === 'OK' || res === true;
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

// Best-effort: does this wallet own a Rare Pepe (Emblem curated)? Non-blocking.
export async function isHolder(address) {
  const key = process.env.OPENSEA_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch(
      `https://api.opensea.io/api/v2/chain/ethereum/account/${address}/nfts?collection=rare-pepe-curated&limit=1`,
      { headers: { accept: 'application/json', 'x-api-key': key }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return false;
    const d = await res.json();
    return Array.isArray(d.nfts) && d.nfts.length > 0;
  } catch {
    return false;
  }
}
