import { NextResponse } from 'next/server';
import { listMessages, chatConfigured, verifyToken, touchPresence } from '../../../../lib/chat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Recent messages (oldest → newest) + presence. A poll with a valid token marks
// that wallet online; every poll returns the current online count.
export async function GET(request) {
  if (!chatConfigured()) {
    return NextResponse.json({ ok: false, configured: false, messages: [], online: 0 }, { status: 200 });
  }
  const url = new URL(request.url);
  const since = Number(url.searchParams.get('since') || 0);
  const session = verifyToken(url.searchParams.get('token'));
  try {
    const [messagesAll, online] = await Promise.all([
      listMessages(),
      touchPresence(session?.address || null),
    ]);
    const messages = since > 0 ? messagesAll.filter((m) => m.ts > since) : messagesAll;
    return NextResponse.json({ ok: true, configured: true, messages, online });
  } catch (e) {
    return NextResponse.json({ ok: false, configured: true, messages: [], online: 0, error: String(e) }, { status: 200 });
  }
}
