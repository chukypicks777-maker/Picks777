import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateHistory, enrichHistoricalStats, readHistoricalSummary } from '../server/services/verifiedStats.js';
import { parseEspnEvent, parseSummaryDetails, LEAGUES } from '../server/services/footballDataService.js';
import { parseMlbGame, parseNpbInnings, parseKboSchedule } from '../server/services/baseballDataService.js';
import { SPORT_LEAGUES } from '../src/constants/leagues.js';
import { baseballAnalysis } from '../server/services/sportProbabilityModel.js';
import { setCachedAnalysis, getCachedAnalysis, mergeFreshMatch, clearAllAnalysisCache } from '../src/utils/analysisCache.js';

test('unfilled all-zero ESPN boxscores cannot masquerade as observed corners, cards or fouls', () => {
  const match = { id: 'empty-box', status: 'FINISHED', kickoff: new Date().toISOString(), homeTeamId: 'h', awayTeamId: 'a' };
  const date = new Date(Date.now() - 86400000).toISOString();
  const names = ['foulsCommitted', 'yellowCards', 'wonCorners', 'possessionPct', 'totalShots', 'totalPasses'];
  const statistics = names.map(name => ({ name, displayValue: '0' }));
  const data = { header: { competitions: [{ id: match.id, date, status: { type: { completed: true } }, competitors: [{ id: 'h', score: '2' }, { id: 'a', score: '1' }] }] },
    boxscore: { teams: ['h', 'a'].map(id => ({ team: { id }, statistics })) } };
  const row = readHistoricalSummary(data, 'h', Date.now());
  assert.equal(row.goalsFor, 2); assert.equal(row.corners, null); assert.equal(row.cards, null); assert.equal(row.fouls, null);
  assert.equal(aggregateHistory(Array(5).fill(row)).corners, null);
  assert.equal(parseSummaryDetails(data, match).boxscore.home.corners, null);
  data.boxscore.teams[0].statistics = statistics.map(s => s.name === 'totalPasses' ? { ...s, displayValue: '100' } : s);
  assert.equal(readHistoricalSummary(data, 'h', Date.now()).corners, 0, 'A reported zero in a populated block remains a real zero');
});

test('goal sample size is independent of corners and never turns absent halves into zero scored goals', async t => {
  const kickoff = new Date(Date.now() + 86400000).toISOString();
  const rows = Array.from({ length: 5 }, (_, i) => ({ id: String(i), date: kickoff, goalsFor: 2, goalsAgainst: 1, corners: 4, ownHalves: null, rivalHalves: null }));
  const summary = aggregateHistory(rows);
  assert.equal(summary.sampleSizes.goals, 5); assert.equal(summary.sampleSizes.halves, 0);
  assert.equal(summary.goalsFor, 10); assert.equal(summary.goalsAgainst, 5);
  assert.equal(aggregateHistory(rows.map(row => ({ ...row, goalsFor: null }))).goalsFor, null);
  const events = Array.from({ length: 5 }, (_, i) => ({ id: `goal-truth-${i}`, date: new Date(Date.now() - (i + 1) * 86400000).toISOString(), competitions: [{ status: { type: { completed: true } } }] }));
  t.mock.method(globalThis, 'fetch', async url => new Response(JSON.stringify(String(url).includes('/schedule') ? { events } : {
    header: { competitions: [{ id: String(url).split('=').at(-1), date: events[0].date, status: { type: { completed: true } }, competitors: [{ id: 'h', score: '2' }, { id: 'a', score: '1' }] }] },
    boxscore: { teams: [{ team: { id: 'h' }, statistics: [{ name: 'wonCorners', value: 4 }] }, { team: { id: 'a' }, statistics: [{ name: 'wonCorners', value: 5 }] }] }
  }), { headers: { 'Content-Type': 'application/json' } }));
  const enriched = await enrichHistoricalStats({ id: 'goal-sample-truth', espnCode: 'eng.1', kickoff, status: 'SCHEDULED', homeTeamId: 'h', awayTeamId: 'a', homeTeam: {}, awayTeam: {} }, { forceRefresh: true });
  assert.equal(enriched.homeTeam.goalsFor, 10); assert.equal(enriched.homeTeam.goalsAgainst, 5); assert.equal(enriched.homeTeam.gamesPlayed, 5);
  assert.equal(enriched.halfGoals, null);
});

test('today standings cannot supply a supposedly pregame model for an already finished football fixture', () => {
  const event = { id: 'finished-no-leak', date: new Date().toISOString(), competitions: [{ status: { type: { completed: true } }, competitors: [{ homeAway: 'home', team: { id: 'h', name: 'A' }, score: '1' }, { homeAway: 'away', team: { id: 'a', name: 'B' }, score: '0' }] }] };
  const standings = ['h', 'a'].map(teamId => ({ teamId, gamesPlayed: 10, goalsFor: 50, goalsAgainst: 0 }));
  const match = parseEspnEvent(event, LEAGUES[0], standings);
  assert.equal(match.model, null); assert.deepEqual(match.probabilities, {}); assert.equal(match.finalScore.home, 1);
});

test('fresh polling owns model, odds and timestamps even when cached enrichment contains old values', () => {
  clearAllAnalysisCache();
  const fresh = { id: 'fresh-authority', status: 'LIVE', liveMinute: "40'", liveScore: { home: 1, away: 0 }, fetchedAt: new Date().toISOString(), odds: { homeWin: 2 }, probabilities: { homeWin: 50 }, model: { probabilities: { homeWin: 50 } }, homeTeam: { id: 'h' }, awayTeam: { id: 'a' } };
  setCachedAnalysis(fresh.id, fresh, { aiReport: { aiAvailable: true }, enrichedMatch: { ...fresh, liveScore: { home: 0, away: 0 }, probabilities: { homeWin: 99 }, model: { probabilities: { homeWin: 99 } }, odds: { homeWin: 1.1 }, fetchedAt: '2020-01-01', homeTeam: { id: 'h', avgCorners: 6 } } });
  const merged = mergeFreshMatch(fresh);
  assert.deepEqual(merged.liveScore, fresh.liveScore); assert.deepEqual(merged.model, fresh.model); assert.deepEqual(merged.odds, fresh.odds); assert.equal(merged.fetchedAt, fresh.fetchedAt);
  assert.equal(merged.homeTeam.avgCorners, 6);
  assert.equal(getCachedAnalysis(fresh.id, { ...fresh, liveMinute: "41'" }), null);
  assert.equal(mergeFreshMatch({ ...fresh, probabilities: { homeWin: 51 } }).aiReport, null);
});

test('verified zero innings retain their sample without claiming deterministic future draws or unders', () => {
  const now = Date.now(), match = { id: 'inning-truth', sport: 'beisbol', leagueId: 'mlb', status: 'SCHEDULED', kickoff: new Date(now + 86400000).toISOString(), homeTeam: { id: 'h' }, awayTeam: { id: 'a' } };
  const games = Array.from({ length: 6 }, (_, i) => ({ ...match, id: `old-${i}`, status: 'FINISHED', kickoff: new Date(now - (i + 1) * 86400000).toISOString(), finalScore: { home: 4, away: 2 } }));
  assert.equal(baseballAnalysis(match, games, now).firstInning.home, null);
  assert.equal(baseballAnalysis(match, games, now).firstFive[0].over, null);
  const observed = games.map(game => ({ ...game, inningScores: Array.from({ length: 5 }, (_, i) => ({ num: i + 1, home: 0, away: 0 })) }));
  const zeroHistory = baseballAnalysis(match, observed, now);
  assert.deepEqual(zeroHistory.firstInning, { home: null, draw: null, away: null });
  assert.equal(zeroHistory.firstFive[0].under, null);
  assert.deepEqual(zeroHistory.inningSampleSize, { first: { home: 6, away: 6 }, five: { home: 6, away: 6 } });
  const incomplete = observed.map(game => ({ ...game, inningScores: game.inningScores.map(inning => ({ ...inning, home: null })) }));
  assert.equal(baseballAnalysis(match, incomplete, now).firstInning.draw, null);
});

test('MLB inning parser preserves unplayed innings and zeroes; no nine-inning default is invented', () => {
  const game = { gamePk: 123, gameDate: new Date().toISOString(), status: { abstractGameState: 'Final' }, teams: { home: { team: { id: 1 }, score: 1 }, away: { team: { id: 2 }, score: 0 } }, linescore: { innings: [{ num: 1, home: { runs: 0 }, away: { runs: 0 } }, { num: 9, away: { runs: 0 } }] } };
  const parsed = parseMlbGame(game, SPORT_LEAGUES.beisbol[0]);
  assert.equal(parsed.inningScores[0].home, 0); assert.equal(parsed.inningScores[1].home, null); assert.equal(parsed.scheduledInnings, null);
});

test('NPB inning tables require the same official fixture, team order and score totals', () => {
  const match = { sourceUrl: 'https://npb.jp/bis/eng/2026/games/test.html', awayTeam: { id: 'npb-c', name: 'Hiroshima' }, homeTeam: { id: 'npb-s', name: 'Yakult' }, finalScore: { away: 1, home: 2 } };
  const row = (name, runs) => `<tr><td class="gmscoreteam">${name}</td>${runs.map(run => `<td class="gmscore">${run}</td>`).join('')}<td class="gmscore">-</td><td class="gmscore">${runs.reduce((a, b) => a + b, 0)}</td><td class="gmscore">4</td><td class="gmscore">0</td></tr>`;
  const html = '<meta property="og:url" content="http://npb.jp/bis/eng/2026/games/test.html"><img class="flagdetails" src="/bis/images/flag2026_c_1l.gif"><img class="flagdetails" src="/bis/images/flag2026_s_1l.gif">' + row('Hiroshima', [0, 1, 0, 0, 0]) + row('Yakult', [0, 0, 2, 0, 0]);
  assert.equal(parseNpbInnings(html, match)[2].home, 2);
  const winnerFirst = html.replace('flag2026_c_1l.gif', 'flag2026_temp_1l.gif').replace('flag2026_s_1l.gif', 'flag2026_c_1l.gif').replace('flag2026_temp_1l.gif', 'flag2026_s_1l.gif');
  assert.equal(parseNpbInnings(winnerFirst, match)[2].home, 2, 'Official header flags can list the winner first; inning rows identify away and home');
  assert.equal(parseNpbInnings(html.replace('Hiroshima', 'Other team'), match), null);
  assert.equal(parseNpbInnings(html, { ...match, finalScore: { away: 8, home: 2 } }), null);
  assert.equal(parseNpbInnings(html, { ...match, sourceUrl: 'https://npb.jp/bis/eng/2026/games/other.html' }), null);
});

test('a KBO score from today cannot falsely prove a match has finished', () => {
  const html = '<span id="cph_lblGameMonth">2026.10</span><table summary="schdule"><tr><td title="DATE">10.05(MON)</td><td class="TIME">14:00</td><td class="loop_r">KIA</td><td><span class="score_schedule">2:3</span></td><td class="loop_l">LG</td></tr></table>';
  const match = parseKboSchedule(html, SPORT_LEAGUES.beisbol[2], '2026-10-05T06:00:00Z')[0];
  assert.equal(match.status, 'UNKNOWN'); assert.equal(match.finalScore.home, null); assert.equal(match.liveScore.home, 3); assert.equal(match.liveSupported, false);
});
