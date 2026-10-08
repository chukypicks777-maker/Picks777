import test from 'node:test';
import assert from 'node:assert/strict';
import { matchDayKey, scheduleDay, dayKeys } from '../src/utils/matchDay.js';
import { formatFixtureSchedule } from '../src/utils/matchSchedule.js';
import { filterMatches } from '../server/routes/matchRoutes.js';
import { parseTennisEvents, parseBasketballEvent } from '../server/services/sportsDataService.js';
import { sportCardMarkets } from '../src/utils/sportPicks.js';

const MEXICO = 'America/Mexico_City';
// Thursday 8 October 2026, 10:05 in Mexico City (UTC-6).
const NOW = new Date('2026-10-08T16:05:00Z');
const fixture = (id, kickoff, extra = {}) => ({ id, kickoff, status: 'SCHEDULED', leagueId: 'atp', homeTeam: { name: `H${id}` }, awayTeam: { name: `A${id}` }, ...extra });

test('fixtures without a confirmed time keep the provider day instead of moving to the previous evening', () => {
  // ESPN places them at midnight Eastern (04:00Z), 22:00 of the day before in Mexico.
  const saturday = fixture('tbd', '2026-10-10T04:00:00Z', { timeTBD: true, scheduleDate: '2026-10-10' });
  const legacy = fixture('legacy', '2026-10-09T04:00:00Z', { timeTBD: true });
  const tonight = fixture('tonight', '2026-10-09T04:00:00Z');
  assert.equal(matchDayKey(saturday, MEXICO), '2026-10-10');
  assert.equal(matchDayKey(legacy, MEXICO), '2026-10-09', 'Cached fixtures without scheduleDate fall back to the Eastern day');
  assert.equal(scheduleDay(tonight), null);
  assert.equal(matchDayKey(tonight, MEXICO), '2026-10-08', 'A confirmed 22:00 local start is really today');
  assert.deepEqual(dayKeys(NOW, MEXICO), { today: '2026-10-08', tomorrow: '2026-10-09' });
  const ids = (timeframe, now = NOW) => filterMatches([saturday, legacy, tonight], { timeframe, timezone: MEXICO }, now).map(match => match.id);
  assert.deepEqual(ids('today'), ['tonight']);
  assert.deepEqual(ids('tomorrow'), ['legacy']);
  // The next day the Saturday fixture is tomorrow, never "today".
  assert.deepEqual(ids('today', new Date('2026-10-09T16:00:00Z')), ['legacy']);
  assert.deepEqual(ids('tomorrow', new Date('2026-10-09T16:00:00Z')), ['tbd']);
  assert.match(formatFixtureSchedule(saturday, { timeZone: MEXICO }), /sáb.*10 oct.*Hora por confirmar/);
  assert.match(formatFixtureSchedule(tonight, { timeZone: MEXICO }), /jue.*8 oct.*22:00/);
  assert.throws(() => filterMatches([], { timezone: 'invalid-zone' }));
  assert.throws(() => filterMatches([], { timezone: '' }));
});

test('ESPN parsers record the provider day only for fixtures without a confirmed time', () => {
  const competitor = (id, side) => ({ id, homeAway: side, athlete: { displayName: `Jugador ${id}` } });
  const comp = (id, date, timeValid) => ({ id, date, timeValid, status: { type: { state: 'pre' } }, round: { displayName: 'Round 2' }, competitors: [competitor(`${id}1`, 'home'), competitor(`${id}2`, 'away')] });
  const data = { events: [{ name: 'Rolex Shanghai Masters', groupings: [{ grouping: { slug: 'mens-singles' }, competitions: [comp('1', '2026-10-10T04:00Z', false), comp('2', '2026-10-09T04:00Z', true)] }] }] };
  const [tbd, timed] = parseTennisEvents(data, 'atp');
  assert.equal(tbd.scheduleDate, '2026-10-10');
  assert.equal(timed.scheduleDate, undefined);
  const team = (id, side) => ({ homeAway: side, team: { id, displayName: `Equipo ${id}` } });
  const game = parseBasketballEvent({ id: '9', date: '2026-10-11T04:00Z', season: { type: 2 }, competitions: [{ timeValid: false, status: { type: { state: 'pre' } }, competitors: [team('1', 'home'), team('2', 'away')] }] });
  assert.equal(game?.scheduleDate, '2026-10-11');
});

test('set, early-inning, extra-inning and negative handicap markets are flagged VIP, like football Overs and first half', () => {
  const tennis = sportCardMarkets({ sport: 'tenis', homeTeam: { id: '1', name: 'A' }, awayTeam: { id: '2', name: 'B' }, analysis: {} });
  assert.deepEqual(tennis.map(market => market.vip), [true, true, false]);
  assert.ok(sportCardMarkets({ sport: 'beisbol', homeTeam: { id: '1', name: 'A' }, awayTeam: { id: '2', name: 'B' }, analysis: {} }).every(market => market.vip));
  assert.deepEqual(sportCardMarkets({ sport: 'basquetbol', homeTeam: { id: '1', name: 'A' }, awayTeam: { id: '2', name: 'B' }, analysis: {} }).map(market => market.vip), [false, true, false]);
});
