import { NextResponse } from 'next/server';
import { verifyToken, getNotifications, chatConfigured } from '../../../../lib/chat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Header notifications: unread @-mentions + new posts since last visit.
export async function GET(request) {
  if (!chatConfigured()) return NextResponse.json({ ok: false, unread: 0, newPosts: 0 });
  const session = verifyToken(new URL(request.url).searchParams.get('token'));
  if (!session) return NextResponse.json({ ok: false, unread: 0, newPosts: 0 });
  const { mentions, newPosts } = await getNotifications(session.address).catch(() => ({ mentions: 0, newPosts: 0 }));
  return NextResponse.json({ ok: true, unread: mentions, newPosts });
}
