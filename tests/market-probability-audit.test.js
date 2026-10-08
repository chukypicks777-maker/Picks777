import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFootballForecast } from '../server/services/probabilityModel.js';
import { parseFootballOdds } from '../server/services/footballDataService.js';
import { noVigMarket, footballProbabilityLabel } from '../src/utils/marketProbability.js';
import { decimalToAmerican } from '../src/utils/oddsFormatter.js';
import { getTop3Opportunities } from '../src/utils/mathProbabilities.js';
import { devigPower } from '../src/utils/footballModel.js';
import { baseballAnalysis } from '../server/services/sportProbabilityModel.js';
import { sportWinnerPick } from '../src/utils/sportPicks.js';

const lens = () => ({ id: 'lens-lyon', status: 'SCHEDULED', kickoff: '2026-10-09T18:45:00Z',
  homeTeam: { id: '175', name: 'Lens', gamesPlayed: 5, goalsFor: 9, goalsAgainst: 9 },
  awayTeam: { id: '167', name: 'Lyon', gamesPlayed: 5, goalsFor: 10, goalsAgainst: 2 },
  odds: { homeWin: 2.4, draw: 3.85, awayWin: 2.7 }, oddsProvider: 'DraftKings' });

const round2 = value => Math.round(value * 100) / 100;

test('Lens–Lyon uses the complete quoted market; goal lines follow the same quote instead of a five-game sample', () => {
  const match = applyFootballForecast(lens());
  // Power de-vig scored better than proportional scaling out of sample.
  const market = devigPower(match.odds, ['homeWin', 'draw', 'awayWin']);
  for (const key of ['homeWin', 'draw', 'awayWin']) {
    assert.equal(match.probabilities[key], round2(market.probabilities[key]));
    assert.equal(match.model.probabilities[key], round2(market.probabilities[key]));
    assert.equal(match.model.probabilitySources[key], 'published-odds');
  }
  assert.ok(match.probabilities.homeWin > match.probabilities.awayWin);
  // Without league ratings the goals total comes from the 1X2 draw price, not
  // from five games: the supremacy is now coherent with the quoted favourite.
  assert.equal(match.model.statisticalProbabilities, null);
  assert.equal(match.model.totalSource, 'draw-price');
  assert.equal(match.model.probabilitySources.over15, 'market-derived-model');
  assert.ok(match.model.expectedGoals.home > match.model.expectedGoals.away);
  assert.ok(match.probabilities.over05 >= match.probabilities.over15 && match.probabilities.over15 >= match.probabilities.over25);
  const resultPick = getTop3Opportunities(match).find(p => p.category === 'result');
  assert.equal(resultPick.probabilitySource, 'published-odds');
  assert.equal(footballProbabilityLabel(match, resultPick.key), 'Mercado sin margen · DraftKings');
  assert.equal(footballProbabilityLabel(match, 'dcX2'), 'Mercado sin margen · DraftKings');
  assert.equal(match.model.predictedScore, '1 - 1');
});

test('refreshing odds recalculates the winner and cannot recycle an old AI pick', () => {
  const match = applyFootballForecast(lens());
  match.aiPick = { selection: 'Gana Lyon', probability: 99, odds: 9, market: '1X2' };
  match.isAiAnalyzed = true;
  match.odds = { homeWin: 1.5, draw: 4, awayWin: 7 };
  applyFootballForecast(match);
  assert.ok(match.probabilities.homeWin > 60);
  assert.notEqual(match.aiPick?.probability, 99);
});

test('incomplete or cross-format football prices do not manufacture a complete market', () => {
  const mixed = parseFootballOdds({ moneyline: { home: { close: { odds: -110 } } },
    awayTeamOdds: { moneyLine: -115 }, drawOdds: { moneyLine: 285 } });
  assert.equal(mixed.awayWin, null);
  assert.equal(mixed.draw, null);
  assert.equal(noVigMarket(mixed, ['homeWin', 'draw', 'awayWin']), null);
  const match = applyFootballForecast({ ...lens(), odds: mixed });
  assert.equal(match.probabilitySource, 'experimental-model');
  assert.ok(match.probabilities.awayWin > 55);
  assert.equal(parseFootballOdds({ total: { over: { close: { line: 'o2.5', odds: -110 } }, under: { close: { line: 'u3.5', odds: -110 } } } }).over25, null);
});

test('published goal markets retain their own source, separate from the statistical winner', () => {
  const match = applyFootballForecast({ ...lens(), odds: { over25: 1.9, under25: 1.9 } });
  assert.ok(Math.abs(match.probabilities.over25 - 50) < 1e-12);
  assert.equal(match.probabilitySources.over25, 'published-odds');
  assert.equal(match.probabilitySources.homeWin, 'experimental-model');
});

test('a current score or standings never creates a new pregame forecast after kickoff', () => {
  for (const status of ['LIVE', 'FINISHED', 'UNKNOWN']) {
    const match = { ...applyFootballForecast(lens()), status };
    applyFootballForecast(match);
    assert.equal(match.model, null);
    assert.deepEqual(match.probabilities, {});
  }
});

test('a published over/under total adjusts modeled goal lines without moving the quoted winner', () => {
  const match = applyFootballForecast({ ...lens(), odds: { ...lens().odds, over25: 1.1, under25: 9 } });
  const p = match.probabilities;
  assert.ok(p.over05 >= p.over15 && p.over15 >= p.over25 && p.over25 >= p.over35 && p.over35 >= p.over45);
  assert.equal(p.homeWin, applyFootballForecast(lens()).probabilities.homeWin);
  assert.equal(p.homeWin, round2(devigPower(lens().odds, ['homeWin', 'draw', 'awayWin']).probabilities.homeWin));
  assert.equal(p.over25, round2(devigPower({ over25: 1.1, under25: 9 }, ['over25', 'under25']).probabilities.over25));
  assert.equal(match.model.totalSource, 'published-odds');
  assert.equal(match.probabilitySources.over15, 'market-derived-model');
  assert.equal(match.probabilitySources.over25, 'published-odds');
});

test('incompatible goal inputs cannot bypass the model guard through season-statistic fallbacks', () => {
  const match = applyFootballForecast({ ...lens(), odds: { ...lens().odds, over25: 99, under25: 1.01, bttsYes: 1.1, bttsNo: 9 } });
  assert.equal(match.goalMarketsConflict, true);
  assert.equal(match.probabilities.over15, null);
  assert.equal(match.model.predictedScore, null);
  assert.ok(match.probabilities.bttsYes > 80);
  assert.equal(match.probabilitySources.bttsYes, 'published-odds');
});

const kbo = { id: 'kt-samsung', sport: 'beisbol', leagueId: 'kbo', allowsDraw: true,
  kickoff: '2026-10-07T09:30:00Z', status: 'SCHEDULED', homeTeam: { id: 'KT', name: 'KT' }, awayTeam: { id: 'S', name: 'Samsung' } };
const history = Array.from({ length: 6 }, (_, i) => ({ ...kbo, id: `past-${i}`, status: 'FINISHED',
  kickoff: `2026-09-${20 + i}T09:30:00Z`, finalScore: { home: 5, away: i === 0 ? 5 : 3 } }));

test('KBO ties use unique matches and the same game cannot count twice in both team histories', () => {
  const analysis = baseballAnalysis(kbo, history, Date.parse(kbo.kickoff));
  assert.deepEqual(analysis.drawSampleSize, { uniqueGames: 6, draws: 1 });
  assert.ok(Math.abs(analysis.winner.draw - 21.4) < 0.11);
  assert.equal(analysis.winnerMarket, 'three-way');
});

test('KBO prices never replace three-way model probabilities, and a two-way price is not attached to a three-way pick', () => {
  const odds = { homeWin: 1 + 100 / 110, awayWin: 1 + 100 / 115 };
  const analysis = baseballAnalysis({ ...kbo, odds }, history, Date.parse(kbo.kickoff));
  assert.equal(analysis.probabilitySource, 'experimental-model');
  assert.equal(sportWinnerPick({ ...kbo, odds, analysis }).oddsKind, 'theoretical');
  // A complete three-way quote is only the momio: percentages stay the model's.
  const complete = { ...odds, draw: 15 };
  const quoted = baseballAnalysis({ ...kbo, odds: complete }, history, Date.parse(kbo.kickoff));
  assert.equal(quoted.probabilitySource, 'experimental-model');
  assert.deepEqual(quoted.winner, analysis.winner);
  assert.ok(Math.abs(Object.values(quoted.winner).reduce((s, p) => s + p, 0) - 100) < 1e-9);
  assert.equal(sportWinnerPick({ ...kbo, odds: complete, analysis: quoted }).oddsKind, 'published');
  assert.equal(baseballAnalysis({ ...kbo, odds: complete }, [], Date.parse(kbo.kickoff)).winner.home, null, 'Prices alone never produce a percentage');
});

test('the screenshot +176 is a correct conversion, while -110/-115 imply a different two-way market', () => {
  assert.equal(decimalToAmerican(100 / 36.2), '+176');
  const market = noVigMarket({ h: 1 + 100 / 110, a: 1 + 100 / 115 }, ['h', 'a']);
  assert.ok(Math.abs(market.probabilities.a - 50.523) < 0.01);
  assert.ok(Math.abs(market.overround - 5.869) < 0.01);
});
