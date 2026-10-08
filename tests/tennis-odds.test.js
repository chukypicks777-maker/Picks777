import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTennisRatings } from '../server/services/tennisRatings.js';
import { tennisAnalysis, calibrateTennis } from '../server/services/sportProbabilityModel.js';
import { loadTennisQuotes, attachTennisQuotes, bestQuote, forgetOddsApi } from '../server/services/oddsApi.js';

const NOW = Date.parse('2026-10-07T12:00:00Z'), HOUR = 3600000;
const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
const history = Array.from({ length: 240 }, (_, i) => {
  const h = players[i % 6], a = players[(i + 1 + (i % 4)) % 6];
  const homeWins = players.indexOf(h) < players.indexOf(a) ? i % 5 !== 0 : i % 5 === 0;
  return { id: `g${i}`, sport: 'tenis', tour: 'atp', status: 'FINISHED', kickoff: new Date(NOW - (240 - i) * 6 * HOUR).toISOString(), homeTeam: { id: h }, awayTeam: { id: a },
    finalScore: homeWins ? { home: 2, away: 0 } : { home: 0, away: 2 }, setScores: homeWins ? [{ home: 6, away: 3 }, { home: 6, away: 4 }] : [{ home: 3, away: 6 }, { home: 4, away: 6 }] };
}).filter(game => game.homeTeam.id !== game.awayTeam.id);
const upcoming = { id: 'next', sport: 'tenis', tour: 'atp', status: 'SCHEDULED', kickoff: new Date(NOW + 5 * HOUR).toISOString(), maxSets: 3,
  homeTeam: { id: 'p1', name: 'Adolfo Daniel Vallejo' }, awayTeam: { id: 'p6', name: 'Valentín Royer' }, odds: {} };

test('stored tennis ratings reproduce the history replay, are calibrated and never forecast already-rated results', () => {
  const ratings = buildTennisRatings('atp', history, NOW);
  assert.ok(JSON.stringify(ratings).length < 2000, 'Only a few numbers per player are stored');
  const replayed = tennisAnalysis(upcoming, history, NOW), stored = tennisAnalysis(upcoming, [], NOW, ratings);
  assert.deepEqual(stored.winner, replayed.winner);
  assert.ok(stored.winner.home > 50 && stored.winner.home < 90);
  assert.equal(stored.probabilitySource, 'experimental-model');
  // Calibration moderates favourites but keeps the side.
  assert.ok(calibrateTennis(0.8, 'atp') < 0.8 && calibrateTennis(0.8, 'atp') > 0.5);
  const old = { ...upcoming, id: 'g10', status: 'FINISHED', kickoff: history[10].kickoff };
  assert.equal(tennisAnalysis(old, [], NOW, ratings).winner.home, null, 'A result inside the ratings is not re-forecast with them');
});

test('real bookmaker quotes attach only to an unambiguous match and drive the winner when present', async t => {
  const previous = process.env.ODDS_API_KEY;
  t.after(() => { if (previous === undefined) delete process.env.ODDS_API_KEY; else process.env.ODDS_API_KEY = previous; forgetOddsApi(); });
  delete process.env.ODDS_API_KEY; forgetOddsApi();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('No requests without a key'); });
  assert.equal(await loadTennisQuotes('atp'), null);
  assert.equal(calls, 0);

  process.env.ODDS_API_KEY = 'a'.repeat(32); forgetOddsApi();
  const event = { home_team: 'Valentin Royer', away_team: 'Adolfo Daniel Vallejo', commence_time: new Date(NOW + 4 * HOUR).toISOString(), bookmakers: [
    { key: 'bet365', title: 'Bet365', markets: [{ key: 'h2h', outcomes: [{ name: 'Valentin Royer', price: 2.05 }, { name: 'Adolfo Daniel Vallejo', price: 1.72 }] }] },
    { key: 'pinnacle', title: 'Pinnacle', last_update: '2026-10-07T11:00:00Z', markets: [{ key: 'h2h', outcomes: [{ name: 'Valentin Royer', price: 2.1 }, { name: 'Adolfo Daniel Vallejo', price: 1.79 }] }] }] };
  const urls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    urls.push(String(url));
    if (String(url).includes('/sports?')) return new Response(JSON.stringify([{ key: 'tennis_atp_shanghai_masters', active: true }, { key: 'tennis_wta_wuhan_open', active: true }]));
    return new Response(JSON.stringify([event]), { headers: { 'x-requests-remaining': '480' } });
  });
  const snapshot = await loadTennisQuotes('atp');
  assert.equal(urls.filter(url => url.includes('/odds')).length, 1, 'One credit for the one active ATP tournament');
  assert.equal(bestQuote(event).key, 'pinnacle');
  await loadTennisQuotes('atp');
  assert.equal(urls.length, 2, 'A fresh snapshot is reused without spending credits');

  const [priced] = attachTennisQuotes([upcoming], snapshot);
  assert.deepEqual([priced.odds.homeWin, priced.odds.awayWin], [1.79, 2.1], 'Orientation follows the ESPN home and away players');
  assert.equal(priced.oddsProvider, 'Pinnacle · The Odds API');
  const analysis = tennisAnalysis(priced, history, NOW);
  assert.equal(analysis.probabilitySource, 'published-odds');
  assert.equal(analysis.winner.home, Math.round((1 / 1.79) / (1 / 1.79 + 1 / 2.1) * 1000) / 10);
  // Wrong players, a distant date or two candidate events never receive a price.
  assert.equal(attachTennisQuotes([{ ...upcoming, awayTeam: { name: 'Otro Jugador' } }], snapshot)[0].odds.homeWin, undefined);
  assert.equal(attachTennisQuotes([{ ...upcoming, kickoff: new Date(NOW + 72 * HOUR).toISOString() }], snapshot)[0].odds.homeWin, undefined);
  assert.equal(attachTennisQuotes([upcoming], { ...snapshot, events: [...snapshot.events, ...snapshot.events] })[0].odds.homeWin, undefined);
});

test('ATP combines Elo, official ranking points and the head-to-head record; WTA keeps calibrated Elo', () => {
  const base = buildTennisRatings('atp', history, NOW);
  const met = base.h2h['p1|p2'];
  assert.ok(met && met[0] + met[1] > 0, 'Head-to-head wins are kept per pair');
  const even = tennisAnalysis(upcoming, [], NOW, { ...base, rankings: { points: { p1: 1000, p6: 1000 }, floor: 300 } }).winner.home;
  const ranking = { points: { p1: 2000, p6: 500 }, floor: 300 };
  const ranked = tennisAnalysis(upcoming, [], NOW, { ...base, rankings: ranking });
  assert.ok(ranked.winner.home > even, 'A much better ranked player gains probability');
  assert.deepEqual(ranked.rankingPoints, { home: 2000, away: 500 });
  const swapped = tennisAnalysis(upcoming, [], NOW, { ...base, rankings: { points: { p1: 500, p6: 2000 }, floor: 300 } });
  assert.ok(swapped.winner.home < even);
  assert.deepEqual(ranked.headToHead, { home: 0, away: 0 }, 'p1 and p6 never met');
  const rival = tennisAnalysis({ ...upcoming, awayTeam: { id: 'p2', name: 'Rival' } }, [], NOW, { ...base, rankings: ranking });
  assert.deepEqual(rival.headToHead, { home: met[0], away: met[1] });
  // An unlisted player uses the published floor; WTA ignores ATP-only signals.
  assert.equal(tennisAnalysis(upcoming, [], NOW, { ...base, rankings: { points: { p1: 2000 }, floor: 300 } }).rankingPoints.away, 300);
  const wta = buildTennisRatings('wta', history.map(game => ({ ...game, tour: 'wta' })), NOW);
  assert.equal(wta.h2h, undefined);
  assert.equal(tennisAnalysis({ ...upcoming, tour: 'wta' }, [], NOW, { ...wta, rankings: ranking }).rankingPoints, null);
});
