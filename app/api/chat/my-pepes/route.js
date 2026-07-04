import { NextResponse } from 'next/server';
import { verifyToken, ownedPepes, chatConfigured } from '../../../../lib/chat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The Rare Pepes the connected wallet owns — used to pick a PFP.
export async function GET(request) {
  if (!chatConfigured()) return NextResponse.json({ ok: false, pepes: [] }, { status: 503 });
  const session = verifyToken(new URL(request.url).searchParams.get('token'));
  if (!session) return NextResponse.json({ ok: false, error: 'unauthorized', pepes: [] }, { status: 401 });
  const pepes = await ownedPepes(session.address).catch(() => []);
  return NextResponse.json({ ok: true, pepes });
}
