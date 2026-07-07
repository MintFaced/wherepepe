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

    // Failure — recover the signer ourselves to see whether it's a signature
    // problem (wrong wallet) or an Emblem-side problem (deposit not indexed).
    let recovered = null;
    try { recovered = await recoverMessageAddress({ message: `Curated Minting: ${tid}`, signature: sig }); } catch { /* ignore */ }
    const creator = await vaultCreator(tid).catch(() => null);
    const signatureValid = recovered && creator && recovered.toLowerCase() === creator.toLowerCase();

    let error;
    if (signatureValid) {
      // Signature is correct — Emblem is refusing because it hasn't registered
      // the deposit yet (vault not live/sealed). This is on Emblem's side.
      error = 'Your signature is valid, but Emblem hasn’t registered your deposit yet — its indexer is still catching up, so it won’t authorize the mint. Nothing’s wrong on your end; try again in a little while.';
    } else if (r?.signedByCreator === false) {
      error = `This mint must be signed by the wallet that created the vault (${creator || 'unknown'}). Switch MetaMask’s active account to that wallet and retry.`;
    } else {
      error = r?.msg || r?.error || 'Mint authorization failed.';
    }
    console.error('[MovePepe] mint-sig failed:', JSON.stringify({ recovered, creator, signatureValid, r }).slice(0, 800));
    return NextResponse.json({ ok: false, error, diag: { recovered, creator, signatureValid, signedByCreator: r?.signedByCreator } }, { status: 200 });
  } catch (e) {
    console.error('[MovePepe] mint-sig error:', e?.message || e);
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
