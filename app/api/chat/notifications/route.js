import { NextResponse } from 'next/server';
import { verifyToken, getUnreadMentions, chatConfigured } from '../../../../lib/chat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Unread @-mention count for the header notification dot.
export async function GET(request) {
  if (!chatConfigured()) return NextResponse.json({ ok: false, unread: 0 });
  const session = verifyToken(new URL(request.url).searchParams.get('token'));
  if (!session) return NextResponse.json({ ok: false, unread: 0 });
  const unread = await getUnreadMentions(session.address).catch(() => 0);
  return NextResponse.json({ ok: true, unread });
}
