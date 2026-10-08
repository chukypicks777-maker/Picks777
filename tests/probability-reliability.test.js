import test from 'node:test';
import assert from 'node:assert/strict';
import { countForecast, countLines, combinedCount } from '../server/services/baseballCountModel.js';
import { baseballAnalysis, marketWinner } from '../server/services/sportProbabilityModel.js';
import { getSportsFeed, getSportsBankerCandidates, getSportsMatch, oddsFor } from '../server/services/sportsDataService.js';
import { sportWinnerPick } from '../src/utils/sportPicks.js';

test('published -138/+114 prices are only the momio: history favouring Brewers keeps Brewers as the model pick', () => {
  const now = Date.now();
  const match = { id: 'padres-brewers', sport: 'beisbol', leagueId: 'regression', status: 'SCHEDULED', kickoff: new Date(now + 3600000).toISOString(),
    homeTeam: { id: 'padres', name: 'San Diego Padres' }, awayTeam: { id: 'brewers', name: 'Milwaukee Brewers' }, odds: { homeWin: 1 + 100 / 138, awayWin: 2.14 } };
  const games = Array.from({ length: 10 }, (_, i) => ({ ...match, id: `loss-${i}`, status: 'FINISHED', kickoff: new Date(now - (i + 1) * 86400000).toISOString(), finalScore: { home: 1, away: 10 } }));
  const result = baseballAnalysis(match, games, now);
  assert.ok(result.winner.home < 50);
  assert.equal(result.probabilitySource, 'experimental-model');
  assert.deepEqual(result.winner, baseballAnalysis({ ...match, odds: {} }, games, now).winner, 'Prices never change the percentages');
  const pick = sportWinnerPick({ ...match, analysis: result });
  assert.equal(pick.teamId, 'brewers');
  assert.equal(pick.oddsKind, 'published');
  assert.equal(pick.odds, 2.14, 'The momio of the model pick is the published price of that side');
  assert.equal(baseballAnalysis(match, [], now).winner.home, null, 'Prices alone never produce a percentage');
  assert.equal(baseballAnalysis(match, [], now).firstFive[0].over, null, 'Winner prices cannot invent innings markets');
});

test('unrelated quote snapshots and incomplete prices never manufacture a market probability', () => {
  const quote = oddsFor({ odds: [{ moneyline: { home: { close: { odds: '-138' } } }, awayTeamOdds: { moneyLine: 114 } }] });
  assert.equal(quote.odds.awayWin, null);
  assert.equal(marketWinner(quote.odds), null);
  for (const odds of [{ homeWin: 1.7 }, { homeWin: null, awayWin: 2 }, { homeWin: 1, awayWin: 2 }, { homeWin: Infinity, awayWin: 2 }]) assert.equal(marketWinner(odds), null);
});

test('baseball count predictions account for observed variance and finite samples, without clipping probabilities', () => {
  const volatile = countForecast([0, 0, 0, 0, 5], [0, 0, 0, 0, 5]);
  assert.equal(volatile.mean, 1);
  assert.equal(volatile.variance, 5.5);
  assert.ok(Math.abs(volatile.mass[0] - (2 / 11) ** (2 / 9)) < 1e-12);
  const mass = volatile.mass.reduce((sum, value) => sum + value, 0);
  const mean = volatile.mass.reduce((sum, value, k) => sum + k * value, 0);
  const variance = volatile.mass.reduce((sum, value, k) => sum + (k - mean) ** 2 * value, 0);
  assert.ok(Math.abs(mass - 1) < 1e-10);
  assert.ok(Math.abs(mean - 1) < 1e-8);
  assert.ok(Math.abs(variance - 5.5) < 1e-6);
  const small = countForecast(Array(5).fill(4), Array(5).fill(4));
  const large = countForecast(Array(20).fill(4), Array(20).fill(4));
  assert.ok(small.variance > large.variance);
  assert.equal(countForecast(Array(5).fill(4), Array(5).fill(4), 5).variance, 4.8, 'A shared game is not counted twice as independent evidence');
  const wide = countForecast([0, 0, 0, 0, 20], [0, 0, 0, 0, 20]);
  assert.ok(countLines(combinedCount(wide, wide), [2.5])[0].over < countLines(combinedCount(small, small), [2.5])[0].over - 20);
  for (const values of [[], [0, 0, 0, 0, 0], [1, 2, 3, 4], [1, 2, 3, 4, null], [1, 2, 3, 4, -1]]) assert.equal(countForecast(values, values), null);
});

test('duplicated or contradictory inning records are unavailable instead of producing extreme totals', () => {
  const now = Date.now(), match = { id: 'innings-target', sport: 'beisbol', leagueId: 'innings', status: 'SCHEDULED', kickoff: new Date(now + 3600000).toISOString(),
    homeTeam: { id: 'h' }, awayTeam: { id: 'a' } };
  const games = Array.from({ length: 6 }, (_, i) => ({ ...match, id: `innings-${i}`, status: 'FINISHED', kickoff: new Date(now - (i + 1) * 86400000).toISOString(), finalScore: { home: 3, away: 2 },
    inningScores: Array.from({ length: 5 }, (_, k) => ({ num: k + 1, home: k === 0 ? 2 : 0, away: k === 0 ? 1 : 0 })) }));
  assert.ok(baseballAnalysis(match, games, now).firstFive[0].over > 0);
  for (const invalid of [games.map(game => ({ ...game, inningScores: [...game.inningScores, game.inningScores[0]] })),
    games.map(game => ({ ...game, inningScores: game.inningScores.map((inning, i) => ({ ...inning, home: i === 0 ? 20 : 0 })) }))]) {
    const analysis = baseballAnalysis(match, invalid, now);
    assert.equal(analysis.firstInning.home, null);
    assert.ok(analysis.firstFive.every(row => row.over === null && row.under === null));
  }
});

test('MLB calendar, banker ranking and hydrated details share the same model winner and exact published prices', async t => {
  const now = Date.now(), kickoff = new Date(now + 3600000).toISOString();
  const game = (id, date, status, home = 1, away = 10) => ({ gamePk: id, gameDate: date, season: '2026', scheduledInnings: 9,
    status: { abstractGameState: status, detailedState: status === 'Final' ? 'Final' : 'Scheduled' },
    teams: { home: { team: { id: 501, name: 'Regression Padres' }, score: home }, away: { team: { id: 502, name: 'Regression Brewers' }, score: away } },
    linescore: { currentInning: 9, innings: Array.from({ length: 9 }, (_, i) => ({ num: i + 1, home: { runs: i === 0 ? home : 0 }, away: { runs: i === 0 ? away : 0 } })) } });
  const upcoming = game(999001, kickoff, 'Preview');
  const games = [upcoming, ...Array.from({ length: 8 }, (_, i) => game(999100 + i, new Date(now - (i + 1) * 86400000).toISOString(), 'Final'))];
  t.mock.method(globalThis, 'fetch', async url => {
    const address = new URL(url);
    const body = address.hostname === 'statsapi.mlb.com' ? { dates: [{ games }] } : { events: [{ id: 'exact-regression-event', date: kickoff, competitions: [{
      competitors: ['home', 'away'].map(side => ({ homeAway: side, team: { displayName: upcoming.teams[side].team.name } })),
      odds: [{ provider: { name: 'Regression house' }, moneyline: { home: { close: { odds: '-138' } }, away: { close: { odds: '+114' } } } }]
    }] }] };
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  });
  const feed = await getSportsFeed('beisbol', { leagueId: 'mlb', now });
  const pool = await getSportsBankerCandidates('beisbol', { leagueId: 'mlb' });
  const detail = await getSportsMatch('beisbol', 'mlb-mlb-999001', { leagueId: 'mlb' });
  const views = [feed.matches.find(match => match.id === detail.id), pool.matches.find(match => match.id === detail.id), detail];
  for (const match of views) {
    assert.deepEqual(match.analysis.winner, views[0].analysis.winner);
    assert.ok(match.analysis.winner.home < 50, 'Eight 1-10 home defeats make the visitors the model favourite');
    assert.equal(match.analysis.probabilitySource, 'experimental-model');
    assert.equal(match.oddsProvider, 'Regression house');
    assert.deepEqual([match.odds.homeWin, match.odds.awayWin], [views[0].odds.homeWin, views[0].odds.awayWin]);
  }
});
