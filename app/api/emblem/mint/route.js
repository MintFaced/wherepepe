import { NextResponse } from 'next/server';
import { recoverMessageAddress } from 'viem';
import { hasEmblemKey, remoteMintSignature, vaultCreator } from '../../../../lib/emblemVault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Authorizes the on-chain mint. Returns the remote mint signature (buyWithQuote)
// for the browser to submit. On failure, returns diagnostics: the address our
// own recovery derives from the signature, vs. the vault's recorded creator.
export async function POST(request) {
  if (!hasEmblemKey()) return NextResponse.json({ ok: false, configured: false }, { status: 503 });
  try {
    const { tokenId, signature } = await request.json();
    if (!tokenId || !signature) return NextResponse.json({ ok: false, error: 'tokenId and signature required' }, { status: 400 });
    const tid = String(tokenId);
    const sig = String(signature);

    const r = await remoteMintSignature({ tokenId: tid, signature: sig });
    const mintSig = r?.data || r;

    // Success = we got the signed-price fields back.
    if (mintSig && mintSig._signature && mintSig._nftAddress) {
      return NextResponse.json({ ok: true, mintSig });
    }

    // Failure — build a diagnostic so we can see WHY.
    let recovered = null;
    try { recovered = await recoverMessageAddress({ message: `Curated Minting: ${tid}`, signature: sig }); } catch { /* ignore */ }
    const creator = await vaultCreator(tid).catch(() => null);
    const error = r?.signedByCreator === false
      ? 'Mint must be signed by the same wallet that created the vault.'
      : (r?.msg || r?.error || 'Mint authorization failed.');
    console.error('[MovePepe] mint-sig failed:', JSON.stringify({ recovered, creator, r }).slice(0, 800));
    return NextResponse.json({ ok: false, error, diag: { recovered, creator, signedByCreator: r?.signedByCreator, msg: r?.msg || r?.error } }, { status: 200 });
  } catch (e) {
    console.error('[MovePepe] mint-sig error:', e?.message || e);
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
