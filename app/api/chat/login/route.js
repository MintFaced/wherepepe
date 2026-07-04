import { NextResponse } from 'next/server';
import { verifyMessage, isAddress } from 'viem';
import { chatConfigured, identityFor, issueToken, isHolder } from '../../../../lib/chat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Verify a one-time wallet signature and issue a stateless session token.
export async function POST(request) {
  if (!chatConfigured()) {
    return NextResponse.json({ ok: false, error: 'chat-not-configured' }, { status: 503 });
  }
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 }); }
  const { address, message, signature } = body || {};

  if (!isAddress(address) || typeof message !== 'string' || typeof signature !== 'string') {
    return NextResponse.json({ ok: false, error: 'missing fields' }, { status: 400 });
  }

  // The signed message must reference this wallet + a recent nonce (anti-replay).
  const nonce = Number((message.match(/Nonce:\s*(\d+)/) || [])[1] || 0);
  const referencesAddr = message.toLowerCase().includes(address.toLowerCase());
  if (!referencesAddr || !nonce || Math.abs(Date.now() - nonce) > 5 * 60 * 1000) {
    return NextResponse.json({ ok: false, error: 'stale or invalid message' }, { status: 400 });
  }

  let valid = false;
  try { valid = await verifyMessage({ address, message, signature }); } catch { valid = false; }
  if (!valid) return NextResponse.json({ ok: false, error: 'bad signature' }, { status: 401 });

  const holder = await isHolder(address).catch(() => false);
  const identity = identityFor(address);
  const token = issueToken(address, holder);
  return NextResponse.json({ ok: true, token, identity: { ...identity, holder } });
}
