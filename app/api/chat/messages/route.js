import { NextResponse } from 'next/server';
import { listMessages, chatConfigured } from '../../../../lib/chat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Recent messages (oldest → newest). Optional ?since=<ts> for incremental polls.
export async function GET(request) {
  if (!chatConfigured()) {
    return NextResponse.json({ ok: false, configured: false, messages: [] }, { status: 200 });
  }
  const since = Number(new URL(request.url).searchParams.get('since') || 0);
  try {
    let messages = await listMessages();
    if (since > 0) messages = messages.filter((m) => m.ts > since);
    return NextResponse.json({ ok: true, configured: true, messages });
  } catch (e) {
    return NextResponse.json({ ok: false, configured: true, messages: [], error: String(e) }, { status: 200 });
  }
}
