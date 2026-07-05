import crypto from 'crypto';
import { getRedis, redisConfigured } from './redis';
import { getWalletVaults } from './emblem';

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
export async function addMessage({ address, text, holder, artist, replyTo, mentions }) {
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
    mentions: Array.isArray(mentions) ? mentions : [],
    text,
    ts: Date.now(),
  };
  await r.lpush(KEY, JSON.stringify(msg));
  await r.ltrim(KEY, 0, MAX_MESSAGES - 1);
  return msg;
}

// Which chatters does this text @-mention? Maps @handle → address using the
// handles of recent participants (longest-match wins for multi-word handles).
export async function computeMentions(text, excludeAddress) {
  const msgs = await listMessages();
  const handleToAddr = new Map();
  for (const m of msgs) if (m.handle && m.address) handleToAddr.set(m.handle, m.address);
  const handles = [...handleToAddr.keys()].sort((a, b) => b.length - a.length);
  const found = new Set();
  for (const h of handles) {
    if (String(text).includes('@' + h)) {
      const addr = handleToAddr.get(h);
      if (addr && addr !== excludeAddress) found.add(addr);
    }
  }
  return [...found];
}

// Delete a message (own, or admin). Rebuilds the list without it.
export async function deleteMessage(msgId, address, isAdmin = false) {
  const r = getRedis();
  if (!r) return false;
  const items = await r.lrange(KEY, 0, MAX_MESSAGES - 1);
  const parsed = items.map((x) => (typeof x === 'string' ? safeParse(x) : x)).filter(Boolean);
  const idx = parsed.findIndex((m) => m.id === msgId && (isAdmin || m.address === String(address).toLowerCase()));
  if (idx < 0) return false;
  const kept = parsed.filter((_, i) => i !== idx);
  await r.del(KEY);
  if (kept.length) await r.rpush(KEY, ...kept.map((m) => JSON.stringify(m)));
  return true;
}

// Mention notifications: mark the chat "seen" for a wallet, and count unread @s.
export async function markSeen(address) {
  const r = getRedis();
  if (!r || !address) return;
  try { await r.set(`chatpepe:seen:${String(address).toLowerCase()}`, Date.now()); } catch {}
}
export async function getNotifications(address) {
  const r = getRedis();
  if (!r) return { mentions: 0, newPosts: 0 };
  const addr = String(address).toLowerCase();
  try {
    const seen = Number(await r.get(`chatpepe:seen:${addr}`)) || 0;
    const msgs = await listMessages();
    let mentions = 0, newPosts = 0;
    for (const m of msgs) {
      if (m.ts <= seen) continue;
      if (m.address !== addr) newPosts += 1; // don't count your own posts
      if (Array.isArray(m.mentions) && m.mentions.includes(addr)) mentions += 1;
    }
    return { mentions, newPosts };
  } catch {
    return { mentions: 0, newPosts: 0 };
  }
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

// The Rare Pepes a wallet owns (for the PFP picker), from Emblem vaults.
export async function ownedPepes(address) {
  try {
    const v = await getWalletVaults(address);
    const seen = new Set();
    const out = [];
    for (const c of v.rarePepe) {
      if (seen.has(c.asset)) continue;
      seen.add(c.asset);
      out.push({ asset: c.asset, image: c.image });
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

// Loose BTC-address validation for the linked "free wallet". Returns the
// address (valid), '' (clear it), or null (invalid).
export function validateBtcAddress(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^(1|3)[a-km-zA-HJ-NP-Z1-9]{24,34}$/.test(s) || /^bc1[a-z0-9]{20,80}$/.test(s)) return s;
  return null;
}

// ── Reactions ────────────────────────────────────────────────────────────
export const REACTIONS = ['🐸', '🔥', '💎', '🚀', '😂', '💚', '👀', '🙌', '😭', '💀'];
const REACT_KEY = 'chatpepe:reactions'; // hash: `${msgId}:${emoji}` -> JSON array of addresses

export async function toggleReaction(msgId, emoji, address) {
  const r = getRedis();
  if (!r || !REACTIONS.includes(emoji) || !/^[a-f0-9]{8,32}$/.test(String(msgId))) return false;
  const field = `${msgId}:${emoji}`;
  const a = String(address).toLowerCase();
  const raw = await r.hget(REACT_KEY, field);
  let arr = raw ? (typeof raw === 'string' ? safeParse(raw) : raw) : [];
  if (!Array.isArray(arr)) arr = [];
  arr = arr.includes(a) ? arr.filter((x) => x !== a) : [...arr, a];
  if (arr.length) await r.hset(REACT_KEY, { [field]: JSON.stringify(arr) });
  else await r.hdel(REACT_KEY, field);
  return true;
}

export async function getAllReactions() {
  const r = getRedis();
  if (!r) return {};
  try { return (await r.hgetall(REACT_KEY)) || {}; } catch { return {}; }
}

// Presence: a wallet counts as "online" for 30s after its last poll.
const ONLINE_KEY = 'chatpepe:online';
const ONLINE_WINDOW_MS = 30_000;
export async function touchPresence(address) {
  const r = getRedis();
  if (!r) return 0;
  const now = Date.now();
  try {
    if (address) await r.zadd(ONLINE_KEY, { score: now, member: String(address).toLowerCase() });
    await r.zremrangebyscore(ONLINE_KEY, 0, now - ONLINE_WINDOW_MS);
    const n = await r.zcard(ONLINE_KEY);
    return typeof n === 'number' ? n : 0;
  } catch {
    return 0;
  }
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

// Does this wallet hold a Rare Pepe? Gates posting — checked via Emblem vaults
// (keyless, authoritative). Fails closed on error.
export async function isHolder(address) {
  try {
    const v = await getWalletVaults(address);
    return v.rarePepe.length > 0;
  } catch {
    return false;
  }
}
