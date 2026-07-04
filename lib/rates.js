import { memo, TTL } from './cache';

const CG =
  'https://api.coingecko.com/api/v3/simple/price' +
  '?ids=bitcoin,ethereum,counterparty&vs_currencies=usd,eth';

// { btcEth, xcpEth, btcUsd, ethUsd, xcpUsd } — conversion factors, ETH-denominated.
export async function getRates() {
  return memo('rates', TTL.RATES, async () => {
    try {
      const res = await fetch(CG, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) throw new Error(`coingecko ${res.status}`);
      const d = await res.json();
      return {
        btcEth: num(d.bitcoin?.eth),
        xcpEth: num(d.counterparty?.eth),
        btcUsd: num(d.bitcoin?.usd),
        ethUsd: num(d.ethereum?.usd),
        xcpUsd: num(d.counterparty?.usd),
        ok: true,
      };
    } catch (e) {
      return {
        btcEth: null, xcpEth: null, btcUsd: null, ethUsd: null, xcpUsd: null,
        ok: false, error: String(e),
      };
    }
  });
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
