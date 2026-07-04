import { NextResponse } from 'next/server';
import { verifyToken, getProfile, setProfile, validateHandle, identityFor, chatConfigured } from '../../../../lib/chat';
import { getCardMeta } from '../../../../lib/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function shape(address, holder, profile) {
  const ident = identityFor(address);
  return {
    ...ident,
    holder,
    handle: profile?.handle || ident.handle,
    pfp: profile?.pfpImage || null,
    pfpAsset: profile?.pfpAsset || null,
    customHandle: Boolean(profile?.handle),
  };
}

export async function GET(request) {
  if (!chatConfigured()) return NextResponse.json({ ok: false, error: 'chat-not-configured' }, { status: 503 });
  const session = verifyToken(new URL(request.url).searchParams.get('token'));
  if (!session) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const profile = await getProfile(session.address);
  return NextResponse.json({ ok: true, identity: shape(session.address, session.holder, profile) });
}

export async function POST(request) {
  if (!chatConfigured()) return NextResponse.json({ ok: false, error: 'chat-not-configured' }, { status: 503 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 }); }
  const session = verifyToken(body?.token);
  if (!session) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const merged = (await getProfile(session.address)) || {};

  if ('handle' in body) {
    if (body.handle === null || String(body.handle).trim() === '') {
      delete merged.handle; // reset to the auto-assigned handle
    } else {
      const h = validateHandle(body.handle);
      if (!h) return NextResponse.json({ ok: false, error: 'Handle must be 2–24 characters.' }, { status: 400 });
      merged.handle = h;
    }
  }

  if ('pfpAsset' in body) {
    if (!body.pfpAsset) {
      delete merged.pfpAsset; delete merged.pfpImage; // reset to gradient
    } else {
      const key = String(body.pfpAsset).toUpperCase();
      const meta = await getCardMeta(key).catch(() => null);
      if (!meta) return NextResponse.json({ ok: false, error: 'Unknown Rare Pepe.' }, { status: 400 });
      merged.pfpAsset = meta.asset;
      merged.pfpImage = meta.image || meta.media || null;
    }
  }

  await setProfile(session.address, merged);
  return NextResponse.json({ ok: true, identity: shape(session.address, session.holder, merged) });
}
