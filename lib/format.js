// Display formatters. Ξ = ETH, ₿ = BTC.

export function fmtEth(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  if (v === 0) return '0 Ξ';
  if (v < 0.0001) return '<0.0001 Ξ';
  if (v < 1) return `${trim(v, 4)} Ξ`;
  if (v < 1000) return `${trim(v, 3)} Ξ`;
  return `${Math.round(v).toLocaleString('en-US')} Ξ`;
}

export function fmtBtc(v) {
  if (v == null || !Number.isFinite(v) || v === 0) return '—';
  return `${trim(v, 8)} ₿`;
}

export function fmtXcp(v) {
  if (v == null || !Number.isFinite(v) || v === 0) return '—';
  return `${trim(v, 4)} XCP`;
}

export function fmtUsd(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: v < 1 ? 4 : 0,
  });
}

export function fmtInt(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  return Number(v).toLocaleString('en-US');
}

export function fmtSupply(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  // Rare Pepes are whole-unit; currency-like assets (PEPECASH) are fractional.
  return Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function fmtPct(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  if (v > 0 && v < 0.1) return '<0.1%';
  return `${trim(v, 1)}%`;
}

function trim(v, dp) {
  return parseFloat(Number(v).toFixed(dp)).toString();
}
