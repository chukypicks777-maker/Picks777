import test from 'node:test';
import assert from 'node:assert/strict';
import {
  poissonProbability,
  poissonCumulative,
  calculateCornerProbabilities,
  calculateTeamDetailedStats,
  calculateDifferential,
  getMatchSafetyScore
} from '../src/utils/mathProbabilities.js';

test('poisson cumulative and probability functions behave correctly', () => {
  assert.equal(poissonProbability(0, 0), 0);
  assert.equal(poissonCumulative(5.0, -1), 0);
  const p0 = poissonProbability(2.0, 0);
  assert.ok(Math.abs(p0 - Math.exp(-2.0)) < 1e-6);
  const cum = poissonCumulative(3.0, 10);
  assert.ok(cum > 0.99 && cum <= 1.0);
});

test('calculateCornerProbabilities returns complementary +5 and -5 corner probabilities', () => {
  const lowCorners = calculateCornerProbabilities(3.5);
  assert.equal(lowCorners.over5 + lowCorners.under5, 100);
  assert.equal(lowCorners.over85 + lowCorners.under85, 100);
  assert.ok(lowCorners.under5 > lowCorners.over5, 'Team with 3.5 corners should have higher under 5 probability');

  const highCorners = calculateCornerProbabilities(7.2);
  assert.equal(highCorners.over5 + highCorners.under5, 100);
  assert.ok(highCorners.over5 > highCorners.under5, 'Team with 7.2 corners should have higher over 5 probability');
});

test('calculateTeamDetailedStats provides complete positive and negative lines', () => {
  const team = {
    name: 'Real Madrid',
    shortName: 'RMA',
    gamesPlayed: 20,
    goalsFor: 45,
    goalsAgainst: 15,
    avgCorners: 6.8
  };
  const stats = calculateTeamDetailedStats(team, true);

  assert.equal(stats.name, 'Real Madrid');
  assert.equal(stats.goalDiff, 30);
  assert.equal(stats.cornerOver5 + stats.cornerUnder5, 100);
  assert.equal(stats.over15Rate + stats.under15Rate, 100);
  assert.equal(stats.over25Rate + stats.under25Rate, 100);
  assert.equal(stats.over35Rate + stats.under35Rate, 100);
  assert.ok(stats.avgGF > stats.avgGC);
});

test('calculateDifferential computes corner and goal gaps correctly', () => {
  const homeStats = calculateTeamDetailedStats({ avgCorners: 6.5, goalsFor: 40, goalsAgainst: 15, gamesPlayed: 20 }, true);
  const awayStats = calculateTeamDetailedStats({ avgCorners: 4.5, goalsFor: 25, goalsAgainst: 30, gamesPlayed: 20 }, false);
  const diff = calculateDifferential(homeStats, awayStats, { probabilities: { over25: 65 } });

  assert.equal(diff.cornerGap, 2.0);
  assert.equal(diff.cornerAdvantageAbs, 2.0);
  assert.equal(diff.over25, 65);
  assert.equal(diff.under25, 35);
  assert.equal(diff.overUnderMargin, 30);
  assert.ok(diff.overUnderTendency.includes('Over'));
});

test('getMatchSafetyScore returns highest probability/confidence for sorting', () => {
  const matchA = { probabilities: { confidence: 92 } };
  const matchB = { probabilities: { confidence: 75 } };
  const matchC = { probabilities: { homeWin: 85 } };

  assert.equal(getMatchSafetyScore(matchA), 92);
  assert.equal(getMatchSafetyScore(matchB), 75);
  assert.equal(getMatchSafetyScore(matchC), 85);

  const list = [matchB, matchA, matchC];
  list.sort((a, b) => getMatchSafetyScore(b) - getMatchSafetyScore(a));

  assert.deepEqual(list, [matchA, matchC, matchB], 'Should sort descending by safety score');
});
