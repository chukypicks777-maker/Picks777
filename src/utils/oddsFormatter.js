// Odds Conversion Utility (Decimal, American, Fractional)

export function gcd(a, b) {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function parseOddsInput(val) {
  if (val == null) return NaN;
  if (typeof val === 'number') return val;
  const s = String(val).trim().replace(',', '.');
  return Number(s);
}

export function decimalToAmerican(decimalOdds) {
  const num = parseOddsInput(decimalOdds);
  if (!Number.isFinite(num) || num <= 1.0) return 'N/D';

  if (num >= 2.0) {
    const am = Math.round((num - 1) * 100);
    return `+${am}`;
  } else {
    const am = Math.round(-100 / (num - 1));
    return `${am}`;
  }
}

export function decimalToFraction(decimalOdds) {
  const num = parseOddsInput(decimalOdds);
  if (!Number.isFinite(num) || num <= 1.0) return 'N/D';

  const target = num - 1;

  // Recurring betting fractions (thirds and sixths) with small tolerance (0.005)
  // for standard 2-decimal rounded feeds (e.g. 1.33 -> 1/3, 1.67 -> 2/3, 1.83 -> 5/6, 1.17 -> 1/6)
  for (const d of [3, 6]) {
    const n = Math.round(target * d);
    if (n <= 0) continue;
    const diff = Math.abs(target - n / d);
    if (diff < 0.005) {
      const g = gcd(n, d);
      return `${n / g}/${d / g}`;
    }
  }

  // Exact sports betting MCD / GCD reduction on base 100 cents (e.g. 2.50 -> 3/2, 1.50 -> 1/2, 5.00 -> 4/1)
  const n = Math.round(target * 100);
  const d = 100;
  const g = gcd(n, d);
  return `${n / g}/${d / g}`;
}

export function formatOdds(decimalOdds, format = 'decimal') {
  const num = parseOddsInput(decimalOdds);
  if (!Number.isFinite(num) || num <= 1.0) return 'N/D';

  const fmt = (format || 'decimal').toLowerCase();

  if (fmt === 'american' || fmt === 'americano' || fmt === 'us') {
    return decimalToAmerican(num);
  }
  if (fmt === 'fractional' || fmt === 'fraccionario' || fmt === 'fraction') {
    return decimalToFraction(num);
  }
  return num.toFixed(2);
}

export function oddsToProbability(decimalOdds) {
  const num = parseFloat(decimalOdds);
  if (isNaN(num) || num <= 1.0) return 0;
  return Math.round((1 / num) * 100);
}
