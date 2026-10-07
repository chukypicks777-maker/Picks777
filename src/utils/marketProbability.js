import { parseDecimalOdds } from './oddsFormatter.js';

// One complete, mutually exclusive market from a single quote snapshot.
export function noVigMarket(odds, keys) {
  const prices = keys.map(key => parseDecimalOdds(odds?.[key]));
  if (prices.some(price => !Number.isFinite(price) || price <= 1)) return null;
  const mass = prices.reduce((sum, price) => sum + 1 / price, 0);
  return { probabilities: Object.fromEntries(keys.map((key, i) => [key, 100 / prices[i] / mass])),
    overround: (mass - 1) * 100 };
}

export function footballProbabilitySource(match, key = 'homeWin') {
  const source = match?.model?.probabilitySources?.[key] || match?.probabilitySources?.[key];
  if (source && source !== 'unavailable') return source;
  const keys = ['homeWin', 'draw', 'awayWin'].includes(key) ? ['homeWin', 'draw', 'awayWin']
    : ['over25', 'under25'].includes(key) ? ['over25', 'under25']
      : ['bttsYes', 'bttsNo'].includes(key) ? ['bttsYes', 'bttsNo'] : [];
  if (keys.length && noVigMarket(match?.odds, keys)) return 'published-odds';
  return match?.model ? 'experimental-model' : 'unavailable';
}

export function footballProbabilityLabel(match, key = 'homeWin') {
  const source = footballProbabilitySource(match, key);
  return source === 'published-odds'
    ? `Mercado sin margen${match?.oddsProvider ? ` · ${match.oddsProvider}` : ''}`
    : source === 'market-derived-model' ? 'Modelo de goles ajustado al mercado · Sin calibración de aciertos'
    : 'Modelo estadístico · Sin calibración de aciertos';
}
