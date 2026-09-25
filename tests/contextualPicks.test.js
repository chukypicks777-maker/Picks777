import test from 'node:test';
import assert from 'node:assert/strict';
import { getContextualPick, deriveSeasonPoisson, getEffectiveOdds } from '../src/utils/mathProbabilities.js';

test('getContextualPick returns Over 2.5 Goals when marketFilter is over', () => {
  const match = {
    id: 'match-over-1',
    status: 'SCHEDULED',
    homeTeam: { name: 'Manchester City', shortName: 'MCI' },
    awayTeam: { name: 'Liverpool', shortName: 'LIV' },
    probabilities: {
      homeWin: 55,
      draw: 22,
      awayWin: 23,
      over15: 85,
      over25: 64,
      under25: 36,
      bttsYes: 60
    },
    odds: {
      over15: 1.22,
      over25: 1.75,
      bttsYes: 1.68
    },
    leagueName: 'Premier League'
  };

  // Under 'all' or 'safe', banker pick is chosen (typically Over 1.5 due to 85% probability)
  const defaultPick = getContextualPick(match, 'all');
  assert.equal(defaultPick.selection, 'Más de 1.5 Goles');

  // Under 'over', contextual pick MUST be 'Más de 2.5 Goles'
  const overPick = getContextualPick(match, 'over');
  assert.ok(overPick, 'Over pick should exist');
  assert.equal(overPick.key, 'over25');
  assert.equal(overPick.selection, 'Más de 2.5 Goles');
  assert.equal(overPick.probability, 64);
  assert.equal(overPick.odds, 1.75);
  assert.equal(overPick.matchId, 'match-over-1');
  assert.equal(getEffectiveOdds(overPick), 1.75);
});

test('getContextualPick returns BTTS Yes when marketFilter is btts', () => {
  const match = {
    id: 'match-btts-1',
    status: 'SCHEDULED',
    homeTeam: { name: 'Bayern Munich', shortName: 'BAY' },
    awayTeam: { name: 'Borussia Dortmund', shortName: 'BVB' },
    probabilities: {
      homeWin: 60,
      draw: 20,
      awayWin: 20,
      over15: 88,
      over25: 70,
      bttsYes: 68
    },
    odds: {
      bttsYes: 1.55,
      over25: 1.50
    },
    leagueName: 'Bundesliga'
  };

  const bttsPick = getContextualPick(match, 'btts');
  assert.ok(bttsPick, 'BTTS pick should exist');
  assert.equal(bttsPick.key, 'bttsYes');
  assert.equal(bttsPick.selection, 'Ambos anotan: Sí');
  assert.equal(bttsPick.market, 'Ambos anotan');
  assert.equal(bttsPick.probability, 68);
  assert.equal(bttsPick.odds, 1.55);
  assert.equal(bttsPick.matchId, 'match-btts-1');
});

test('getContextualPick calculates estimated odds when published odds are absent', () => {
  const matchNoOdds = {
    id: 'match-no-odds',
    status: 'SCHEDULED',
    homeTeam: { name: 'América', shortName: 'AME' },
    awayTeam: { name: 'Chivas', shortName: 'CHI' },
    probabilities: {
      over25: 58,
      bttsYes: 54
    },
    odds: {},
    leagueName: 'Liga MX'
  };

  const overPick = getContextualPick(matchNoOdds, 'over');
  assert.equal(overPick.selection, 'Más de 2.5 Goles');
  assert.equal(overPick.odds, null);
  assert.equal(overPick.estimatedOdds, 1.72);
  assert.equal(getEffectiveOdds(overPick), 1.72);

  const bttsPick = getContextualPick(matchNoOdds, 'btts');
  assert.equal(bttsPick.selection, 'Ambos anotan: Sí');
  assert.equal(bttsPick.odds, null);
  assert.equal(bttsPick.estimatedOdds, 1.85);
  assert.equal(getEffectiveOdds(bttsPick), 1.85);
});

test('deriveSeasonPoisson derives over25 and btts probabilities when model is missing', () => {
  const matchWithStats = {
    id: 'match-stats',
    status: 'SCHEDULED',
    homeTeam: { name: 'Team A', gamesPlayed: 10, goalsFor: 25, goalsAgainst: 12 },
    awayTeam: { name: 'Team B', gamesPlayed: 10, goalsFor: 18, goalsAgainst: 15 },
    leagueName: 'Official League'
  };

  const derived = deriveSeasonPoisson(matchWithStats);
  assert.ok(derived);
  assert.ok(derived.over15 > 0);
  assert.ok(derived.over25 > 0);
  assert.ok(derived.bttsYes > 0);

  const contextualOver = getContextualPick(matchWithStats, 'over');
  assert.equal(contextualOver.selection, 'Más de 2.5 Goles');
  assert.equal(contextualOver.probability, derived.over25);
  assert.ok(getEffectiveOdds(contextualOver) > 1);

  const contextualBtts = getContextualPick(matchWithStats, 'btts');
  assert.equal(contextualBtts.selection, 'Ambos anotan: Sí');
  assert.equal(contextualBtts.probability, derived.bttsYes);
  assert.ok(getEffectiveOdds(contextualBtts) > 1);
});

test('getContextualPick gracefully handles invalid or postponed matches', () => {
  assert.equal(getContextualPick(null, 'over'), null);
  assert.equal(getContextualPick({ status: 'POSTPONED' }, 'over'), null);
  assert.equal(getContextualPick({ status: 'CANCELLED' }, 'btts'), null);
});
