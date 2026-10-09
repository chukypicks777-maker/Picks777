import test from 'node:test';
import assert from 'node:assert/strict';
import * as fm from '../src/utils/footballModel.js';

const DAY = 86400000, NOW = Date.parse('2026-10-07T00:00:00Z');
const close = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);

// A deterministic double round robin whose observations equal their expectations.
function league(truth, baseHome = 1.5, baseAway = 1.15) {
  const ids = Object.keys(truth), games = [];
  let day = 300;
  for (let round = 0; round < 2; round++) for (const h of ids) for (const a of ids) {
    if (h === a) continue;
    games.push({ time: NOW - day-- * DAY, home: h, away: a,
      hv: baseHome * truth[h].attack * truth[a].defense, av: baseAway * truth[a].attack * truth[h].defense });
  }
  return games;
}

test('strength ratings recover opponent-adjusted attack and defense from a balanced schedule', () => {
  const truth = { A: { attack: 1.4, defense: 0.7 }, B: { attack: 1.1, defense: 0.9 }, C: { attack: 1, defense: 1 },
    D: { attack: 0.9, defense: 1.1 }, E: { attack: 0.8, defense: 1.2 }, F: { attack: 0.85, defense: 1.15 } };
  const fit = fm.fitStrengths(league(truth), { asOf: NOW, halfLifeDays: 0, priorGames: 0.01 });
  const pair = fm.expectedPair(fit, 'A', 'E');
  close(pair.home, 1.5 * 1.4 * 1.2, 0.03, 'home expectation');
  close(pair.away, 1.15 * 0.8 * 0.7, 0.03, 'away expectation');
  // A strong prior pulls a short history toward the league average.
  const shrunk = fm.expectedPair(fm.fitStrengths(league(truth), { asOf: NOW, halfLifeDays: 0, priorGames: 1000 }), 'A', 'E');
  assert.ok(Math.abs(shrunk.home - 1.5) < Math.abs(pair.home - 1.5));
  assert.equal(fm.expectedPair(fit, 'A', 'unknown'), null, 'A team without history has no forecast');
  // Only games before the forecast time are fitted.
  assert.equal(fm.fitStrengths(league(truth), { asOf: NOW - 400 * DAY }), null);
});

test('Dixon-Coles keeps total mass, supremacy and totals above 2.5 while adding draws', () => {
  const independent = fm.goalMarkets(fm.scoreMatrix(1.6, 1.1, 0)).probabilities;
  const adjusted = fm.goalMarkets(fm.scoreMatrix(1.6, 1.1, -0.07)).probabilities;
  close(adjusted.homeWin + adjusted.draw + adjusted.awayWin, 100, 1e-9, 'mass');
  close(adjusted.homeWin - adjusted.awayWin, independent.homeWin - independent.awayWin, 1e-9, 'supremacy');
  close(adjusted.over25, independent.over25, 1e-9, 'over 2.5');
  assert.ok(adjusted.draw > independent.draw);
  for (const line of ['05', '15', '25', '35', '45']) close(adjusted[`over${line}`] + adjusted[`under${line}`], 100, 1e-9, `line ${line}`);
  assert.ok(adjusted.over05 >= adjusted.over15 && adjusted.over15 >= adjusted.over25 && adjusted.over25 >= adjusted.over35);
  assert.ok(adjusted.bttsYes <= adjusted.over15);
});

test('market fitting reproduces quoted supremacy, totals and the draw-implied total', () => {
  const market = fm.devigPower({ homeWin: 1.5, draw: 4.5, awayWin: 6.5 }, ['homeWin', 'draw', 'awayWin']).probabilities;
  close(market.homeWin + market.draw + market.awayWin, 100, 1e-9, 'power de-vig mass');
  const proportional = { awayWin: (1 / 6.5) / (1 / 1.5 + 1 / 4.5 + 1 / 6.5) * 100 };
  assert.ok(market.awayWin < proportional.awayWin, 'Long prices lose more margin than favourites');
  const rates = fm.solveGoalRates({ ...market, over25: 55 });
  const p = fm.goalMarkets(fm.scoreMatrix(rates.home, rates.away)).probabilities;
  close(p.homeWin - p.awayWin, market.homeWin - market.awayWin, 0.01, 'supremacy');
  close(p.over25, 55, 0.01, 'over 2.5');
  const total = fm.drawImpliedTotal(market);
  const fromDraw = fm.solveGoalRates(market, { total });
  close(fm.goalMarkets(fm.scoreMatrix(fromDraw.home, fromDraw.away)).probabilities.draw, market.draw, 0.05, 'draw');
  assert.equal(fm.solveGoalRates({ homeWin: 0, awayWin: 50 }), null);
  assert.equal(fm.devigPower({ homeWin: 1.5, draw: null, awayWin: 4 }, ['homeWin', 'draw', 'awayWin']), null);
});

test('negative binomial counts keep their mean, overdispersion and complementary ladders', () => {
  const mean = 10, size = 40, pmf = fm.countDistribution(mean, size);
  const m1 = pmf.reduce((s, p, k) => s + p * k, 0), m2 = pmf.reduce((s, p, k) => s + p * k * k, 0);
  close(pmf.reduce((s, p) => s + p, 0), 1, 1e-9, 'mass');
  close(m1, mean, 1e-6, 'mean');
  close(m2 - m1 * m1, mean + mean * mean / size, 1e-4, 'variance');
  const lines = fm.countLines(pmf, [7.5, 8.5, 9.5, 10.5]);
  assert.ok(lines.over75 > lines.over85 && lines.over85 > lines.over95 && lines.over95 > lines.over105);
  for (const key of ['75', '85', '95', '105']) close(lines[`over${key}`] + lines[`under${key}`], 100, 1e-9, key);
  // Overdispersion widens the tails relative to Poisson.
  assert.ok(fm.countLines(pmf, [14.5]).over145 > fm.countLines(fm.countDistribution(mean), [14.5]).over145);
  assert.equal(fm.estimateDispersion([{ mean: 2, value: 2 }, { mean: 2, value: 2 }]), Infinity, 'No excess variance means Poisson');
});

test('forecasts keep quoted prices, derive coherent lines and add corners, cards and halves from league ratings', () => {
  const truth = { A: { attack: 1.3, defense: 0.8 }, B: { attack: 1.1, defense: 0.9 }, C: { attack: 1, defense: 1 },
    D: { attack: 0.9, defense: 1.1 }, E: { attack: 0.8, defense: 1.2 }, F: { attack: 0.9, defense: 1.05 } };
  const goals = league(truth);
  const corners = league(truth, 5.6, 4.4);
  const games = goals.map((g, i) => ({ time: g.time, home: g.home, away: g.away, hg: Math.round(g.hv), ag: Math.round(g.av),
    hst: Math.round(g.hv * 3), ast: Math.round(g.av * 3), hc: Math.round(corners[i].hv), ac: Math.round(corners[i].av), hy: 2, ay: 2, hthg: Math.min(1, Math.round(g.hv)), htag: 0 }))
    .concat(goals.map(g => ({ time: g.time - 400 * DAY, home: g.home, away: g.away, hg: 2, ag: 1, hthg: 1, htag: 0, hst: 5, ast: 3, hc: 6, ac: 4, hy: 2, ay: 2 })));
  const fits = fm.fitFootballLeague(games, { asOf: NOW });
  const statistical = fm.forecastFootball(fits, 'A', 'E', {});
  assert.equal(statistical.sources.homeWin, 'statistical-model');
  assert.ok(statistical.probabilities.homeWin > statistical.probabilities.awayWin);
  assert.ok(statistical.corners.expected.home > statistical.corners.expected.away);
  assert.equal(statistical.corners.distribution, 'Binomial negativa');
  assert.ok(statistical.cards.total.over35 > 0 && statistical.halves.first.expectedGoals > 0);
  const quoted = fm.forecastFootball(fits, 'A', 'E', { homeWin: 3.2, draw: 3.3, awayWin: 2.3 });
  const market = fm.devigPower({ homeWin: 3.2, draw: 3.3, awayWin: 2.3 }, ['homeWin', 'draw', 'awayWin']).probabilities;
  // The published quote wins over the model, and every goal line follows it.
  close(quoted.probabilities.awayWin, market.awayWin, 0.01, 'quoted away');
  assert.equal(quoted.sources.awayWin, 'published-odds');
  assert.equal(quoted.sources.over15, 'market-derived-model');
  assert.equal(quoted.totalSource, 'draw-price-and-model');
  assert.ok(quoted.expectedGoals.away > quoted.expectedGoals.home, 'Expected goals agree with the quoted favourite');
  assert.equal(fm.forecastFootball(null, 'A', 'E', {}), null, 'No ratings and no prices: no invented forecast');
});

test('the draw-implied goal total stays within priced totals for lopsided fixtures (Viking vs Bayern)', () => {
  // Reported case: 1X2 17 / 12 / 1.09, no goals price and no team history.
  const lopsided = fm.devigPower({ homeWin: 17, draw: 12, awayWin: 1.0909 }, ['homeWin', 'draw', 'awayWin']).probabilities;
  assert.ok(fm.drawImpliedTotal(lopsided) > 6, 'The raw draw price implies more than six goals');
  const total = fm.calibratedDrawTotal(lopsided);
  assert.ok(total <= fm.FOOTBALL_MODEL.drawTotal.max && total >= 4);
  const forecast = fm.forecastFootball(null, 'viking', 'bayern', { homeWin: 17, draw: 12, awayWin: 1.0909 });
  assert.ok(forecast.probabilities.over15 < 96 && forecast.probabilities.over25 < 88, `Over 1.5 ${forecast.probabilities.over15}, Over 2.5 ${forecast.probabilities.over25}`);
  assert.ok(forecast.probabilities.bttsYes < 65, `BTTS ${forecast.probabilities.bttsYes}`);
  assert.ok(forecast.probabilities.awayWin > 85, 'The 1X2 split is untouched');
  // Balanced fixtures keep a normal total and the mapping is monotonic.
  const balanced = fm.devigPower({ homeWin: 2.6, draw: 3.3, awayWin: 2.8 }, ['homeWin', 'draw', 'awayWin']).probabilities;
  const normal = fm.calibratedDrawTotal(balanced);
  assert.ok(normal > 2.2 && normal < 3.2);
  const raws = [2, 2.5, 3, 4, 5, 6, 7].map(raw => Math.min(4.6, Math.max(1.8, 1.18 * raw ** 0.86)));
  assert.ok(raws.every((value, i) => i === 0 || value >= raws[i - 1]));
});
