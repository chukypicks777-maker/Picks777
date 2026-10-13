import test from 'node:test';
import assert from 'node:assert/strict';
import { availabilityValue, lineupAdjustment, playChance, teamAvailability, parseSeasonStats, nbaSeasonOf, blendedStats, AVAILABILITY } from '../server/services/basketballAvailability.js';
import { ratedMargin } from '../server/services/basketballRatings.js';
import { basketballAnalysis } from '../server/services/sportProbabilityModel.js';
import { availabilitySummary, availabilityStatus } from '../src/utils/sportPicks.js';

const HOUR = 3600000, DAY = 24 * HOUR;
const NOW = Date.parse('2026-12-10T12:00:00Z');
const line = (minutes, points) => ({ gp: 30, minutes, points, rebounds: 6, assists: 4, steals: 1, blocks: 0.5, turnovers: 2, fgm: points * 0.38, fga: points * 0.8, ftm: points * 0.15, fta: points * 0.19 });

test('a player is worth his game score above a replacement, and bench minutes count nothing', () => {
  const star = line(34, 28), bench = line(6, 3);
  const value = availabilityValue(star, AVAILABILITY.regular), role = availabilityValue(line(26, 12), AVAILABILITY.regular);
  assert.ok(value > 10 && role > 0, `star value ${value}`);
  // A star is worth more than two role players with half his production.
  assert.ok(value > 2 * availabilityValue({ ...star, gameScore: 21.3 / 2 }, AVAILABILITY.regular));
  // Few games shrink the value; an older season fills a season lost to injury.
  assert.ok(availabilityValue({ ...star, gp: 3 }, AVAILABILITY.regular) < value / 2);
  assert.equal(blendedStats(null, { ...star, gp: 2 }, { ...star, gp: 70 }).gp, 72);
  assert.equal(blendedStats(null, null, null), null);
  assert.equal(availabilityValue(bench, AVAILABILITY.regular), 0);
  assert.equal(availabilityValue(null, AVAILABILITY.regular), 0);
  // Out with a full share costs alpha x value; playing with a full share costs nothing.
  assert.ok(Math.abs(lineupAdjustment([{ stats: star, plays: 0, share: 1 }], AVAILABILITY.regular) + AVAILABILITY.regular.alpha * value) < 1e-9);
  assert.equal(lineupAdjustment([{ stats: star, plays: 1, share: 1 }], AVAILABILITY.regular), 0);
  // A signing who plays but earned none of the rating adds his value.
  assert.ok(lineupAdjustment([{ stats: star, plays: 1, share: 0 }], AVAILABILITY.regular) > 0);
});

test('injury report wording becomes a chance of playing; rest only counts for that game', () => {
  const game = '2026-10-13T01:00:00Z';
  assert.equal(playChance(null, game), 1);
  assert.equal(playChance({ status: 'Day-To-Day', type: 'Rest', date: '2026-10-12T21:33Z' }, game), 0);
  assert.equal(playChance({ status: 'Day-To-Day', type: 'Rest', date: '2026-10-08T21:33Z' }, game), 1, 'An old rest day does not apply to a later game');
  assert.equal(playChance({ status: 'Out', type: 'Knee', date: '2026-09-20T00:00Z' }, game), 0);
  assert.equal(playChance({ status: 'Day-To-Day', type: 'Ankle', date: '2026-10-12T00:00Z' }, game), 0.5);
  assert.equal(playChance({ status: 'Out', type: 'Foot', date: '2026-09-20T00:00Z', returnDate: '2026-10-10' }, game), 0.75);
  assert.equal(nbaSeasonOf(Date.parse(game)), 2027);
  assert.equal(nbaSeasonOf(Date.parse('2026-04-10T00:00Z')), 2026);
  assert.equal(availabilityStatus({ status: 'Day-To-Day', type: 'Rest' }), 'descanso');
  assert.equal(availabilityStatus({ status: 'Out', type: 'Knee' }), 'fuera');
});

test('ESPN season averages are read by name, with every team the player played for', () => {
  const data = { categories: [
    { name: 'general', names: ['gamesPlayed', 'avgMinutes', 'avgRebounds'] },
    { name: 'offensive', names: ['avgPoints', 'avgFieldGoalsMade', 'avgFieldGoalsAttempted', 'avgFreeThrowsMade', 'avgFreeThrowsAttempted', 'avgAssists', 'avgTurnovers'] },
    { name: 'defensive', names: ['avgSteals', 'avgBlocks'] }],
  athletes: [{ athlete: { id: '9', displayName: 'Star', teamId: '24', teams: [{ id: '1' }, { id: '24' }] }, categories: [{ totals: ['64', '29.2', '11.5'] }, { totals: ['25.0', '8.6', '16.9', '5.8', '7.0', '3.1', '2.4'] }, { totals: ['1.0', '3.1'] }] },
    { athlete: { id: '10', displayName: 'Never played', teamId: '24' }, categories: [{ totals: ['0', '0', '0'] }, { totals: ['0', '0', '0', '0', '0', '0', '0'] }, { totals: ['0', '0'] }] }] };
  const stats = parseSeasonStats(data);
  assert.deepEqual(Object.keys(stats), ['9']);
  assert.deepEqual(stats['9'].teams, ['1', '24']);
  assert.equal(stats['9'].points, 25); assert.equal(stats['9'].fga, 16.9); assert.equal(stats['9'].blocks, 3.1); assert.equal(stats['9'].rebounds, 11.5);
});

// Two teams with equal results; the home side's star is listed as resting.
const teams = ['h', 'a', 'x', 'y'];
const rows = Array.from({ length: 160 }, (_, i) => {
  const home = teams[i % 4], away = teams[(i + 1 + (i % 3)) % 4];
  return [`g${i}`, Math.round((NOW - (160 - i) * DAY / 2) / 1000), home, away, 112 + (i % 5), 110 + ((i + 2) % 5)];
}).filter(row => row[2] !== row[3]);
const history = { leagueId: 'nba', builtAt: NOW, rows };
const season = nbaSeasonOf(NOW);
const availability = (injuries = {}, roster = { h: ['star', 'mate'], a: ['rival', 'other'] }) => ({
  fetchedAt: '2026-12-10T11:00:00Z', names: { star: 'Star Player', mate: 'Mate', rival: 'Rival', other: 'Other' },
  teams: Object.fromEntries(['h', 'a', 'x', 'y'].map(id => [id, { roster: roster[id] || [], injuries: injuries[id] || [] }])),
  stats: { [season - 1]: { star: { ...line(34, 28), gp: 82, teams: ['h'] }, mate: { ...line(28, 14), gp: 82, teams: ['h'] }, rival: { ...line(30, 18), gp: 82, teams: ['a'] }, other: { ...line(26, 12), gp: 82, teams: ['a'] } },
    [season]: { star: { ...line(34, 28), gp: 20, teams: ['h'] }, mate: { ...line(28, 14), gp: 20, teams: ['h'] }, rival: { ...line(30, 18), gp: 20, teams: ['a'] }, other: { ...line(26, 12), gp: 20, teams: ['a'] } } }
});
const match = { id: 'espn-nba-next', sport: 'basquetbol', leagueId: 'nba', status: 'SCHEDULED', kickoff: new Date(NOW + 8 * HOUR).toISOString(),
  homeTeam: { id: 'h', name: 'Home', shortName: 'HOM' }, awayTeam: { id: 'a', name: 'Away', shortName: 'AWY' }, odds: {} };

test('a resting star lowers his team margin, the shown points and the winner, and is listed by name', () => {
  const healthy = ratedMargin(match, [], history, NOW, availability());
  const resting = ratedMargin(match, [], history, NOW, availability({ h: [{ id: 'star', name: 'Star Player', status: 'Day-To-Day', type: 'Rest', date: new Date(NOW).toISOString() }] }));
  const plain = ratedMargin(match, [], history, NOW, null);
  assert.ok(healthy.lineups && resting.lineups && !plain.lineups);
  assert.ok(resting.margin < healthy.margin - 1, `${resting.margin} vs ${healthy.margin}`);
  assert.ok(Math.abs(resting.points.home - resting.points.away - resting.margin) < 1e-9);
  assert.equal(resting.lineups.home.missing[0].name, 'Star Player');
  const a = basketballAnalysis(match, [], NOW, history, availability({ h: [{ id: 'star', name: 'Star Player', status: 'Out', type: 'Knee', date: new Date(NOW - DAY).toISOString() }] }));
  assert.ok(a.winner.home < basketballAnalysis(match, [], NOW, history, availability()).winner.home);
  assert.match(a.method, /Bajas y plantillas/);
  assert.equal(availabilitySummary({ ...match, analysis: a }), 'HOM: Player');
  // A player who left the team (not on the roster) also lowers it; finished games ignore today's report.
  const departed = ratedMargin(match, [], history, NOW, availability({}, { h: ['mate'], a: ['rival', 'other'] }));
  assert.ok(departed.margin < healthy.margin - 1);
  assert.equal(ratedMargin({ ...match, status: 'FINISHED' }, [], history, NOW, availability()).lineups, null);
  // Without both teams' data the ratings stay alone.
  const partial = availability(); delete partial.teams.a;
  assert.equal(ratedMargin(match, [], history, NOW, partial).lineups, null);
});

test('long absences are already inside the rating: only the games before the injury date count', () => {
  const players = date => teamAvailability('h', match.kickoff, rows.map(([, time, home, away]) => ({ time: time * 1000, home, away })),
    availability({ h: [{ id: 'star', name: 'Star Player', status: 'Out', type: 'Knee', date }] }), { asOf: NOW });
  const recent = players(new Date(NOW - DAY).toISOString()).find(p => p.id === 'star'), old = players(new Date(NOW - 70 * DAY).toISOString()).find(p => p.id === 'star');
  assert.ok(recent.share > old.share * 2, `${recent.share} vs ${old.share}`);
  assert.equal(recent.plays, 0);
});
