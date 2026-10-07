import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveCalibratedPoissonModel, poissonModel, buildPick } from '../server/services/probabilityModel.js';
test('all modeled 1X2 and BTTS probabilities agree with the same score-generating distribution', () => {
  const derived = deriveCalibratedPoissonModel({ homeWin: 85, draw: 10, awayWin: 5, over25: 55, bttsYes: 30 });
  assert.ok(derived);
  const { home, away } = derived.expectedGoals;
  const reference = poissonModel({ gamesPlayed: 10, goalsFor: home * 10, goalsAgainst: away * 10 }, { gamesPlayed: 10, goalsFor: away * 10, goalsAgainst: home * 10 });
  for (const key of ['homeWin', 'draw', 'awayWin', 'bttsYes', 'bttsNo', 'over25']) {
    assert.ok(Math.abs(derived.probabilities[key] - reference.probabilities[key]) < 1e-8, key);
  }
  assert.equal(derived.predictedScore, reference.predictedScore);
  assert.equal(derived.marketProbabilities.homeWin, 85);
});
test('an isolated winner price does not manufacture a winner distribution', () => {
  const model = deriveCalibratedPoissonModel({ over25: 55 }, {}, {}, { homeWin: 1.2 });
  assert.equal(model.probabilities.homeWin, null);
  assert.equal(model.probabilities.awayWin, null);
});
test('stopped or unknown matches cannot produce actionable banker picks', () => {
  for (const status of ['LIVE', 'FINISHED', 'SUSPENDED', 'POSTPONED', 'CANCELLED', 'ABANDONED', 'DELAYED', 'UNKNOWN']) {
    assert.equal(buildPick({ status, probabilities: { homeWin: 60, draw: 25, awayWin: 15 } }), null);
  }
});
