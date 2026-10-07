import { roundDistribution } from '../../src/utils/probability.js';

const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const variance = values => values.length > 1
  ? values.reduce((sum, value) => sum + (value - average(values)) ** 2, 0) / (values.length - 1) : 0;

// Matchup moments: equally weight own scoring and the opponent's runs allowed.
// Count variation and uncertainty in the estimated mean both enter prediction.
export function countForecast(scoring = [], allowed = [], sharedCount = 0) {
  if ([scoring, allowed].some(values => values.length < 5 || values.some(value => !Number.isInteger(value) || value < 0 || value > 40))) return null;
  if (!Number.isInteger(sharedCount) || sharedCount < 0 || sharedCount > Math.min(scoring.length, allowed.length)) return null;
  const rate = (average(scoring) + average(allowed)) / 2;
  if (rate <= 0) return null; // All-zero short histories do not prove a 100% under.
  const observedVariance = (variance(scoring) + variance(allowed)) / 2;
  const processVariance = Math.max(rate, observedVariance);
  const scoringVariance = Math.max(average(scoring), variance(scoring));
  const allowedVariance = Math.max(average(allowed), variance(allowed));
  // A common head-to-head is one observation, even though it appears in both
  // histories. Include its covariance instead of claiming two independent games.
  const meanVariance = scoringVariance / scoring.length / 4 + allowedVariance / allowed.length / 4
    + sharedCount * Math.sqrt(scoringVariance * allowedVariance) / (2 * scoring.length * allowed.length);
  const predictiveVariance = processVariance + meanVariance;
  const shape = rate ** 2 / (predictiveVariance - rate);
  const success = shape / (shape + rate);
  // Negative binomial: variance = mean + mean² / shape. Do not trim its tail
  // and silently redistribute that mass into apparently certain outcomes.
  const mass = [Math.exp(shape * Math.log(success))];
  let cumulative = mass[0];
  for (let k = 1; k <= 2048 && cumulative < 1 - 1e-12; k++) {
    mass.push(mass[k - 1] * (k - 1 + shape) / k * (1 - success));
    cumulative += mass[k];
  }
  if (cumulative < 1 - 1e-8 || !mass.every(Number.isFinite)) return null;
  return { mean: rate, variance: predictiveVariance, observedVariance, shape, mass, sampleSize: { scoring: scoring.length, allowed: allowed.length } };
}

export function countLines(distribution, lines) {
  return lines.map(line => {
    if (!distribution) return { line, over: null, under: null };
    const under = distribution.mass.slice(0, Math.floor(line) + 1).reduce((sum, value) => sum + value, 0);
    const values = roundDistribution({ over: Math.max(0, 1 - under) * 100, under: Math.min(1, under) * 100 }, 1);
    return { line, ...values };
  });
}

export function combinedCount(home, away) {
  if (!home || !away) return null;
  // Only the lower tail is needed for the displayed totals (up to 9.5).
  const mass = Array.from({ length: 10 }, (_, total) => {
    let probability = 0;
    for (let h = 0; h <= total; h++) probability += (home.mass[h] || 0) * (away.mass[total - h] || 0);
    return probability;
  });
  return { mean: home.mean + away.mean, variance: home.variance + away.variance, mass };
}

export function countResult(home, away) {
  if (!home || !away) return { home: null, draw: null, away: null };
  let homeWin = 0, awayWin = 0, draw = 0, homeCumulative = 0, awayCumulative = 0;
  for (let k = 0; k < Math.max(home.mass.length, away.mass.length); k++) {
    const h = home.mass[k] || 0, a = away.mass[k] || 0;
    homeWin += h * awayCumulative;
    awayWin += a * homeCumulative;
    draw += h * a;
    homeCumulative += h; awayCumulative += a;
  }
  const total = homeWin + awayWin + draw;
  return roundDistribution({ home: homeWin / total * 100, draw: draw / total * 100, away: awayWin / total * 100 }, 1);
}
