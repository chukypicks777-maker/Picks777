import test from 'node:test';
import assert from 'node:assert/strict';
import {
  poissonProbability,
  poissonCumulative,
  calculateCornerProbabilities,
  calculateTeamDetailedStats,
  calculateDifferential,
  getMatchSafetyScore,
  getTop3Opportunities,
  getBestBankerPick,
  getCoherentPredictedScore,
  calculateRealPoissonScore
} from '../src/utils/mathProbabilities.js';
import { poissonModel } from '../server/services/probabilityModel.js';

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
  assert.ok(stats.cardsOver35 >= 0 && stats.cardsOver35 <= 100);
  assert.ok(stats.cardsOver45 >= 0 && stats.cardsOver45 <= 100);
  assert.ok(stats.cardsOver25 >= stats.cardsOver35);
  assert.ok(stats.cardsOver35 >= stats.cardsOver45);

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

test('getBestBankerPick returns rich AI justification, safetyScore, realistic odds and high-probability pick', () => {
  // Test heavy home favorite
  const matchA = {
    id: 'match-real-madrid-getafe',
    homeTeam: { name: 'Real Madrid', shortName: 'RMA', goalsFor: 40, goalsAgainst: 12, gamesPlayed: 16, avgGoalsScored: 2.5 },
    awayTeam: { name: 'Getafe', shortName: 'GET', goalsFor: 12, goalsAgainst: 22, gamesPlayed: 16, avgGoalsScored: 0.75 },
    probabilities: {
      homeWin: 72,
      draw: 18,
      awayWin: 10,
      over15: 85,
      under35: 75,
      confidence: 88
    },
    odds: {
      homeWin: 1.35
    }
  };

  const bankerA = getBestBankerPick(matchA);
  assert.ok(bankerA.selection, 'Banker pick must have a selection');
  assert.ok(bankerA.probability >= 70, `Probability ${bankerA.probability} should be high safety`);
  assert.ok(bankerA.safetyScore >= 70, `Safety score ${bankerA.safetyScore} should be high`);
  assert.ok(bankerA.odds >= 1.10 && bankerA.odds <= 2.50, `Odds ${bankerA.odds} must be realistic`);
  assert.ok(bankerA.rationale, 'Rationale must be present');
  assert.ok(bankerA.rationale.length > 25, 'Rationale must be a descriptive statistical justification');
  assert.ok(
    bankerA.rationale.toLowerCase().includes('gol') ||
    bankerA.rationale.toLowerCase().includes('seguridad') ||
    bankerA.rationale.toLowerCase().includes('victoria') ||
    bankerA.rationale.toLowerCase().includes('poisson'),
    'Rationale must mention goals, safety, win, or Poisson'
  );

  // Test defensive, low-scoring match
  const matchDefensive = {
    id: 'match-atletico-mallorca',
    homeTeam: { name: 'Atlético Madrid', shortName: 'ATM', goalsFor: 20, goalsAgainst: 8, gamesPlayed: 15, avgGoalsScored: 1.33 },
    awayTeam: { name: 'Mallorca', shortName: 'MLL', goalsFor: 11, goalsAgainst: 14, gamesPlayed: 15, avgGoalsScored: 0.73 },
    probabilities: {
      homeWin: 52,
      draw: 32,
      awayWin: 16,
      over25: 35,
      under25: 65,
      under35: 86,
      over15: 60
    }
  };

  const bankerDef = getBestBankerPick(matchDefensive);
  assert.ok(bankerDef.selection.includes('Menos') || bankerDef.selection.includes('Empate'), 'Should pick Under or Double Chance');
  assert.ok(bankerDef.safetyScore >= 75);
  assert.ok(bankerDef.rationale.length > 20);

  // Test fallback on null or empty match
  const bankerFallback = getBestBankerPick(null);
  assert.ok(bankerFallback.selection);
  assert.ok(bankerFallback.safetyScore >= 60);
  assert.ok(bankerFallback.rationale.includes('seguridad'));
});

test('getCoherentPredictedScore guarantees alignment with favored team and resolves contradictions', () => {
  // Home heavily favored (60% vs 18%), but candidate was draw 1-1
  const homeFavMatch = { probabilities: { homeWin: 60, awayWin: 18 } };
  assert.equal(getCoherentPredictedScore(homeFavMatch, '1 - 1'), '2 - 1', 'Draw 1-1 should be converted to 2-1 for favored home');
  assert.equal(getCoherentPredictedScore(homeFavMatch, '1 - 2'), '2 - 1', 'Inverted 1-2 should be flipped to 2-1 for favored home');
  assert.equal(getCoherentPredictedScore(homeFavMatch, '2 - 0'), '2 - 0', 'Coherent 2-0 should be preserved');

  // Away heavily favored (65% vs 15%), but candidate was home win 2-1 or draw 1-1
  const awayFavMatch = { probabilities: { homeWin: 15, awayWin: 65 } };
  assert.equal(getCoherentPredictedScore(awayFavMatch, '1 - 1'), '1 - 2', 'Draw 1-1 should be converted to 1-2 for favored away');
  assert.equal(getCoherentPredictedScore(awayFavMatch, '2 - 1'), '1 - 2', 'Inverted 2-1 should be flipped to 1-2 for favored away');
  assert.equal(getCoherentPredictedScore(awayFavMatch, '0 - 2'), '0 - 2', 'Coherent 0-2 should be preserved');

  // Balanced match (neither favored by >= 4%)
  const balancedMatch = { probabilities: { homeWin: 35, awayWin: 34 } };
  assert.equal(getCoherentPredictedScore(balancedMatch, '1 - 1'), '1 - 1', 'Draw 1-1 should be preserved in balanced match');

  // Fallback on null
  assert.equal(getCoherentPredictedScore(null), '2 - 1');
});

test('calculateRealPoissonScore calculates genuine Poisson score aligned with team attack and defense', () => {
  const matchHighHome = {
    homeTeam: { avgGoalsScored: 2.5, avgGoalsConceded: 0.6, gamesPlayed: 20 },
    awayTeam: { avgGoalsScored: 0.7, avgGoalsConceded: 2.1, gamesPlayed: 20 },
    probabilities: { homeWin: 72, draw: 18, awayWin: 10 }
  };
  const score = calculateRealPoissonScore(matchHighHome);
  assert.ok(score.includes('-'));
  const [h, a] = score.split('-').map(s => parseInt(s.trim(), 10));
  assert.ok(h > a, `Favored home team must have higher goals: got ${score}`);

  const matchHighAway = {
    homeTeam: { avgGoalsScored: 0.5, avgGoalsConceded: 2.2, gamesPlayed: 20 },
    awayTeam: { avgGoalsScored: 2.8, avgGoalsConceded: 0.5, gamesPlayed: 20 },
    probabilities: { homeWin: 12, draw: 18, awayWin: 70 }
  };
  const awayScore = calculateRealPoissonScore(matchHighAway);
  const [ah, aa] = awayScore.split('-').map(s => parseInt(s.trim(), 10));
  assert.ok(aa > ah, `Favored away team must have higher goals: got ${awayScore}`);
});

test('poissonModel handles record { w, d, l } and produces monotonic scoreDistribution', () => {
  const homeWithRecord = {
    name: 'AEK Athens',
    goalsFor: 39,
    goalsAgainst: 16,
    homeRecord: { w: 11, d: 0, l: 0 }
  };
  const awayWithRecord = {
    name: 'LASK Linz',
    goalsFor: 18,
    goalsAgainst: 22,
    awayRecord: { w: 4, d: 2, l: 5 }
  };

  const model = poissonModel(homeWithRecord, awayWithRecord, 1);
  assert.ok(model, 'poissonModel should successfully compute with record fallback');
  assert.equal(model.sampleSize.home, 11);
  assert.equal(model.sampleSize.away, 11);
  assert.ok(model.predictedScore);
  assert.ok(model.scoreDistribution.length > 0);

  // Verify monotonicity: index 0 (topScore) has the highest probability, and probabilities descend
  const dist = model.scoreDistribution;
  assert.equal(dist[0].score, model.predictedScore, 'Top score in distribution must match predictedScore');
  for (let i = 0; i < dist.length - 1; i++) {
    assert.ok(
      dist[i].probability >= dist[i + 1].probability - 1e-6,
      `scoreDistribution must be descending: item ${i} (${dist[i].probability}%) vs item ${i + 1} (${dist[i + 1].probability}%)`
    );
  }
});


