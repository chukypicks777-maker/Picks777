import test from 'node:test';
import assert from 'node:assert/strict';
import { ratedRuns } from '../server/services/baseballRatings.js';
import { ratedMargin, BASKETBALL_RATINGS } from '../server/services/basketballRatings.js';
import { historyRows, recentMonths, loadBasketballHistory, forgetBasketballHistory } from '../server/services/basketballHistory.js';
import { baseballAnalysis, basketballAnalysis, analyzeSportMatch } from '../server/services/sportProbabilityModel.js';

const NOW = Date.parse('2026-10-07T12:00:00Z'), HOUR = 3600000, DAY = 24 * HOUR;
const teams = ['t1', 't2', 't3', 't4', 't5', 't6'];
// Real-looking results where t1 is clearly the strongest side and t6 the weakest.
const schedule = (count, score) => Array.from({ length: count }, (_, i) => {
  const home = teams[i % 6], away = teams[(i + 1 + (i % 5)) % 6];
  return { i, home, away, ...score(teams.indexOf(home), teams.indexOf(away), i) };
}).filter(game => game.home !== game.away);

test('baseball run ratings favour the stronger side, price extra innings and never use the forecast game', () => {
  const games = schedule(240, (h, a, i) => ({ hv: 6 - h + (i % 3), av: 6 - a + ((i + 1) % 3) })).map(game => ({
    id: `mlb-${game.i}`, sport: 'beisbol', leagueId: 'mlb', status: 'FINISHED', kickoff: new Date(NOW - (240 - game.i) * 8 * HOUR).toISOString(),
    homeTeam: { id: game.home }, awayTeam: { id: game.away }, finalScore: { home: game.hv, away: game.av } }));
  const match = { id: 'mlb-next', sport: 'beisbol', leagueId: 'mlb', status: 'SCHEDULED', kickoff: new Date(NOW + 5 * HOUR).toISOString(),
    homeTeam: { id: 't1', name: 'Uno' }, awayTeam: { id: 't6', name: 'Seis' }, odds: {}, scheduledInnings: 9 };
  const rated = ratedRuns(match, games, NOW);
  assert.ok(rated.expected.home > rated.expected.away);
  assert.ok(rated.full.home > rated.full.away && rated.regulationTie > 0.02 && rated.regulationTie < 0.2);
  const analysis = baseballAnalysis(match, games, NOW);
  assert.ok(analysis.winner.home > 60 && analysis.ratingSample.home >= 5);
  assert.match(analysis.method, /ajustados por rival/);
  assert.ok(Number.isFinite(analysis.extraInnings.yes));
  // A finished copy of the fixture with an absurd score does not change its own forecast.
  const leaked = [...games, { ...match, status: 'FINISHED', finalScore: { home: 30, away: 0 } }];
  assert.deepEqual(baseballAnalysis({ ...match }, leaked, NOW).winner, analysis.winner);
  // Published moneylines are only the momio, even when they favour the other side:
  // the winner, team runs and totals come from one distribution and agree.
  const priced = baseballAnalysis({ ...match, odds: { homeWin: 2.2, awayWin: 1.7 } }, games, NOW);
  assert.equal(priced.probabilitySource, 'experimental-model');
  assert.deepEqual(priced.winner, analysis.winner);
  assert.ok(priced.expectedRuns.home > priced.expectedRuns.away);
  for (const line of [1.5, 2.5, 3.5]) {
    const over = side => priced.teamRuns[side].find(row => row.line === line).over;
    assert.ok(over('home') > over('away'), 'The favourite also scores more often over ' + line);
  }
});

test('reported White Sox case: the side with more expected runs is always the baseball favourite', () => {
  // Any two teams: the winner share and the per-team run lines never contradict each other.
  const games = schedule(240, (h, a, i) => ({ hv: 4 + (i % 4) - (h === 't2' ? 1 : 0), av: 4 + ((i + 1) % 4) - (a === 't2' ? 1 : 0) })).map(game => ({
    id: 'mlb-wsx-' + game.i, sport: 'beisbol', leagueId: 'mlb', status: 'FINISHED', kickoff: new Date(NOW - (240 - game.i) * 8 * HOUR).toISOString(),
    homeTeam: { id: game.home }, awayTeam: { id: game.away }, finalScore: { home: game.hv, away: game.av } }));
  for (const [home, away] of [['t1', 't2'], ['t2', 't1'], ['t3', 't4'], ['t5', 't6'], ['t6', 't3']]) {
    const fixture = { id: 'mlb-' + home + '-' + away, sport: 'beisbol', leagueId: 'mlb', status: 'SCHEDULED', kickoff: new Date(NOW + 5 * HOUR).toISOString(),
      homeTeam: { id: home, name: home }, awayTeam: { id: away, name: away }, odds: { homeWin: 1.95, awayWin: 1.87 }, scheduledInnings: 9 };
    const a = baseballAnalysis(fixture, games, NOW);
    const favourite = a.winner.home >= a.winner.away ? 'home' : 'away', other = favourite === 'home' ? 'away' : 'home';
    assert.ok(a.expectedRuns[favourite] >= a.expectedRuns[other], home + '-' + away + ': favourite expects more runs');
    assert.ok(a.teamRuns[favourite].find(row => row.line === 2.5).over >= a.teamRuns[other].find(row => row.line === 2.5).over);
  }
});

const basketballHistoryRows = schedule(300, (h, a, i) => ({ hv: 118 - 3 * h + (i % 7), av: 112 - 3 * a + ((i + 3) % 7) }))
  .map(game => [`espn-nba-${game.i}`, Math.round((NOW - (300 - game.i) * DAY / 2) / 1000), game.home, game.away, game.hv, game.av]);
const history = { version: BASKETBALL_RATINGS.version, leagueId: 'nba', builtAt: NOW - HOUR, rows: basketballHistoryRows };
const nbaMatch = { id: 'espn-nba-next', sport: 'basquetbol', leagueId: 'nba', status: 'SCHEDULED', kickoff: new Date(NOW + 6 * HOUR).toISOString(),
  homeTeam: { id: 't1', name: 'Uno' }, awayTeam: { id: 't6', name: 'Seis' }, odds: {} };

test('NBA points ratings drive winner and handicaps, published prices keep the winner, and late results are excluded', () => {
  const rated = ratedMargin(nbaMatch, [], history, NOW);
  assert.ok(rated.margin > 5 && rated.deviation === 14.1);
  const analysis = basketballAnalysis(nbaMatch, [], NOW, history);
  assert.ok(analysis.winner.home > 60 && analysis.ratingSample.home >= 5);
  const covers = analysis.handicaps.home.filter(row => row.line > 0).map(row => row.probability);
  assert.deepEqual(covers, [...covers].sort((a, b) => a - b), 'More points received never lowers the cover probability');
  assert.equal(analyzeSportMatch(nbaMatch, [], NOW, { basketballHistory: { nba: history } }).winner.home, analysis.winner.home);
  const priced = basketballAnalysis({ ...nbaMatch, odds: { homeWin: 1.5, awayWin: 2.75 } }, [], NOW, history);
  assert.equal(priced.probabilitySource, 'published-odds');
  assert.equal(priced.winner.home, 64.7);
  // Results of games that began less than three hours before (or after) this one are ignored.
  const late = [{ ...nbaMatch, id: 'espn-nba-late', kickoff: new Date(NOW + 4 * HOUR).toISOString(), status: 'FINISHED', homeTeam: { id: 't6' }, awayTeam: { id: 't1' }, finalScore: { home: 160, away: 60 } }];
  assert.equal(ratedMargin(nbaMatch, late, history, NOW + 7 * HOUR).margin, ratedMargin(nbaMatch, [], history, NOW + 7 * HOUR).margin);
  const earlier = [{ ...late[0], id: 'espn-nba-earlier', kickoff: new Date(NOW + 2 * HOUR).toISOString() }];
  assert.notEqual(ratedMargin(nbaMatch, earlier, history, NOW + 7 * HOUR).margin, ratedMargin(nbaMatch, [], history, NOW + 7 * HOUR).margin, 'A game that began three hours earlier does count');
  // Other competitions keep the last-20-games method.
  assert.equal(basketballAnalysis({ ...nbaMatch, leagueId: 'ncaaw' }, [], NOW, history).ratingSample, undefined);
  assert.equal(basketballAnalysis(nbaMatch, [], NOW, null).ratingSample, undefined);
});

test('basketball history keeps only finished regular-season and playoff results and is built without blocking members', async t => {
  const event = (id, type, completed, home = '110', away = { value: 100 }) => ({ id, date: '2026-04-01T23:00Z', season: { type },
    competitions: [{ status: { type: { completed } }, competitors: [{ homeAway: 'home', team: { id: '1' }, score: home }, { homeAway: 'away', team: { id: '2' }, score: away }] }] });
  assert.deepEqual(historyRows({ events: [event('a', 2, true), event('b', 1, true), event('c', 3, true), event('d', 2, false), event('e', 2, true, 'x')] }, 'nba').map(row => row[0]),
    ['espn-nba-a', 'espn-nba-c']);
  assert.deepEqual(recentMonths(Date.parse('2026-01-15T00:00Z'), 3), ['202601', '202512', '202511']);

  forgetBasketballHistory();
  t.after(forgetBasketballHistory);
  const requested = [];
  t.mock.method(globalThis, 'fetch', async url => {
    requested.push(String(url));
    return new Response(JSON.stringify({ events: [event(`m${requested.length}`, 2, true)] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  assert.equal(await loadBasketballHistory('ncaaw'), null, 'Only validated leagues are rated');
  assert.equal(await loadBasketballHistory('wnba'), null, 'The first request is answered by the fallback model');
  for (let i = 0; i < 50 && requested.length < 13; i++) await new Promise(resolve => setTimeout(resolve, 5));
  await new Promise(resolve => setTimeout(resolve, 5));
  const built = await loadBasketballHistory('wnba');
  assert.equal(requested.length, 13);
  assert.ok(requested.every(url => url.startsWith('https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard?dates=') && url.endsWith('&limit=1000')));
  assert.equal(built.leagueId, 'wnba');
  assert.equal(built.rows.length, 13);
});
