import { memo, TTL } from './cache';
import { getRates } from './rates';

const TOKENSCAN = 'https://tokenscan.io/api/asset';
const CP = 'https://api.counterparty.io:4000/v2';

// Native (Counterparty / Bitcoin) market data for one asset, with the floor
// normalized to ETH. Native cards trade in BTC and/or XCP; we take the
// cheapest nonzero market and convert it to ETH.
export async function getNative(asset) {
  const key = String(asset || '').toUpperCase();
  const [market, holders, rates] = await Promise.all([
    getMarket(key),
    getHolders(key),
    getRates(),
  ]);

  const candidates = [];
  if (market.floorBtc > 0 && rates.btcEth) {
    candidates.push({ eth: market.floorBtc * rates.btcEth, ccy: 'BTC', amount: market.floorBtc });
  }
  if (market.floorXcp > 0 && rates.xcpEth) {
    candidates.push({ eth: market.floorXcp * rates.xcpEth, ccy: 'XCP', amount: market.floorXcp });
  }
  candidates.sort((a, b) => a.eth - b.eth);
  const best = candidates[0] || null;

  return {
    asset: key,
    supply: market.supply,
    floorEth: best ? best.eth : null,
    floorCcy: best ? best.ccy : null,     // which market set the floor
    floorAmount: best ? best.amount : null,
    floorBtc: market.floorBtc || null,
    floorXcp: market.floorXcp || null,
    estUsd: market.estUsd,
    holders,
    rates,
    ok: market.ok,
  };
}

async function getMarket(asset) {
  return memo(`market:${asset}`, TTL.MARKET, async () => {
    try {
      const res = await fetch(`${TOKENSCAN}/${encodeURIComponent(asset)}`, {
        headers: { 'user-agent': 'where-pepe/1.0', accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) throw new Error(`tokenscan ${res.status}`);
      const d = await res.json();
      return {
        supply: Number(d.supply) || 0,
        floorBtc: Number(d.market_info?.btc?.floor) || 0,
        floorXcp: Number(d.market_info?.xcp?.floor) || 0,
        estUsd: Number(d.estimated_value?.usd) || null,
        ok: true,
      };
    } catch (e) {
      return { supply: 0, floorBtc: 0, floorXcp: 0, estUsd: null, ok: false, error: String(e) };
    }
  });
}

// Number of distinct holding addresses (Counterparty). Used on detail pages
// and, later, as the base for the exact wrapped-vs-native address split.
async function getHolders(asset) {
  return memo(`holders:${asset}`, TTL.MARKET, async () => {
    try {
      const res = await fetch(
        `${CP}/assets/${encodeURIComponent(asset)}/balances?limit=1`,
        { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12000) },
      );
      if (!res.ok) throw new Error(`counterparty ${res.status}`);
      const d = await res.json();
      return Number.isFinite(d.result_count) ? d.result_count : null;
    } catch {
      return null;
    }
  });
}
