import { fitStrengths, expectedPair, countDistribution } from '../../src/utils/footballModel.js';
import { starterFactor, pitcherFip, STARTERS } from './baseballStarters.js';

// Opponent- and venue-adjusted run ratings for baseball. Parameters were tuned
// on MLB 2025 and measured blind on MLB 2026 (scripts/backtest/experiment-baseball-markets.mjs).
export const BASEBALL_RATINGS = Object.freeze({
  halfLifeDays: 60, priorGames: 40, minGames: 5,
  // Negative binomial size per team and game (runs vary far more than Poisson).
  size: 3.34,
  // Share of a game's runs scored in innings 1-5 and in the first inning, and the
  // dispersion of those partial counts, measured on MLB 2025.
  firstFiveShare: 0.562, firstFiveSize: 2.06, firstInningShare: 0.12, firstInningSize: 0.53,
  // Nine-inning share of the full-game runs (extra innings add the rest).
  regulationShare: 0.975
});

const fits = new WeakMap();
// One fit per calendar, league and hour: every fixture of a page shares it.
function leagueFit(games, match, cutoff) {
  let byKey = fits.get(games);
  if (!byKey) { byKey = new Map(); fits.set(games, byKey); }
  const key = `${match.leagueId}:${Math.floor(cutoff / 3600000)}`;
  if (!byKey.has(key)) {
    const rows = games.filter(game => game.leagueId === match.leagueId && game.status === 'FINISHED' && game.id !== match.id && !game.exhibition
      && Number.isInteger(game.finalScore?.home) && Number.isInteger(game.finalScore?.away))
      .map(game => ({ time: Date.parse(game.kickoff), home: String(game.homeTeam?.id), away: String(game.awayTeam?.id), hv: game.finalScore.home, av: game.finalScore.away }));
    if (byKey.size > 24) byKey.delete(byKey.keys().next().value);
    byKey.set(key, fitStrengths(rows, { asOf: cutoff, halfLifeDays: BASEBALL_RATINGS.halfLifeDays, priorGames: BASEBALL_RATINGS.priorGames }));
  }
  return byKey.get(key);
}

export function convolve(a, b) {
  const out = new Array(a.length + b.length - 1).fill(0);
  a.forEach((p, i) => b.forEach((q, j) => { out[i + j] += p * q; }));
  return out;
}

const resultOf = (home, away) => {
  let h = 0, d = 0, a = 0;
  home.forEach((p, i) => away.forEach((q, j) => { if (i > j) h += p * q; else if (i === j) d += p * q; else a += p * q; }));
  return { home: h, draw: d, away: a };
};

// Expected runs and count distributions for a fixture, or null without enough
// earlier games for both teams in the same league.
export function ratedRuns(match, games, now = Date.now()) {
  const cutoff = Math.min(Date.parse(match.kickoff), now);
  if (!Number.isFinite(cutoff)) return null;
  const fit = leagueFit(games, match, cutoff);
  const rated = expectedPair(fit, String(match.homeTeam?.id), String(match.awayTeam?.id), { minGames: BASEBALL_RATINGS.minGames });
  if (!rated) return null;
  // MLB announced starters: the runs each team allows follow its starter's FIP.
  const starters = match.leagueId === 'mlb' && ['SCHEDULED', 'LIVE'].includes(match.status) && STARTERS.weight > 0 && match.starters?.home && match.starters?.away ? match.starters : null;
  const factor = side => starters ? starterFactor(starters[side]) : 1;
  const pair = { ...rated, home: rated.home * factor('away'), away: rated.away * factor('home') };
  const c = BASEBALL_RATINGS, dist = (mean, size) => countDistribution(mean, size, 40);
  const home = dist(pair.home, c.size), away = dist(pair.away, c.size);
  const regular = resultOf(dist(pair.home * c.regulationShare, c.size), dist(pair.away * c.regulationShare, c.size));
  return {
    expected: pair, sample: pair.sample, home, away, total: convolve(home, away),
    starters: starters ? Object.fromEntries(['home', 'away'].map(side => [side, { name: starters[side].name || null, fip: Number(pitcherFip(starters[side]).toFixed(2)),
      innings: Math.round((starters[side].current?.outs || 0) / 3), factor: Number(factor(side).toFixed(3)) }])) : null,
    // A tie after nine innings means extra innings; decisive share gives the winner.
    full: resultOf(home, away), regulationTie: regular.draw,
    firstFive: convolve(dist(pair.home * c.firstFiveShare, c.firstFiveSize), dist(pair.away * c.firstFiveShare, c.firstFiveSize)),
    firstInning: resultOf(dist(pair.home * c.firstInningShare, c.firstInningSize), dist(pair.away * c.firstInningShare, c.firstInningSize))
  };
}
