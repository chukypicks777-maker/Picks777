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

export function decimalToAmerican(decimalOdds) {
  const num = Number(decimalOdds);
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
  const num = Number(decimalOdds);
  if (!Number.isFinite(num) || num <= 1.0) return 'N/D';

  const target = num - 1;

  // Check common betting denominators (up to 20) with small tolerance (0.005)
  // to prioritize standard betting fractions (e.g. 1.33 -> 1/3, 1.67 -> 2/3, 1.83 -> 5/6, 1.17 -> 1/6)
  const standardDenominators = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 20];
  let bestFraction = null;
  let minDiff = 0.005;

  for (const d of standardDenominators) {
    const n = Math.round(target * d);
    if (n <= 0) continue;
    const diff = Math.abs(target - n / d);
    if (diff < minDiff) {
      const g = gcd(n, d);
      bestFraction = `${n / g}/${d / g}`;
      minDiff = diff;
      if (diff === 0) break;
    }
  }

  if (bestFraction) return bestFraction;

  // General fallback using GCD of cents (e.g. 1.01 -> 1/100, 1.03 -> 3/100)
  const n = Math.round(target * 100);
  const d = 100;
  const g = gcd(n, d);
  return `${n / g}/${d / g}`;
}

export function formatOdds(decimalOdds, format = 'decimal') {
  const num = Number(decimalOdds);
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
