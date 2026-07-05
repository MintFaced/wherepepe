import { NextResponse } from 'next/server';
import { listMessages, chatConfigured, verifyToken, touchPresence, getAllReactions } from '../../../../lib/chat';

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
    const [messagesAll, online, reactions] = await Promise.all([
      listMessages(),
      touchPresence(session?.address || null),
      getAllReactions(),
    ]);

    // Group reactions by message id: `${msgId}:${emoji}` -> [addresses]
    const byMsg = {};
    for (const [field, val] of Object.entries(reactions)) {
      const idx = field.indexOf(':');
      if (idx < 0) continue;
      const mid = field.slice(0, idx);
      const emoji = field.slice(idx + 1);
      const arr = typeof val === 'string' ? (JSON.parse(val) || []) : (val || []);
      (byMsg[mid] ||= []).push({ emoji, count: arr.length, mine: session ? arr.includes(session.address) : false });
    }

    const withReactions = messagesAll.map((m) => ({ ...m, reactions: byMsg[m.id] || [] }));
    const messages = since > 0 ? withReactions.filter((m) => m.ts > since) : withReactions;
    return NextResponse.json({ ok: true, configured: true, messages, online });
  } catch (e) {
    return NextResponse.json({ ok: false, configured: true, messages: [], online: 0, error: String(e) }, { status: 200 });
  }
}
