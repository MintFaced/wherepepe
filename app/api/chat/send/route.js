import { NextResponse } from 'next/server';
import { verifyToken, addMessage, rateOk, chatConfigured, findMessage, computeMentions, MAX_TEXT } from '../../../../lib/chat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Control chars (incl. newlines/tabs) collapsed to spaces.
const CONTROL = /[\u0000-\u001F\u007F]+/g;

export async function POST(request) {
  if (!chatConfigured()) {
    return NextResponse.json({ ok: false, error: 'chat-not-configured' }, { status: 503 });
  }
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 }); }
  const { token, text } = body || {};

  const session = verifyToken(token);
  if (!session) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  // Token-gated: must hold at least one Rare Pepe to post.
  if (!session.holder) {
    return NextResponse.json({ ok: false, error: 'holders-only' }, { status: 403 });
  }

  const clean = String(text || '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return NextResponse.json({ ok: false, error: 'empty' }, { status: 400 });
  if (clean.length > MAX_TEXT) return NextResponse.json({ ok: false, error: 'too long' }, { status: 400 });

  if (!(await rateOk(session.address))) {
    return NextResponse.json({ ok: false, error: 'slow down' }, { status: 429 });
  }

  // Reply: look up the parent so the quote can't be forged.
  let replyTo = null;
  if (body.replyId) {
    const parent = await findMessage(String(body.replyId));
    if (parent) replyTo = { id: parent.id, handle: parent.handle, text: String(parent.text || '').slice(0, 120) };
  }

  const mentions = clean.includes('@') ? await computeMentions(clean, session.address).catch(() => []) : [];

  const msg = await addMessage({
    address: session.address,
    text: clean,
    holder: session.holder,
    artist: session.artist,
    replyTo,
    mentions,
  });
  return NextResponse.json({ ok: true, message: msg });
}
