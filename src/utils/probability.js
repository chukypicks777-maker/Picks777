export const validNumber = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
export const percent = n => validNumber(n) && n <= 100 ? Math.round(n) : null;
export const complement = n => percent(n) === null ? null : 100 - percent(n);
export const displayNumber = (n, digits = 1) => validNumber(n) ? Number(n.toFixed(digits)).toString() : 'N/D';

export function poissonProbability(lambda, k) {
  if (!validNumber(lambda) || !Number.isInteger(k) || k < 0) return 0;
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}
export function poissonCumulative(lambda, maxK) {
  if (!validNumber(lambda)) return null;
  let sum = 0;
  for (let k = 0; k <= maxK; k++) sum += poissonProbability(lambda, k);
  return Math.min(1, Math.max(0, sum));
}
export function totalLines(lambda, lines = [0.5, 1.5, 2.5, 3.5, 4.5]) {
  return Object.fromEntries(lines.flatMap(line => {
    const over = validNumber(lambda) ? Math.round((1 - poissonCumulative(lambda, Math.floor(line))) * 100) : null;
    const key = String(line).replace('.', '');
    return [[`over${key}`, over], [`under${key}`, complement(over)]];
  }));
}

export function scoreSimulation(match) {
  const distribution = match?.model?.scoreDistribution;
  if (!distribution?.length) return {};
  const entries = distribution.map(s => [s.score, s.probability]);
  entries.push(['Otros', Math.max(0, 100 - entries.reduce((n, [, p]) => n + p, 0))]);
  return roundDistribution(Object.fromEntries(entries), 1);
}

// Largest remainders preserve 100% after presentation rounding.
export function roundDistribution(values, digits = 0) {
  const entries = Object.entries(values);
  if (!entries.length || entries.some(([, n]) => !validNumber(n)) || Math.abs(entries.reduce((s, [, n]) => s + n, 0) - 100) > 0.01) return values;
  const factor = 10 ** digits;
  const parts = entries.map(([key, n]) => ({ key, floor: Math.floor(n * factor), remainder: n * factor - Math.floor(n * factor) }));
  const remaining = 100 * factor - parts.reduce((s, p) => s + p.floor, 0);
  const order = [...parts].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < remaining; i++) order[i % order.length].floor++;
  return Object.fromEntries(parts.map(p => [p.key, p.floor / factor]));
}
