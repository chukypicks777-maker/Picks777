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

export function parseDecimalOdds(val) {
  if (val == null) return NaN;
  if (typeof val === 'number') return val;
  const s = String(val).trim().replace(',', '.');
  return Number(s);
}

export function decimalToAmerican(decimalOdds) {
  const num = parseDecimalOdds(decimalOdds);
  if (!Number.isFinite(num) || num <= 1.0) return 'N/D';

  // 1.995 is shown as 2.00 in decimal: keep it +100 in American, never -101.
  if (num >= 1.995) {
    const am = Math.max(100, Math.round((num - 1) * 100));
    return `+${am}`;
  } else {
    const am = Math.round(-100 / (num - 1));
    return `${am}`;
  }
}

export function decimalToFraction(decimalOdds) {
  const num = parseDecimalOdds(decimalOdds);
  if (!Number.isFinite(num) || num <= 1.0) return 'N/D';

  const target = num - 1;

  const fraction = (n, d) => { const g = gcd(n, d); return `${n / g}/${d / g}`; };
  // 1) An exact simple fraction (denominator up to 20): 2.65 -> 33/20, 1.0625 -> 1/16.
  for (let d = 1; d <= 20; d++) {
    const n = Math.round(target * d);
    if (n > 0 && Math.abs(target - n / d) < 0.0005) return fraction(n, d);
  }
  // 2) Recurring thirds and sixths within the rounding of a 2-decimal feed:
  // 1.33 -> 1/3, 1.67 -> 2/3, 1.83 -> 5/6.
  for (const d of [3, 6]) {
    const n = Math.round(target * d);
    if (n > 0 && Math.abs(target - n / d) < 0.005) return fraction(n, d);
  }

  // Exact sports betting MCD / GCD reduction on base 100 cents (e.g. 2.50 -> 3/2, 1.50 -> 1/2, 5.00 -> 4/1)
  const n = Math.round(target * 100);
  const d = 100;
  const g = gcd(n, d);
  return `${n / g}/${d / g}`;
}

export function formatOdds(decimalOdds, format = 'decimal') {
  const raw = parseDecimalOdds(decimalOdds);
  if (!Number.isFinite(raw) || raw <= 1.0) return 'N/D';
  // No price below 1.01 exists (a 99.6%+ estimate would show 1.00, 0/1 or -24900).
  const num = Math.max(1.01, raw);

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
  const num = parseDecimalOdds(decimalOdds);
  if (isNaN(num) || num <= 1.0) return 0;
  return Math.round((1 / num) * 100);
}
// What a fair price looks like once a bookmaker adds its margin to a two-way
// market (the two implied probabilities add up to 100% + margin, split between
// both sides). Typical Mexican books charge 5-9%: a fair -158 (61.2%) shows as
// about -175 to -192.
export function priceWithMargin(probability, margin) {
  if (!(probability > 0 && probability < 100) || !(margin >= 0)) return null;
  return 1 / Math.min(0.99, probability / 100 + margin / 2);
}

// A fair price derived from a forecast is never a published bookmaker offer.
export function marketQuote(publishedOdds, probability) {
  const published = parseDecimalOdds(publishedOdds);
  if (Number.isFinite(published) && published > 1) return { odds: published, kind: 'published', label: 'Publicado' };
  if (typeof probability === 'number' && Number.isFinite(probability) && probability > 0 && probability < 100) {
    return { odds: 100 / probability, kind: 'theoretical', label: 'Teórico' };
  }
  return { odds: null, kind: 'unavailable', label: 'N/D' };
}
