import crypto from 'crypto';
import { getRedis, redisConfigured } from './redis';

// ─── ChatPepe backend ─────────────────────────────────────────────────────
// Wallet-gated global chat. Messages live in Redis (Vercel KV / Upstash);
// identities are derived deterministically from the wallet address; sessions
// are stateless HMAC tokens issued after a one-time signature.

const KEY = 'chatpepe:messages';
const MAX_MESSAGES = 200;
const RATE_MS = 1500;         // min gap between a wallet's messages
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_TEXT = 280;

export const chatConfigured = redisConfigured;

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
export function issueToken(address, holder, artist) {
  const payload = { a: String(address).toLowerCase(), h: holder ? 1 : 0, exp: Date.now() + SESSION_MS };
  if (artist) payload.ar = String(artist).slice(0, 40);
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
    return { address: payload.a, holder: Boolean(payload.h), artist: payload.ar || null };
  } catch {
    return null;
  }
}

// ── RP Artist allowlist (admin-managed) ──────────────────────────────────
const ARTISTS_KEY = 'chatpepe:artists'; // hash: address -> artist name
export async function getArtist(address) {
  const r = getRedis();
  if (!r) return null;
  try { return (await r.hget(ARTISTS_KEY, String(address).toLowerCase())) || null; } catch { return null; }
}
export async function setArtist(address, name) {
  const r = getRedis();
  if (!r) throw new Error('chat not configured');
  const addr = String(address).toLowerCase();
  if (name) await r.hset(ARTISTS_KEY, { [addr]: String(name).slice(0, 40) });
  else await r.hdel(ARTISTS_KEY, addr);
}

// ── Messages ─────────────────────────────────────────────────────────────
export async function addMessage({ address, text, holder, artist, replyTo }) {
  const r = getRedis();
  if (!r) throw new Error('chat not configured');
  const id = crypto.randomBytes(8).toString('hex');
  const ident = identityFor(address);
  const profile = await getProfile(address);
  const msg = {
    id,
    address: ident.address,
    handle: profile?.handle || ident.handle,
    avatar: ident.avatar,
    pfp: profile?.pfpImage || null,
    holder: Boolean(holder),
    artist: artist || null,
    replyTo: replyTo || null,
    text,
    ts: Date.now(),
  };
  await r.lpush(KEY, JSON.stringify(msg));
  await r.ltrim(KEY, 0, MAX_MESSAGES - 1);
  return msg;
}

// Find a message by id in the recent list (for validating replies).
export async function findMessage(id) {
  const r = getRedis();
  if (!r || !id) return null;
  try {
    const items = await r.lrange(KEY, 0, MAX_MESSAGES - 1);
    for (const x of items) {
      const m = typeof x === 'string' ? safeParse(x) : x;
      if (m && m.id === id) return m;
    }
  } catch {}
  return null;
}

// ── Profiles (custom handle + PFP) ───────────────────────────────────────
const HANDLE_RE = /[\u0000-\u001F\u007F]/g;

export function validateHandle(raw) {
  const clean = String(raw || '').replace(HANDLE_RE, '').replace(/\s+/g, ' ').trim();
  if (clean.length < 2 || clean.length > 24) return null;
  return clean;
}

export async function getProfile(address) {
  const r = getRedis();
  if (!r) return null;
  try {
    const raw = await r.get(`chatpepe:profile:${String(address).toLowerCase()}`);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

export async function setProfile(address, profile) {
  const r = getRedis();
  if (!r) throw new Error('chat not configured');
  await r.set(`chatpepe:profile:${String(address).toLowerCase()}`, JSON.stringify(profile));
  return profile;
}

// The Rare Pepes a wallet owns (for the PFP picker), via OpenSea.
export async function ownedPepes(address) {
  const key = process.env.OPENSEA_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(
      `https://api.opensea.io/api/v2/chain/ethereum/account/${address}/nfts?collection=rare-pepe-curated&limit=50`,
      { headers: { accept: 'application/json', 'x-api-key': key }, signal: AbortSignal.timeout(9000) },
    );
    if (!res.ok) return [];
    const d = await res.json();
    const seen = new Set();
    const out = [];
    for (const n of d.nfts || []) {
      const asset = String(n.name || '').split('|')[0].trim().toUpperCase();
      if (!/^[A-Z0-9._-]{1,40}$/.test(asset) || seen.has(asset)) continue;
      seen.add(asset);
      out.push({ asset, image: n.image_url || n.display_image_url || null });
    }
    return out;
  } catch {
    return [];
  }
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

// Does this wallet own a Rare Pepe (Emblem "rare-pepe-curated" collection)?
// Gates posting, so it retries once to avoid false negatives on a transient
// error — but ultimately fails closed (no key / repeated error → not a holder).
export async function isHolder(address) {
  const key = process.env.OPENSEA_API_KEY;
  if (!key) return false;
  const url = `https://api.opensea.io/api/v2/chain/ethereum/account/${address}/nfts?collection=rare-pepe-curated&limit=1`;
  for (let i = 0; i < 2; i++) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json', 'x-api-key': key }, signal: AbortSignal.timeout(9000) });
      if (res.ok) {
        const d = await res.json();
        return Array.isArray(d.nfts) && d.nfts.length > 0;
      }
      if (res.status !== 429 && res.status < 500) return false; // definitive: not rate-limit/transient
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
