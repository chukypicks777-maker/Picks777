import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTennisRatings } from '../server/services/tennisRatings.js';
import { tennisAnalysis, calibrateTennis, tennisFeatureProbability, TENNIS_WEIGHTS } from '../server/services/sportProbabilityModel.js';
import { loadTennisQuotes, attachTennisQuotes, bestQuote, forgetOddsApi, samePlayer } from '../server/services/oddsApi.js';
import { kalshiQuote, loadKalshiTennis, forgetKalshi, KALSHI_WINDOW_HOURS } from '../server/services/kalshiOdds.js';

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

test('real bookmaker quotes attach only to an unambiguous match and never replace the model percentages', async t => {
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
  assert.equal(analysis.probabilitySource, 'experimental-model');
  assert.deepEqual(analysis.winner, tennisAnalysis(upcoming, history, NOW).winner, 'The percentage is the app model, not the bookmaker');
  // Wrong players, a distant date or two candidate events never receive a price.
  assert.equal(attachTennisQuotes([{ ...upcoming, awayTeam: { name: 'Otro Jugador' } }], snapshot)[0].odds.homeWin, undefined);
  assert.equal(attachTennisQuotes([{ ...upcoming, kickoff: new Date(NOW + 72 * HOUR).toISOString() }], snapshot)[0].odds.homeWin, undefined);
  assert.equal(attachTennisQuotes([upcoming], { ...snapshot, events: [...snapshot.events, ...snapshot.events] })[0].odds.homeWin, undefined);
});

test('ATP and WTA combine Elo, game-share rating, official ranking points and head-to-head, without prices', () => {
  const base = buildTennisRatings('atp', history, NOW);
  const met = base.h2h['p1|p2'];
  assert.ok(met && met[0] + met[1] > 0, 'Head-to-head wins are kept per pair');
  assert.ok(Object.values(base.players).every(entry => Number.isFinite(entry[5])), 'Every player has a game-share rating');
  // p1 dominates its games more than p6 in the replay.
  assert.ok(base.players.p1[5] > base.players.p6[5]);
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
  // The formula reproduces the documented weights.
  const manual = tennisFeatureProbability('atp', { eloChance: 0.6, gameGap: 40, pointsRatio: 2, homeWins: 1, awayWins: 0 });
  const w = TENNIS_WEIGHTS.atp;
  assert.ok(Math.abs(manual - 1 / (1 + Math.exp(-(w.elo * Math.log(1.5) + w.games * 0.1 * Math.LN10 + w.rank * Math.log(2) + w.h2h / 3)))) < 1e-12);
  // An unlisted player uses the published floor; WTA now uses its own ranking and head-to-head too.
  assert.equal(tennisAnalysis(upcoming, [], NOW, { ...base, rankings: { points: { p1: 2000 }, floor: 300 } }).rankingPoints.away, 300);
  const wta = buildTennisRatings('wta', history.map(game => ({ ...game, tour: 'wta' })), NOW, ranking);
  assert.ok(wta.h2h['p1|p2']);
  const women = tennisAnalysis({ ...upcoming, tour: 'wta' }, [], NOW, wta);
  assert.deepEqual(women.rankingPoints, { home: 2000, away: 500 });
  assert.match(women.method, /ranking WTA/);
  // Without a ranking list the calibrated Elo remains the fallback.
  assert.equal(tennisAnalysis(upcoming, [], NOW, base).rankingPoints, null);
  assert.ok(tennisAnalysis(upcoming, [], NOW, base).winner.home > 50);
});

const kalshiEvent = (home, away, homeBook, awayBook, extra = {}) => ({ event_ticker: `E-${home}`, title: `${home} vs ${away}`, markets: [
  { status: 'active', yes_sub_title: home, yes_bid_dollars: String(homeBook[0]), yes_ask_dollars: String(homeBook[1]), occurrence_datetime: new Date(NOW - 40 * HOUR).toISOString(), updated_time: '2026-10-07T10:00:00Z' },
  { status: 'active', yes_sub_title: away, yes_bid_dollars: String(awayBook[0]), yes_ask_dollars: String(awayBook[1]), occurrence_datetime: new Date(NOW - 40 * HOUR).toISOString(), updated_time: '2026-10-07T11:00:00Z' }], ...extra });

test('Kalshi exchange prices: only tight two-way books, names in either order, never stored in Redis', async t => {
  t.after(() => { process.env.KALSHI_TENNIS_ODDS = 'off'; forgetKalshi(); });
  // Real case: Shelton 0.87/0.88 against Altmaier 0.12/0.13 (Playdoit: -1000 / +600).
  const quote = kalshiQuote(kalshiEvent('Ben Shelton', 'Daniel Altmaier', [0.87, 0.88], [0.12, 0.13]));
  assert.deepEqual([quote.homePrice, quote.awayPrice], [1.1364, 7.6923], 'Decimal price = 1 / ask of each YES contract');
  assert.equal(quote.lastUpdate, '2026-10-07T11:00:00Z');
  assert.equal(kalshiQuote(kalshiEvent('A B', 'C D', [0.5, 0.62], [0.4, 0.45])), null, 'A wide spread is not a price');
  assert.equal(kalshiQuote(kalshiEvent('A B', 'C D', [0, 0.9], [0.05, 0.1])), null, 'A side without bids is not a price');
  assert.equal(kalshiQuote(kalshiEvent('A B', 'C D', [0.6, 0.62], [0.5, 0.52])), null, 'An incoherent book (114%) is skipped');
  assert.equal(kalshiQuote({ markets: [kalshiEvent('A B', 'C D', [0.5, 0.52], [0.47, 0.49]).markets[0]] }), null);
  assert.ok(samePlayer('Bu Yunchaokete', 'Yunchaokete Bu') && samePlayer('Zheng Qinwen', 'Qinwen Zheng'), 'Family name first in one source');
  assert.ok(!samePlayer('Juan Manuel Cerundolo', 'Francisco Cerundolo') && !samePlayer('Bu Yunchaokete', 'Bu Kai'));

  assert.equal(await loadKalshiTennis('atp'), null, 'Disabled in deterministic tests');
  process.env.KALSHI_TENNIS_ODDS = 'on'; forgetKalshi();
  const urls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    urls.push(String(url));
    if (!String(url).startsWith('https://api.elections.kalshi.com/')) throw new Error(`Unexpected request ${url}`);
    return new Response(JSON.stringify({ events: [kalshiEvent('Valentin Royer', 'Adolfo Daniel Vallejo', [0.44, 0.46], [0.54, 0.56]), kalshiEvent('Otro Uno', 'Otro Dos', [0.1, 0.5], [0.5, 0.9])], cursor: '' }));
  });
  const snapshot = await loadKalshiTennis('atp');
  assert.equal(snapshot.events.length, 1, 'The illiquid market is dropped');
  assert.match(urls[0], /series_ticker=KXATPMATCH/);
  await loadKalshiTennis('atp');
  assert.equal(urls.length, 1, 'Instance memory serves repeated requests');
  assert.ok(!urls.some(url => url.includes('redis') || url.includes('upstash')));

  const [priced] = attachTennisQuotes([upcoming], snapshot, KALSHI_WINDOW_HOURS);
  assert.deepEqual([priced.odds.homeWin, priced.odds.awayWin], [1.7857, 2.1739], 'Orientation follows the ESPN players');
  assert.equal(priced.oddsProvider, 'Kalshi');
  assert.equal(priced.oddsSource, 'Kalshi');
  assert.equal(tennisAnalysis(priced, history, NOW).probabilitySource, 'experimental-model', 'Kalshi is shown as the momio only');
  assert.equal(attachTennisQuotes([upcoming], snapshot)[0].odds.homeWin, undefined, 'Kalshi dates are loose: only its own wider window pairs them');
  const bookmaker = { ...upcoming, odds: { homeWin: 1.8, awayWin: 2.05 }, oddsProvider: 'Pinnacle · The Odds API' };
  assert.equal(attachTennisQuotes([bookmaker], snapshot, KALSHI_WINDOW_HOURS)[0].oddsProvider, 'Pinnacle · The Odds API', 'A bookmaker price is never replaced');
  assert.equal(attachTennisQuotes([{ ...upcoming, status: 'LIVE' }], snapshot, KALSHI_WINDOW_HOURS)[0].odds.homeWin, undefined, 'Live prices are never attached');
});
