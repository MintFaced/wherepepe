import { NextResponse } from 'next/server';
import { hasEmblemKey, remoteMintSignature } from '../../../../lib/emblemVault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Returns the remote mint signature for buyWithSignedPrice. The browser then
// submits the on-chain tx with the user's wallet.
export async function POST(request) {
  if (!hasEmblemKey()) return NextResponse.json({ ok: false, configured: false }, { status: 503 });
  try {
    const { tokenId, signature } = await request.json();
    if (!tokenId || !signature) return NextResponse.json({ ok: false, error: 'tokenId and signature required' }, { status: 400 });
    const mintSig = await remoteMintSignature({ tokenId: String(tokenId), signature: String(signature) });
    return NextResponse.json({ ok: true, mintSig });
  } catch (e) {
    console.error('[MovePepe] mint-sig failed:', e?.message || e);
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
