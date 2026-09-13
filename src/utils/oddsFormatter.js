// Odds Conversion Utility (Decimal, American, Fractional)

export function formatOdds(decimalOdds, format = 'decimal') {
  const num = Number(decimalOdds);
  if (!Number.isFinite(num) || num <= 1.0) return 'N/D';

  switch (format) {
    case 'american': {
      if (num >= 2.0) {
        const am = Math.round((num - 1) * 100);
        return `+${am}`;
      } else {
        const am = Math.round(-100 / (num - 1));
        return `${am}`;
      }
    }
    case 'fractional': {
      // Find approximate fraction
      const tolerance = 1.0E-3;
      let h1 = 1, h2 = 0, k1 = 0, k2 = 1;
      let b = num - 1;
      do {
        const a = Math.floor(b);
        let aux = h1;
        h1 = a * h1 + h2;
        h2 = aux;
        aux = k1;
        k1 = a * k1 + k2;
        k2 = aux;
        b = 1 / (b - a);
      } while (Math.abs((num - 1) - h1 / k1) > (num - 1) * tolerance && k1 < 100);

      return `${h1}/${k1}`;
    }
    case 'decimal':
    default:
      return num.toFixed(2);
  }
}

export function oddsToProbability(decimalOdds) {
  const num = parseFloat(decimalOdds);
  if (isNaN(num) || num <= 1.0) return 0;
  return Math.round((1 / num) * 100);
}
