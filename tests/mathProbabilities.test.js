import test from 'node:test';
import assert from 'node:assert/strict';
import {
  poissonProbability,
  poissonCumulative,
  calculateCornerProbabilities,
  calculateTeamDetailedStats,
  calculateDifferential,
  getMatchSafetyScore,
  getTop3Opportunities
} from '../src/utils/mathProbabilities.js';

test('poisson cumulative and probability functions behave correctly', () => {
  assert.equal(poissonProbability(0, 0), 0);
  assert.equal(poissonCumulative(5.0, -1), 0);
  const p0 = poissonProbability(2.0, 0);
  assert.ok(Math.abs(p0 - Math.exp(-2.0)) < 1e-6);
  const cum = poissonCumulative(3.0, 10);
  assert.ok(cum > 0.99 && cum <= 1.0);
});

test('calculateCornerProbabilities returns complementary +5 and -5 corner probabilities and complete ladder lines', () => {
  const lowCorners = calculateCornerProbabilities(3.5);
  assert.equal(lowCorners.over5 + lowCorners.under5, 100);
  assert.equal(lowCorners.over85 + lowCorners.under85, 100);
  assert.ok(lowCorners.under5 > lowCorners.over5, 'Team with 3.5 corners should have higher under 5 probability');

  const highCorners = calculateCornerProbabilities(7.2);
  assert.equal(highCorners.over5 + highCorners.under5, 100);
  assert.ok(highCorners.over5 > highCorners.under5, 'Team with 7.2 corners should have higher over 5 probability');

  // Verify corner ladder (+1.5 through +6.5) is monotonically decreasing
  assert.ok(highCorners.over15 >= highCorners.over25);
  assert.ok(highCorners.over25 >= highCorners.over35);
  assert.ok(highCorners.over35 >= highCorners.over45);
  assert.ok(highCorners.over45 >= highCorners.over55);
  assert.ok(highCorners.over55 >= highCorners.over65);
});

test('calculateTeamDetailedStats provides complete positive and negative lines, cards and corner breakdown', () => {
  const team = {
    name: 'Real Madrid',
    shortName: 'RMA',
    gamesPlayed: 20,
    goalsFor: 45,
    goalsAgainst: 15,
    avgCorners: 6.8,
    avgYellowCards: 2.3
  };
  const stats = calculateTeamDetailedStats(team, true);

  assert.equal(stats.name, 'Real Madrid');
  assert.equal(stats.goalDiff, 30);
  assert.equal(stats.cornerOver5 + stats.cornerUnder5, 100);
  assert.equal(stats.over15Rate + stats.under15Rate, 100);
  assert.equal(stats.over25Rate + stats.under25Rate, 100);
  assert.equal(stats.over35Rate + stats.under35Rate, 100);
  assert.equal(stats.over05Rate + stats.under05Rate, 100);
  assert.ok(stats.over05Rate >= stats.over15Rate);

  // Cards probabilities
  assert.equal(stats.cardsUnder05 + stats.cardsOver05, 100);
  assert.ok(stats.cardsOver05 > 0 && stats.cardsOver05 <= 100);
  assert.ok(stats.cardsOver15 > 0 && stats.cardsOver15 <= 100);
  assert.ok(stats.cardsOver25 > 0 && stats.cardsOver25 <= 100);

  // Corners ladder
  assert.ok(stats.cornerOver15 >= stats.cornerOver25);
  assert.ok(stats.cornerOver25 >= stats.cornerOver35);
  assert.ok(stats.cornerOver35 >= stats.cornerOver45);
  assert.ok(stats.cornerOver45 >= stats.cornerOver55);
  assert.ok(stats.cornerOver55 >= stats.cornerOver65);
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

test('getTop3Opportunities returns the 3 best high-probability opportunities without contradictions', () => {
  const match = {
    id: 'match-alaves-valencia',
    leagueName: 'LaLiga',
    homeTeam: { name: 'Alavés', shortName: 'ALA', avgCorners: 5.5, avgYellowCards: 2.2, goalsFor: 28, gamesPlayed: 18 },
    awayTeam: { name: 'Valencia', shortName: 'VAL', avgCorners: 4.8, avgYellowCards: 2.5, goalsFor: 20, gamesPlayed: 18 },
    probabilities: {
      homeWin: 55,
      draw: 27,
      awayWin: 18,
      over25: 44,
      under25: 56,
      over15: 82
    },
    odds: {
      homeWin: 1.71,
      awayWin: 5.25
    }
  };

  const top3 = getTop3Opportunities(match);
  assert.equal(top3.length, 3, 'Must return exactly 3 top opportunities');

  top3.forEach(item => {
    assert.equal(item.matchId, 'match-alaves-valencia');
    assert.ok(item.matchTitle.includes('Alavés vs Valencia'));
    assert.ok(item.selection && item.selection.length > 0);
    assert.ok(item.probability >= 60, `Opportunity ${item.selection} should have high probability`);
    assert.ok(item.odds >= 1.05 && item.odds <= 3.5, `Odds ${item.odds} should be realistic`);
  });

  // Verify selections are non-redundant (all selections are distinct)
  const uniqueSelections = new Set(top3.map(t => t.selection));
  assert.equal(uniqueSelections.size, 3, 'All 3 opportunities should be unique');

  // Verify edge case: null or empty match returns 3 fallback opportunities
  const fallback = getTop3Opportunities(null);
  assert.equal(fallback.length, 3);
  assert.ok(fallback.every(f => f.probability >= 70));

  // Verify away favorite match selects away scoring if away team is much stronger
  const awayFavMatch = {
    id: 'away-fav',
    homeTeam: { name: 'Leganés', shortName: 'LEG', avgGoalsScored: 0.7, avgCorners: 3.2, avgYellowCards: 2.8 },
    awayTeam: { name: 'Real Madrid', shortName: 'RMA', avgGoalsScored: 2.4, avgCorners: 6.8, avgYellowCards: 1.6 },
    probabilities: { homeWin: 12, draw: 22, awayWin: 66, over25: 62 }
  };
  const awayTop3 = getTop3Opportunities(awayFavMatch);
  assert.equal(awayTop3.length, 3);
  const scoringPick = awayTop3.find(p => p.market === 'Goles por Equipo');
  if (scoringPick) {
    assert.ok(scoringPick.selection.includes('RMA'), 'Should pick RMA scoring over LEG when RMA averages more goals');
  }
  assert.ok(awayTop3.every(p => p.odds >= 1.12), 'All odds should be >= 1.12');
});
