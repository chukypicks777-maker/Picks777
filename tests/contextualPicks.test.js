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

test('getContextualPick returns null when probability is under 50% without falling back to banker pick', () => {
  const matchLowOver = {
    id: 'match-low-over',
    status: 'SCHEDULED',
    homeTeam: { name: 'Team A', shortName: 'TMA' },
    awayTeam: { name: 'Team B', shortName: 'TMB' },
    probabilities: {
      over15: 75,
      over25: 42,
      bttsYes: 38,
      under25: 58
    },
    odds: {
      over15: 1.30,
      over25: 2.20,
      under25: 1.65,
      bttsYes: 2.30
    },
    leagueName: 'Premier League'
  };

  // When asking for 'over', 42% is < 50%, MUST return null, NEVER Over 1.5!
  const overPick = getContextualPick(matchLowOver, 'over');
  assert.equal(overPick, null, 'Must return null when over25 is under 50%, not fallback to 1.5');

  // When asking for 'btts', 38% is < 50%, MUST return null, NEVER Over 1.5!
  const bttsPick = getContextualPick(matchLowOver, 'btts');
  assert.equal(bttsPick, null, 'Must return null when bttsYes is under 50%');

  // When asking for 'under', 58% is >= 50%, MUST return Menos de 2.5 Goles!
  const underPick = getContextualPick(matchLowOver, 'under');
  assert.ok(underPick);
  assert.equal(underPick.key, 'under25');
  assert.equal(underPick.selection, 'Menos de 2.5 Goles');
  assert.equal(underPick.probability, 58);
  assert.equal(underPick.odds, 1.65);

  // When asking for 'all', banker pick (Over 1.5) is returned
  const allPick = getContextualPick(matchLowOver, 'all');
  assert.equal(allPick.selection, 'Más de 1.5 Goles');
});

test('getContextualPick derives over25 and btts from published odds when model probabilities are absent', () => {
  const matchOnlyOdds = {
    id: 'match-only-odds',
    status: 'SCHEDULED',
    homeTeam: { name: 'Team X', shortName: 'TMX' },
    awayTeam: { name: 'Team Y', shortName: 'TMY' },
    probabilities: {},
    odds: {
      over25: 1.60,
      under25: 2.40,
      bttsYes: 1.55,
      bttsNo: 2.50
    },
    leagueName: 'LaLiga'
  };

  const overPick = getContextualPick(matchOnlyOdds, 'over');
  assert.ok(overPick);
  assert.equal(overPick.selection, 'Más de 2.5 Goles');
  assert.equal(overPick.odds, 1.60);
  assert.ok(overPick.probability >= 50);

  const bttsPick = getContextualPick(matchOnlyOdds, 'btts');
  assert.ok(bttsPick);
  assert.equal(bttsPick.selection, 'Ambos anotan: Sí');
  assert.equal(bttsPick.odds, 1.55);
  assert.ok(bttsPick.probability >= 50);
});

test('getContextualPick gracefully handles invalid or postponed matches', () => {
  assert.equal(getContextualPick(null, 'over'), null);
  assert.equal(getContextualPick({ status: 'POSTPONED' }, 'over'), null);
  assert.equal(getContextualPick({ status: 'CANCELLED' }, 'btts'), null);
});
