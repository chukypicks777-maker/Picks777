import test from 'node:test';
import assert from 'node:assert/strict';
import { SPORT_LEAGUES, LEAGUES_DATA } from '../src/constants/leagues.js';
import { SPORTS, sportFromPath, footballLeagueFromLocation } from '../src/constants/sports.js';
import { baseballAnalysis, basketballAnalysis, tennisAnalysis, analyzeSportMatch, poissonResult, seriesWinProbability, observedExtraInnings } from '../server/services/sportProbabilityModel.js';
import { parseMlbGame, parseNpbSchedule, parseKboSchedule } from '../server/services/baseballDataService.js';
import { parseBasketballEvent, parseTennisEvents } from '../server/services/sportsDataService.js';
import { parseEspnEvent, LEAGUES } from '../server/services/footballDataService.js';

const NOW = Date.parse('2026-10-05T12:00:00Z');
const target = (sport, leagueId = sport) => ({ id: 'target', sport, leagueId, status: 'SCHEDULED', kickoff: new Date(NOW + 3600000).toISOString(),
  homeTeam: { id: 'a', name: 'Equipo A' }, awayTeam: { id: 'b', name: 'Equipo B' }, odds: {} });
const history = (match, ownHome = [4, 6, 2, 3, 5, 4], ownAway = [2, 1, 3, 5, 2, 1]) => ownHome.flatMap((score, i) => [
  { ...match, id: `home-${i}`, status: 'FINISHED', kickoff: new Date(NOW - (i + 1) * 86400000).toISOString(), awayTeam: { id: 'c' }, finalScore: { home: score, away: ownAway[i] }, inningScores: Array.from({ length: 5 }, (_, j) => ({ num: j + 1, home: j === 0 ? Number(i % 3 === 0) : j === 2 ? score - Number(i % 3 === 0) : 0, away: j === 0 ? 1 : 0 })) },
  { ...match, id: `away-${i}`, status: 'FINISHED', kickoff: new Date(NOW - (i + 1) * 86400000).toISOString(), homeTeam: { id: 'd' }, finalScore: { home: score, away: ownAway[i] }, inningScores: Array.from({ length: 5 }, (_, j) => ({ num: j + 1, home: j === 0 ? Number(i % 3 === 0) : j === 2 ? score - Number(i % 3 === 0) : 0, away: j === 0 ? 1 : 0 })) }
]);
const sum = values => Object.values(values).reduce((total, value) => total + value, 0);

test('women share the football league selector, legacy deep links remain valid, and basketball has four US leagues', () => {
  assert.equal(SPORTS.length, 4);
  assert.equal(sportFromPath('/femenil/'), 'futbol');
  assert.equal(footballLeagueFromLocation('/femenil/'), 'mexico_femenil');
  assert.equal(footballLeagueFromLocation('/', '?league=mexico_femenil'), 'mexico_femenil');
  assert.equal(LEAGUES_DATA[LEAGUES_DATA.findIndex(league => league.id === 'mexico') + 1].id, 'mexico_femenil');
  assert.deepEqual(SPORT_LEAGUES.beisbol.map(league => league.id), ['mlb', 'npb', 'kbo', 'lmb']);
  assert.equal(SPORT_LEAGUES.tenis.length, 6);
  assert.deepEqual(SPORT_LEAGUES.basquetbol.map(league => league.id), ['nba', 'nba_preseason', 'ncaaw', 'wnba']);
  const women = LEAGUES.find(league => league.id === 'mexico_femenil');
  const event = { id: 'women', date: new Date(NOW).toISOString(), competitions: [{ status: { type: { state: 'pre' } }, competitors: [
    { homeAway: 'home', team: { id: '1', name: 'Tigres femenil' } }, { homeAway: 'away', team: { id: '2', name: 'América femenil' } }
  ] }] };
  const parsed = parseEspnEvent(event, women);
  assert.equal(parsed.sport, 'femenil'); assert.equal(parsed.id, 'espn-femenil-women'); assert.equal(parsed.espnCode, 'mex.w.1');
  event.competitions[0].timeValid = false;
  assert.equal(parseEspnEvent(event, women).timeTBD, true);
});

test('baseball totals are monotone and complementary, first inning includes the draw, and game winners sum to 100', () => {
  const match = target('beisbol');
  const result = baseballAnalysis(match, history(match), NOW);
  assert.equal(result.available, true); assert.equal(sum(result.winner), 100); assert.equal(sum(result.firstInning), 100);
  assert.ok(result.firstInning.draw > result.firstInning.home);
  for (const rows of [result.teamRuns.home, result.teamRuns.away, result.firstFive]) {
    assert.deepEqual(rows.map(row => row.line), [1.5, 2.5, 3.5, 4.5, 5.5]);
    rows.forEach((row, i) => { assert.equal(row.over + row.under, 100); if (i) assert.ok(row.over <= rows[i - 1].over); });
  }
  for (const values of Object.values(result.scoresRun)) assert.equal(values.yes + values.no, 100);
  const japan = baseballAnalysis({ ...match, allowsDraw: true }, history(match), NOW);
  assert.equal(sum(japan.winner), 100); assert.ok(japan.winner.draw > 0);
});

test('no future results, current game results or other leagues leak into forecasts; absent samples stay unavailable', () => {
  const match = target('beisbol'), games = history(match);
  const baseline = baseballAnalysis(match, games, NOW);
  const injected = [{ ...games[0], id: 'target', finalScore: { home: 200, away: 0 } },
    { ...games[0], id: 'future', kickoff: new Date(NOW + 86400000).toISOString(), finalScore: { home: 200, away: 0 } },
    { ...games[0], id: 'other', leagueId: 'other', finalScore: { home: 200, away: 0 } }];
  assert.deepEqual(baseballAnalysis(match, [...games, ...injected], NOW), baseline);
  const missing = baseballAnalysis(match, [], NOW);
  assert.equal(missing.winner.home, null); assert.equal(missing.teamRuns.home[0].over, null); assert.equal(missing.firstInning.draw, null);
  assert.deepEqual(poissonResult(0, 0), { home: 0, draw: 100, away: 0 });
  for (const value of [null, undefined, NaN, Infinity, -1]) assert.equal(poissonResult(value, 3).home, null);
});

test('full baseball game totals include all nine requested lines and preserve missing samples', () => {
  const match = target('beisbol'), result = baseballAnalysis(match, history(match), NOW);
  assert.deepEqual(result.totalRuns.map(row => row.line), [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5]);
  for (let i = 0; i < result.totalRuns.length; i++) {
    const row = result.totalRuns[i];
    assert.equal(row.over + row.under, 100);
    if (i) assert.ok(row.over <= result.totalRuns[i - 1].over);
    assert.ok(row.over >= result.teamRuns.home.find(team => team.line === row.line)?.over || row.line > 5.5);
  }
  assert.ok(baseballAnalysis(match, [], NOW).totalRuns.every(row => row.over === null && row.under === null));
});

function verifiedInnings(extra, scheduled = 9) {
  return { status: 'FINISHED', scheduledInnings: scheduled, lastInning: scheduled + Number(extra), finalScore: { home: 2, away: 1 },
    inningScores: Array.from({ length: scheduled + Number(extra) }, (_, i) => ({ num: i + 1, home: i === 0 ? (extra ? 1 : 2) : i === scheduled ? 1 : 0, away: i === 0 ? 1 : 0 })) };
}

test('extra innings require actual duration, complete consistent scoring and a tied regulation, including seven-inning games', () => {
  for (const scheduled of [7, 9]) {
    const ordinary = verifiedInnings(false, scheduled), extra = verifiedInnings(true, scheduled);
    assert.equal(observedExtraInnings(ordinary), false); assert.equal(observedExtraInnings(extra), true);
    const unplayed = { ...ordinary, inningScores: ordinary.inningScores.map((inning, i) => i === scheduled - 1 ? { ...inning, home: null } : inning) };
    assert.equal(observedExtraInnings(unplayed), false);
    for (const bad of [{ ...extra, scheduledInnings: undefined }, { ...extra, lastInning: undefined }, { ...extra, status: 'LIVE' },
      { ...extra, inningScores: extra.inningScores.slice(0, scheduled) }, { ...extra, finalScore: { home: 20, away: 1 } },
      { ...extra, inningScores: extra.inningScores.map((inning, i) => i === 0 ? { ...inning, home: null } : inning) },
      { ...extra, finalScore: { home: 3, away: 1 }, inningScores: extra.inningScores.map((inning, i) => i === 0 ? { ...inning, home: 2 } : inning) }]) {
      assert.equal(observedExtraInnings(bad), null);
    }
  }
});

test('extra innings probability uses verified same-duration history, unique games and a disclosed mathematical prior', () => {
  const match = { ...target('beisbol', 'mlb'), scheduledInnings: 9 };
  const games = history(match).map((game, i) => ({ ...game, ...verifiedInnings(i % 3 === 0) }));
  const result = baseballAnalysis(match, games, NOW);
  assert.deepEqual(result.extraInningsSampleSize, { home: 6, away: 6, uniqueGames: 12, extraGames: 4 });
  assert.deepEqual(result.extraInnings, { yes: 34.6, no: 65.4 });
  assert.match(result.method, /Jeffreys/);
  assert.deepEqual(baseballAnalysis(match, [...games, games[0]], NOW).extraInningsSampleSize, result.extraInningsSampleSize);
  const common = games.filter(game => game.id.startsWith('home')).map(game => ({ ...game, awayTeam: match.awayTeam }));
  assert.equal(baseballAnalysis(match, common, NOW).extraInningsSampleSize.uniqueGames, 6);
  for (const sample of [games.slice(0, 8), games.map(game => ({ ...game, scheduledInnings: 7 })), games.map(game => ({ ...game, lastInning: null }))]) {
    assert.deepEqual(baseballAnalysis(match, sample, NOW).extraInnings, { yes: null, no: null });
  }
  assert.deepEqual(baseballAnalysis({ ...match, scheduledInnings: undefined }, games, NOW).extraInnings, { yes: null, no: null });
  const excluded = [{ ...games[0], id: match.id }, { ...games[0], id: 'future-extra', kickoff: new Date(NOW + 86400000).toISOString() }, { ...games[0], id: 'foreign-extra', leagueId: 'npb' }];
  assert.deepEqual(baseballAnalysis(match, [...games, ...excluded], NOW), result);
});

test('basketball handicaps apply the correct team sign and agree with opposite-team complementary markets', () => {
  const match = target('basquetbol');
  const result = basketballAnalysis(match, history(match, [110, 90, 108, 114, 96, 106], [97, 106, 103, 101, 94, 112]), NOW);
  assert.equal(sum(result.winner), 100);
  for (const side of ['home', 'away']) {
    const rows = [...result.handicaps[side]].sort((a, b) => a.line - b.line);
    assert.equal(rows.length, 13);
    rows.forEach((row, i) => { assert.ok(row.probability >= 0 && row.probability <= 100); if (i) assert.ok(row.probability >= rows[i - 1].probability); });
  }
  for (const row of result.handicaps.home.filter(row => row.line < 7)) {
    const other = result.handicaps.away.find(other => other.line === -row.line);
    if (other) assert.ok(Math.abs(row.probability + other.probability - 100) < 0.001);
  }
  assert.equal(basketballAnalysis(match, [], NOW).handicaps.home[0].probability, null);
  assert.deepEqual(basketballAnalysis({ ...match, odds: { homeWin: 2, awayWin: 2 } }, [], NOW).winner, { home: 50, away: 50 });
  const calibrated = basketballAnalysis({ ...match, odds: { homeWin: 1.5, awayWin: 3 } }, history(match, [110, 90, 108, 114, 96, 106], [97, 106, 103, 101, 94, 112]), NOW);
  assert.ok(calibrated.handicaps.home.find(row => row.line === 1.5).probability > calibrated.winner.home);
  assert.ok(calibrated.handicaps.home.find(row => row.line === -1.5).probability < calibrated.winner.home);
  assert.equal(analyzeSportMatch({ ...match, status: 'POSTPONED', odds: { homeWin: 2, awayWin: 2 } }, [], NOW).winner.home, null);
});

test('tennis winner, each set and yes/no for at least one set are coherent for best of 3 and best of 5', () => {
  for (const maxSets of [3, 5]) for (const homeOdds of [1.05, 1.5, 2, 4, 20]) {
    const result = tennisAnalysis({ ...target('tenis'), tour: 'atp', maxSets, odds: { homeWin: homeOdds, awayWin: 2 } }, [], NOW);
    assert.equal(result.available, true); assert.equal(sum(result.winner), 100); assert.equal(sum(result.firstSet), 100); assert.deepEqual(result.firstSet, result.secondSet);
    const needed = (maxSets + 1) / 2;
    for (const side of ['home', 'away']) assert.equal(result.winsSet[side].yes + result.winsSet[side].no, 100);
    assert.ok(Math.abs(seriesWinProbability(result.firstSet.home / 100, maxSets) * 100 - result.winner.home) < 0.2);
    assert.ok(Math.abs(result.winsSet.home.no - (1 - result.firstSet.home / 100) ** needed * 100) < 0.2);
  }
  const match = { ...target('tenis'), tour: 'atp', maxSets: 3 };
  const games = history(match).map(game => ({ ...game, setScores: [{ home: 6, away: 3 }, { home: 6, away: 4 }], retired: false }));
  assert.ok(tennisAnalysis(match, games, NOW).winner.home > 50);
  assert.equal(tennisAnalysis(match, games.map(game => ({ ...game, retired: true })), NOW).winner.home, null);
  assert.equal(tennisAnalysis(match, games.map(game => ({ ...game, tour: 'wta' })), NOW).firstSet.home, null);
});

test('MLB parser preserves unknown upcoming scores and does not confuse LMB with winter baseball', () => {
  const game = { gamePk: 1, gameDate: new Date(NOW).toISOString(), season: '2026', status: { abstractGameState: 'Preview', detailedState: 'Scheduled' }, teams: { home: { team: { id: 1, name: 'A' }, score: 0 }, away: { team: { id: 2, name: 'B' }, score: 0 } } };
  const result = parseMlbGame(game, SPORT_LEAGUES.beisbol[3]);
  assert.equal(result.leagueId, 'lmb'); assert.equal(result.liveScore.home, null); assert.equal(result.finalScore.home, null);
  game.status.detailedState = 'Postponed'; assert.equal(parseMlbGame(game, SPORT_LEAGUES.beisbol[0]).status, 'POSTPONED');
});

test('NPB and KBO official HTML parsers keep home/away orientation and carry rowspan dates without invented scores', () => {
  const npb = '<meta property="og:url" content="https://npb.jp/bis/eng/2026/games/gm20261005.html"><h4 class="the_game_on_day">October 5</h4><span class="link_box"><img src="/img/logo_e_l.gif"><div class="team_name">Rakuten</div><div class="score_text score_left">&nbsp;</div><div class="round">Rakuten Mobile<br>18:00</div><div class="score_text score_right">&nbsp;</div><img src="/img/logo_h_l.gif"><div class="team_name">SoftBank</div></span>';
  const match = parseNpbSchedule(npb, SPORT_LEAGUES.beisbol[1], '2026-10-05')[0];
  assert.equal(match.homeTeam.name, 'Rakuten'); assert.equal(match.liveScore.home, null); assert.equal(match.kickoff, '2026-10-05T09:00:00.000Z');
  assert.deepEqual(parseNpbSchedule(npb, SPORT_LEAGUES.beisbol[1], '2026-10-04'), []);
  const row = date => `<tr>${date ? '<td title="DATE" rowspan="2">10.05(MON)</td>' : ''}<td class="TIME">18:30</td><td title="GAME" class="loop_r">KIA</td><td><span class="score_schedule">${date ? '2:3' : ':'}</span></td><td title="GAME" class="loop_l">LG</td><td class="LOCATION">JAMSIL</td></tr>`;
  const kbo = `<span id="cph_lblGameMonth">2026.10</span><table summary="schdule">${row(true)}${row(false)}</table>`;
  const matches = parseKboSchedule(kbo, SPORT_LEAGUES.beisbol[2], '2026-10-06T01:00:00Z');
  assert.equal(matches.length, 2); assert.equal(matches[0].homeTeam.name, 'LG'); assert.equal(matches[0].finalScore.home, 3); assert.equal(matches[0].finalScore.away, 2);
  assert.equal(matches[1].liveScore.home, null); assert.equal(matches[1].kickoff, '2026-10-05T09:30:00.000Z');
});

test('ESPN parsers split NBA preseason and flatten singles, Grand Slams and both tours', () => {
  const comp = { id: 'game', date: new Date(NOW).toISOString(), status: { type: { state: 'pre' } }, competitors: [
    { id: '1', homeAway: 'home', team: { id: '1', displayName: 'A' }, athlete: { displayName: 'Jugador A' } },
    { id: '2', homeAway: 'away', team: { id: '2', displayName: 'B' }, athlete: { displayName: 'Jugador B' } }
  ] };
  const event = { id: '1', date: comp.date, season: { year: 2027 }, seasonType: { type: 1 }, competitions: [comp] };
  assert.equal(parseBasketballEvent(event).leagueId, 'nba_preseason');
  event.seasonType.type = 2; assert.equal(parseBasketballEvent(event).leagueId, 'nba');
  const tournaments = { events: [{ name: 'Wimbledon', groupings: [{ grouping: { slug: 'mens-singles' }, competitions: [comp] }, { grouping: { slug: 'mens-doubles' }, competitions: [comp] }] }] };
  const parsed = parseTennisEvents(tournaments, 'atp');
  assert.equal(parsed.length, 1); assert.equal(parsed[0].leagueId, 'wimbledon'); assert.equal(parsed[0].maxSets, 5); assert.equal(parsed[0].liveScore.home, null);
  comp.round = { displayName: 'Qualifying Round' }; assert.equal(parseTennisEvents(tournaments, 'atp')[0].maxSets, 3);
  comp.round = { displayName: 'Qualifying Final' }; assert.equal(parseTennisEvents(tournaments, 'atp')[0].maxSets, 5);
  tournaments.events[0].groupings[0].grouping.slug = 'womens-singles'; assert.equal(parseTennisEvents(tournaments, 'wta')[0].maxSets, 3);
});
