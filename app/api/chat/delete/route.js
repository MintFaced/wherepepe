import { NextResponse } from 'next/server';
import { verifyToken, deleteMessage, chatConfigured } from '../../../../lib/chat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Delete your own message.
export async function POST(request) {
  if (!chatConfigured()) return NextResponse.json({ ok: false, error: 'chat-not-configured' }, { status: 503 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 }); }
  const session = verifyToken(body?.token);
  if (!session) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const ok = await deleteMessage(String(body.msgId || ''), session.address);
  if (!ok) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
