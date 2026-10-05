import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMatchSchedule } from '../src/utils/matchSchedule.js';
import { marketQuote, formatOdds } from '../src/utils/oddsFormatter.js';
import { requestSports, sportMatchVersion, readSportDetail, saveSportDetail, readSportsCache, saveSportsCache, mergeSportDetail } from '../src/utils/sportsClient.js';
import { baseballAnalysis, basketballAnalysis } from '../server/services/sportProbabilityModel.js';
import { publishedMlbOdds, oddsFor } from '../server/services/sportsDataService.js';

test('day and time share the viewer zone, date rollover is correct, and missing hours stay unconfirmed', () => {
  const utc = '2026-10-06T01:00:00Z';
  assert.match(formatMatchSchedule(utc, { timeZone: 'America/Santiago' }), /lun.*5 oct.*22:00/);
  assert.match(formatMatchSchedule(utc, { timeZone: 'Asia/Tokyo' }), /mar.*6 oct.*10:00/);
  assert.match(formatMatchSchedule(utc, { timeZone: 'Asia/Tokyo', timeTBD: true }), /6 oct.*Hora por confirmar/);
  for (const value of [null, undefined, '', 'invalid']) assert.equal(formatMatchSchedule(value), 'Fecha por confirmar');
});

test('published offers have priority and theoretical odds never masquerade as bookmaker prices', () => {
  assert.deepEqual(marketQuote('1,80', 54), { odds: 1.8, kind: 'published', label: 'Publicado' });
  assert.deepEqual(marketQuote(null, 50), { odds: 2, kind: 'theoretical', label: 'Teórico' });
  assert.equal(formatOdds(marketQuote(null, 80).odds, 'american'), '-400');
  assert.equal(formatOdds(marketQuote(null, 20).odds, 'american'), '+400');
  for (const value of [null, undefined, NaN, Infinity, 0, 100, -1, 101, '50']) assert.equal(marketQuote(null, value).kind, 'unavailable');
  assert.equal(marketQuote(2.2, null).kind, 'published', 'A real quote remains available even without a model sample');
});

test('MLB bookmaker quotes require exact teams, orientation and start time, including doubleheader safeguards', () => {
  const match = { homeTeam: { name: 'Cleveland Guardians' }, awayTeam: { name: 'Chicago White Sox' }, kickoff: '2026-10-05T21:00:00Z' };
  const comp = { competitors: ['home', 'away'].map(side => ({ homeAway: side, team: { displayName: match[`${side}Team`].name } })),
    odds: [{ provider: { name: 'Proveedor de prueba' }, moneyline: { home: { close: { odds: '-125' } }, away: { close: { odds: '+115' } } } }] };
  const event = { id: 'quoted-event', date: match.kickoff, competitions: [comp] };
  const result = publishedMlbOdds(match, { events: [event] }, '2026-10-05T20:00:00Z');
  assert.equal(result.odds.homeWin, 1.8); assert.equal(result.odds.awayWin, 2.15);
  assert.equal(result.oddsProvider, 'Proveedor de prueba'); assert.match(result.oddsSourceUrl, /quoted-event$/);
  assert.deepEqual(publishedMlbOdds(match, { events: [event, event] }), {});
  assert.deepEqual(publishedMlbOdds(match, { events: [{ ...event, date: '2026-10-05T22:00:00Z' }] }), {});
  assert.deepEqual(publishedMlbOdds({ ...match, homeTeam: match.awayTeam, awayTeam: match.homeTeam }, { events: [event] }), {});
  assert.deepEqual(publishedMlbOdds({ ...match, homeTeam: {} }, { events: [event] }), {});
  assert.equal(oddsFor({}).odds.homeWin, null);
});

test('recent form uses five unique completed earlier results in the same league and correct home/away scores', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  for (const sport of ['beisbol', 'basquetbol']) {
    const match = { id: 'target', sport, leagueId: 'league', kickoff: new Date(now + 3600000).toISOString(), status: 'SCHEDULED', homeTeam: { id: 'a' }, awayTeam: { id: 'b' } };
    const games = Array.from({ length: 7 }, (_, i) => ({ ...match, id: `game-${i}`, status: 'FINISHED', kickoff: new Date(now - (i + 1) * 86400000).toISOString(),
      finalScore: { home: i % 3 + 1, away: 2 }, sourceUrl: `https://example.invalid/game-${i}` }));
    const ignored = [{ ...games[0], id: match.id }, { ...games[0], id: 'future', kickoff: new Date(now + 86400000).toISOString() }, { ...games[0], id: 'live', status: 'LIVE' }, { ...games[0], id: 'other', leagueId: 'other' }, { ...games[0], id: 'unknown', finalScore: { home: null, away: 2 } }];
    const analysis = (sport === 'beisbol' ? baseballAnalysis : basketballAnalysis)(match, [...games, games[0], ...ignored], now);
    assert.deepEqual(analysis.form.home.map(record => record.id), ['game-4', 'game-3', 'game-2', 'game-1', 'game-0']);
    assert.deepEqual(analysis.form.home.map(record => record.result), ['D', 'L', 'W', 'D', 'L']);
    assert.deepEqual(analysis.form.away.map(record => record.result), ['D', 'W', 'L', 'D', 'W']);
    assert.equal(analysis.sampleSize.home, 7);
    assert.equal(analysis.form.home[4].sourceUrl, games[0].sourceUrl);
  }
});

test('a hung provider ends with a retryable timeout, and cancellation stays cancellation', async t => {
  t.mock.method(globalThis, 'fetch', (url, { signal }) => new Promise((resolve, reject) => {
    if (signal.aborted) reject(new DOMException('Cancelled', 'AbortError'));
    signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
  }));
  await assert.rejects(requestSports('/test', { timeoutMs: 20 }), /demoró demasiado/);
  const controller = new AbortController();
  const request = requestSports('/test', { signal: controller.signal, timeoutMs: 1000 });
  controller.abort();
  await assert.rejects(request, { name: 'AbortError' });
});

test('sports caches are session-scoped and late reports cannot replace a changed score, date or quote', () => {
  const original = { id: 'game', kickoff: '2026-10-05T21:00:00Z', status: 'LIVE', liveScore: { home: 1, away: 2 }, odds: {} };
  const detail = { ...original, odds: { homeWin: 1.8 }, analysis: { winner: { home: 55, away: 45 } } };
  saveSportsCache('account-a', 'beisbol', { matches: [original], coverage: [] });
  assert.equal(readSportsCache('account-b', 'beisbol'), null);
  saveSportDetail('account-a', 'beisbol', original, detail);
  assert.equal(readSportDetail('account-b', 'beisbol', original), null);
  assert.equal(readSportDetail('account-a', 'beisbol', original).analysis.winner.home, 55);
  assert.equal(readSportDetail('account-a', 'beisbol', detail).analysis.winner.home, 55);
  for (const changed of [{ ...original, liveScore: { home: 2, away: 2 } }, { ...original, kickoff: '2026-10-06T21:00:00Z' }, { ...original, odds: { homeWin: 2.4 } }]) {
    assert.notEqual(sportMatchVersion(changed), sportMatchVersion(original));
    assert.equal(readSportDetail('account-a', 'beisbol', changed), null);
    assert.deepEqual(mergeSportDetail(changed, original, detail), changed);
  }
});
