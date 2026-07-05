import { NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { setArtist, getArtist, chatConfigured } from '../../../../../lib/chat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Admin: designate (or clear) an RP Artist wallet. Protected by CRON_SECRET.
//   curl -X POST /api/chat/admin/artist \
//     -H "authorization: Bearer $CRON_SECRET" \
//     -d '{"address":"0x…","name":"Mike"}'
// Send an empty/omitted name to remove the label.
function authed(request, body) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
  return body?.secret === secret || header === secret;
}

export async function POST(request) {
  if (!chatConfigured()) return NextResponse.json({ ok: false, error: 'chat-not-configured' }, { status: 503 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 }); }
  if (!authed(request, body)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const { address, name } = body || {};
  if (!isAddress(address)) return NextResponse.json({ ok: false, error: 'invalid address' }, { status: 400 });
  await setArtist(address, name || '');
  return NextResponse.json({ ok: true, address: String(address).toLowerCase(), artist: name || null });
}

export async function GET(request) {
  const address = new URL(request.url).searchParams.get('address');
  if (!address || !isAddress(address)) return NextResponse.json({ ok: false }, { status: 400 });
  return NextResponse.json({ ok: true, artist: await getArtist(address) });
}
