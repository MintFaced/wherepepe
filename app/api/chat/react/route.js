import { NextResponse } from 'next/server';
import { verifyToken, toggleReaction, chatConfigured } from '../../../../lib/chat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Toggle an emoji reaction on a message. Holders only (same gate as posting).
export async function POST(request) {
  if (!chatConfigured()) return NextResponse.json({ ok: false, error: 'chat-not-configured' }, { status: 503 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 }); }
  const session = verifyToken(body?.token);
  if (!session) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!session.holder) return NextResponse.json({ ok: false, error: 'holders-only' }, { status: 403 });
  const ok = await toggleReaction(String(body.msgId || ''), String(body.emoji || ''), session.address);
  if (!ok) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
