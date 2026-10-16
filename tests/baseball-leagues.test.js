import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNpbCalendar, parseKboSchedule, parseMlbGame } from '../server/services/baseballDataService.js';
import { pitcherFip, starterFactor, parsePitcherSeasons, STARTERS } from '../server/services/baseballStarters.js';
import { ratedRuns } from '../server/services/baseballRatings.js';
import { baseballAnalysis, leagueTieChance } from '../server/services/sportProbabilityModel.js';

const npb = { id: 'npb', name: 'NPB', flag: '🇯🇵', provider: 'npb', allowsDraw: true };

test('the NPB monthly calendar gives every finished game with home team first, the box score link and nine innings', () => {
  const html = `<table><tr><td class="stschedule"><div class="teschedate"><a href="/bis/eng/2026/games/gm20260915.html">15</a></div>
    <div class="stvsteam"><div><a href="/bis/eng/2026/games/s2026091501976.html">S 4 - 9 C</a></div><div><a href="/bis/eng/2026/games/s2026091501951.html">DB 13 - 2 G</a></div></div>
    <div class="stvsteam"><div><a href="/bis/eng/2026/games/s2026091201788.html">L 3 - 3 F</a></div><div><a href="/bis/eng/2026/games/s2026071901999.html">AP 3 - 2 AC</a></div></div></td></tr></table>`;
  const games = parseNpbCalendar(html, npb, 2026);
  assert.equal(games.length, 3, 'All-Star teams are not league fixtures');
  assert.deepEqual([games[0].homeTeam.id, games[0].awayTeam.id, games[0].finalScore.home, games[0].finalScore.away], ['npb-s', 'npb-c', 4, 9]);
  assert.equal(games[0].homeTeam.name, 'Yakult'); assert.equal(games[1].homeTeam.name, 'DeNA');
  assert.equal(games[0].sourceUrl, 'https://npb.jp/bis/eng/2026/games/s2026091501976.html');
  assert.equal(games[0].scheduleDate, '2026-09-15'); assert.equal(games[0].status, 'FINISHED');
  assert.equal(games[0].scheduledInnings, 9);
  assert.equal(games[2].finalScore.home, games[2].finalScore.away, 'Ties are kept');
  assert.throws(() => parseNpbCalendar('<html></html>', npb, 2026));
});

test('KBO All-Star rows are skipped and KBO games are scheduled for nine innings', () => {
  const html = `<span id="lblGameMonth">2026.07</span><table summary="schdule"><tr><td title="DATE">07.11</td><td class="TIME">18:00</td><td class="loop_r">Nanum</td><td><span class="score_schedule">5 : 7</span></td><td class="loop_l">Dream</td></tr>
    <tr><td title="DATE">07.12</td><td class="TIME">18:30</td><td class="loop_r">LG</td><td><span class="score_schedule">3 : 4</span></td><td class="loop_l">KIA</td></tr></table>`;
  const games = parseKboSchedule(html, { id: 'kbo', name: 'KBO', provider: 'kbo', allowsDraw: true }, '2026-10-14T00:00:00Z');
  assert.equal(games.length, 1);
  assert.equal(games[0].homeTeam.name, 'KIA'); assert.equal(games[0].scheduledInnings, 9);
});

test('a starter FIP comes from home runs, walks and strikeouts and shrinks toward the league with few innings', () => {
  const ace = { current: { outs: 540, hr: 12, bb: 40, hbp: 5, k: 220 }, previous: { outs: 0, hr: 0, bb: 0, hbp: 0, k: 0 } };
  const poor = { current: { outs: 450, hr: 30, bb: 70, hbp: 8, k: 100 }, previous: { outs: 0, hr: 0, bb: 0, hbp: 0, k: 0 } };
  const debut = { current: { outs: 9, hr: 3, bb: 4, hbp: 0, k: 1 }, previous: { outs: 0, hr: 0, bb: 0, hbp: 0, k: 0 } };
  assert.ok(pitcherFip(ace) < 3.3 && pitcherFip(poor) > 4.8, `${pitcherFip(ace)} / ${pitcherFip(poor)}`);
  assert.ok(Math.abs(pitcherFip(debut) - STARTERS.leagueFip) < 0.6, 'Three innings barely move the league average');
  assert.ok(starterFactor(ace) < 1 && starterFactor(poor) > 1);
  assert.equal(starterFactor(null), 1);
  for (const value of [ace, poor, debut]) assert.ok(starterFactor(value) >= 0.6 && starterFactor(value) <= 1.5);
  // MLB splits of both seasons are summed per team; minor leagues are left out.
  const person = { id: 1, fullName: 'Pitcher', stats: [{ splits: [
    { season: '2026', sport: { id: 1 }, team: { id: 1 }, stat: { outs: 300, homeRuns: 10, baseOnBalls: 30, hitByPitch: 2, strikeOuts: 100 } },
    { season: '2026', sport: { id: 1 }, team: { id: 2 }, stat: { outs: 60, homeRuns: 1, baseOnBalls: 5, hitByPitch: 0, strikeOuts: 20 } },
    { season: '2026', sport: { id: 11 }, team: { id: 3 }, stat: { outs: 90, homeRuns: 0, baseOnBalls: 1, hitByPitch: 0, strikeOuts: 40 } },
    { season: '2025', sport: { id: 1 }, team: { id: 1 }, stat: { outs: 150, homeRuns: 5, baseOnBalls: 10, hitByPitch: 1, strikeOuts: 50 } }] }] };
  assert.deepEqual(parsePitcherSeasons(person, 2026), { name: 'Pitcher', current: { outs: 360, hr: 11, bb: 35, hbp: 2, k: 120 }, previous: { outs: 150, hr: 5, bb: 10, hbp: 1, k: 50 } });
});

const NOW = Date.parse('2026-08-15T12:00:00Z'), HOUR = 3600000;
const teams = ['a', 'b', 'c', 'd', 'e', 'f'];
const games = Array.from({ length: 300 }, (_, i) => ({ id: `mlb-${i}`, sport: 'beisbol', leagueId: 'mlb', status: 'FINISHED',
  kickoff: new Date(NOW - (300 - i) * 6 * HOUR).toISOString(), homeTeam: { id: teams[i % 6] }, awayTeam: { id: teams[(i + 1 + (i % 4)) % 6] },
  finalScore: { home: 3 + (i % 5), away: 2 + ((i + 2) % 5) } })).filter(game => game.homeTeam.id !== game.awayTeam.id);
const ace = { name: 'Ace', current: { outs: 540, hr: 12, bb: 40, hbp: 5, k: 220 }, previous: { outs: 500, hr: 14, bb: 45, hbp: 4, k: 200 } };
const poor = { name: 'Poor', current: { outs: 450, hr: 30, bb: 70, hbp: 8, k: 100 }, previous: { outs: 420, hr: 28, bb: 66, hbp: 7, k: 95 } };

test('announced MLB starters move the runs and the winner the same way; other leagues and finished games ignore them', () => {
  const match = { id: 'next', sport: 'beisbol', leagueId: 'mlb', status: 'SCHEDULED', kickoff: new Date(NOW + 5 * HOUR).toISOString(), homeTeam: { id: 'a', name: 'A' }, awayTeam: { id: 'b', name: 'B' }, odds: {}, scheduledInnings: 9 };
  const plain = ratedRuns(match, games, NOW), homeAce = ratedRuns({ ...match, starters: { home: ace, away: poor } }, games, NOW), awayAce = ratedRuns({ ...match, starters: { home: poor, away: ace } }, games, NOW);
  assert.ok(homeAce.expected.away < plain.expected.away && homeAce.expected.home > plain.expected.home);
  assert.ok(awayAce.expected.home < plain.expected.home);
  const a = baseballAnalysis({ ...match, starters: { home: ace, away: poor } }, games, NOW), b = baseballAnalysis(match, games, NOW);
  assert.ok(a.winner.home > b.winner.home + 3, `${a.winner.home} vs ${b.winner.home}`);
  assert.equal(a.starters.home.name, 'Ace'); assert.ok(a.starters.home.fip < a.starters.away.fip);
  assert.match(a.method, /Abridores anunciados/);
  // Only one starter announced: the team ratings stay alone.
  assert.deepEqual(ratedRuns({ ...match, starters: { home: ace, away: null } }, games, NOW).expected, plain.expected);
  assert.equal(ratedRuns({ ...match, status: 'FINISHED', starters: { home: ace, away: poor } }, games, NOW).starters, null);
  const asian = games.map(game => ({ ...game, leagueId: 'npb' }));
  assert.equal(ratedRuns({ ...match, leagueId: 'npb', starters: { home: ace, away: poor } }, asian, NOW).starters, null);
});

test('spring training never rates a team, and the MLB parser keeps the announced starters', () => {
  const league = { id: 'mlb', name: 'MLB', flag: '🇺🇸', provider: 'mlb', sportId: 1 };
  const game = parseMlbGame({ gamePk: 1, gameDate: '2026-03-01T18:00:00Z', gameType: 'S', status: { abstractGameState: 'Final', detailedState: 'Final' },
    teams: { home: { team: { id: 1, name: 'A' }, score: 30, probablePitcher: { id: 9, fullName: 'Nine' } }, away: { team: { id: 2, name: 'B' }, score: 0 } } }, league);
  assert.equal(game.exhibition, true);
  assert.deepEqual(game.probablePitchers, { home: { id: '9', name: 'Nine' }, away: null });
  const match = { id: 'next', sport: 'beisbol', leagueId: 'mlb', status: 'SCHEDULED', kickoff: new Date(NOW + 5 * HOUR).toISOString(), homeTeam: { id: 'a' }, awayTeam: { id: 'b' } };
  const spring = games.map(g => ({ ...g, exhibition: true }));
  assert.equal(ratedRuns(match, spring, NOW), null);
  assert.deepEqual(ratedRuns(match, [...games, ...spring.map(g => ({ ...g, id: `s-${g.id}`, finalScore: { home: 30, away: 0 } }))], NOW).expected, ratedRuns(match, games, NOW).expected);
});

test('the league tie chance stays near the observed rate, never driven by one recent tie', () => {
  const base = { sport: 'beisbol', leagueId: 'npb', status: 'FINISHED', homeTeam: { id: 'x' }, awayTeam: { id: 'y' } };
  const season = Array.from({ length: 860 }, (_, i) => ({ ...base, id: `g${i}`, kickoff: new Date(NOW - (860 - i) * 4 * HOUR).toISOString(), finalScore: { home: i % 50 === 0 ? 2 : 3, away: 2 } }));
  assert.ok(Math.abs(leagueTieChance(season) * 100 - 2) < 0.3);
  assert.ok(Math.abs(leagueTieChance([]) - 0.025) < 1e-9, 'No league games: the 2.5% prior');
  // Games of another league or after the forecast never count.
  assert.equal(leagueTieChance([...season, { ...base, id: 'kbo', leagueId: 'kbo', kickoff: season[10].kickoff, finalScore: { home: 1, away: 1 } }], { leagueId: 'npb' }), leagueTieChance(season));
  assert.equal(leagueTieChance(season, { before: Date.parse(season[400].kickoff) }) > 0, true);
});

test('KBO ids stay the same when another game is inserted earlier in the month; doubleheaders stay distinct', () => {
  const row = (day, time, away, home) => `<tr><td title="DATE">${day}</td><td class="TIME">${time}</td><td class="loop_r">${away}</td><td><span class="score_schedule"></span></td><td class="loop_l">${home}</td></tr>`;
  const page = rows => `<span id="lblGameMonth">2026.08</span><table summary="schdule">${rows.join('')}</table>`;
  const league = { id: 'kbo', name: 'KBO', provider: 'kbo', allowsDraw: true };
  const before = parseKboSchedule(page([row('08.20', '18:30', 'LG', 'KIA'), row('08.21', '14:00', 'NC', 'KT'), row('08.21', '18:30', 'NC', 'KT')]), league, '2026-08-01T00:00:00Z');
  const after = parseKboSchedule(page([row('08.02', '18:30', 'SSG', 'LOTTE'), row('08.20', '18:30', 'LG', 'KIA'), row('08.21', '14:00', 'NC', 'KT'), row('08.21', '18:30', 'NC', 'KT')]), league, '2026-08-01T00:00:00Z');
  assert.deepEqual(before.map(game => game.id), ['kbo-2026-08-20-KIA-LG', 'kbo-2026-08-21-KT-NC', 'kbo-2026-08-21-KT-NC-2']);
  assert.deepEqual(after.slice(1).map(game => game.id), before.map(game => game.id));
});

test('only the LMP of the winter leagues is offered: the ones without forecasting skill were removed', async () => {
  const { SPORT_LEAGUES } = await import('../src/constants/leagues.js');
  const ids = SPORT_LEAGUES.beisbol.map(league => league.id);
  assert.ok(ids.includes('lmp'));
  for (const removed of ['lvbp', 'lidom', 'lbprc', 'abl', 'serie_caribe']) assert.ok(!ids.includes(removed), removed);
  const { analyzeSportMatch } = await import('../server/services/sportProbabilityModel.js');
  const match = { id: 'lmp-next', sport: 'beisbol', leagueId: 'lmp', status: 'SCHEDULED', kickoff: new Date(NOW + 5 * HOUR).toISOString(), homeTeam: { id: 'a', name: 'A' }, awayTeam: { id: 'b', name: 'B' }, odds: {}, scheduledInnings: 9 };
  assert.ok(analyzeSportMatch(match, games.map(game => ({ ...game, leagueId: 'lmp' })), NOW).winner.home > 0);
});
