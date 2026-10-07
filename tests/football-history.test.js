import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHistoryEvent, buildLeagueModel, rememberLeagueModel, forgetLeagueModels, modelFits, teamRecords, loadLeagueModel, leagueModelFor } from '../server/services/footballHistory.js';
import { applyFootballForecast } from '../server/services/probabilityModel.js';
import { listView } from '../server/services/footballDataService.js';
import { enrichHistoricalStats } from '../server/services/verifiedStats.js';
import { calculateTeamDetailedStats, calculateDifferential } from '../src/utils/mathProbabilities.js';
import { forecastFootball } from '../src/utils/footballModel.js';

const DAY = 86400000, NOW = Date.parse('2026-10-07T00:00:00Z');
const stats = (sot, corners, fouls) => [{ name: 'shotsOnTarget', value: sot }, { name: 'wonCorners', value: corners }, { name: 'foulsCommitted', value: fouls },
  { name: 'totalShots', value: sot * 2 }, { name: 'possessionPct', value: 50 }, { name: 'shotAssists', value: 6 }];
const goal = (team, minute, extra = {}) => ({ type: { text: 'Goal' }, scoringPlay: true, team: { id: team }, clock: { displayValue: minute }, ...extra });
const card = team => ({ type: { text: 'Yellow Card' }, yellowCard: true, team: { id: team }, clock: { displayValue: "30'" } });
function event({ id, time, home = '1', away = '2', hg = 2, ag = 1, status = 'STATUS_FULL_TIME', details, homeStats = stats(5, 6, 11), awayStats = stats(3, 4, 13) }) {
  return { id, date: new Date(time).toISOString(), competitions: [{ status: { type: { name: status, completed: true } }, details: details ?? [goal(home, "12'"), goal(home, "45'+2'"), goal(away, "46'"), card(home), card(away), card(away)],
    competitors: [{ id: home, homeAway: 'home', score: String(hg), statistics: homeStats }, { id: away, homeAway: 'away', score: String(ag), statistics: awayStats }] }] };
}

test('league history keeps regulation results, stoppage-time halves and unreported data as unknown', () => {
  const row = parseHistoryEvent(event({ id: 'a', time: NOW - DAY }));
  assert.deepEqual([row.hg, row.ag, row.hst, row.ast, row.hc, row.ac, row.hf, row.af, row.hy, row.ay], [2, 1, 5, 3, 6, 4, 11, 13, 1, 2]);
  assert.deepEqual([row.hthg, row.htag], [2, 0], "45'+2' belongs to the first half; 46' to the second");
  for (const status of ['STATUS_FINAL_AET', 'STATUS_FINAL_PEN', 'STATUS_SCHEDULED']) assert.equal(parseHistoryEvent(event({ id: status, time: NOW, status })), null);
  const mismatch = parseHistoryEvent(event({ id: 'b', time: NOW, hg: 3 }));
  assert.equal(mismatch.hg, 3); assert.equal(mismatch.hthg, null, 'Goal events that do not reproduce the score do not create halves');
  const noCards = parseHistoryEvent(event({ id: 'c', time: NOW, details: [goal('1', "10'"), goal('1', "80'"), goal('2', "70'")] }));
  assert.equal(noCards.hy, null); assert.equal(noCards.ay, null);
  const zeros = Array.from({ length: 8 }, (_, i) => ({ name: i ? `stat-${i}` : 'wonCorners', value: 0 }));
  const unfilled = parseHistoryEvent(event({ id: 'd', time: NOW, homeStats: zeros, awayStats: zeros }));
  assert.equal(unfilled.hc, null); assert.equal(unfilled.hst, null);
  const shootout = parseHistoryEvent(event({ id: 'e', time: NOW, hg: 1, ag: 1, details: [goal('1', "20'"), goal('2', "60'"), goal('1', "91'", { shootout: true })] }));
  assert.deepEqual([shootout.hthg, shootout.htag], [1, 0]);
});

function season(offsetDays, teams = ['1', '2', '3', '4', '5', '6']) {
  const events = [];
  let day = offsetDays, id = 0;
  for (let round = 0; round < 3; round++) for (const home of teams) for (const away of teams) {
    if (home === away) continue;
    const strong = Number(home) <= 2, weak = Number(away) >= 5;
    const hg = strong ? 3 : weak ? 2 : 1, ag = strong ? 0 : 1;
    const details = [...Array.from({ length: hg }, (_, i) => goal(home, i ? "70'" : "20'")), ...Array.from({ length: ag }, () => goal(away, "55'")), card(home), card(away)];
    events.push(event({ id: `${offsetDays}-${id++}`, time: NOW - day-- * DAY, home, away, hg, ag, details,
      homeStats: stats(strong ? 7 : 4, strong ? 8 : 5, 10), awayStats: stats(weak ? 2 : 4, weak ? 3 : 5, 12) }));
  }
  return events;
}

test('a compact league model drives forecasts, recorded averages and lean calendar responses', async t => {
  const league = { id: 'test-league', espnCode: 'test.1' };
  const model = buildLeagueModel(league, [{ events: season(420) }, { events: season(200), leagues: [{ season: { startDate: new Date(NOW - 250 * DAY).toISOString() } }] }], NOW);
  assert.ok(model.games >= 180);
  assert.ok(JSON.stringify(model).length < 20000, 'Only fitted parameters and short records are stored');
  assert.equal(model.teams['1'].sampleSizes.goals, 10);
  const rows = [...season(420), ...season(200)].map(parseHistoryEvent).filter(Boolean);
  const last = rows.filter(r => r.home === '1' || r.away === '1').sort((a, b) => b.time - a.time).slice(0, 10);
  assert.equal(model.teams['1'].avgCorners, Number((last.reduce((s, r) => s + (r.home === '1' ? r.hc : r.ac), 0) / 10).toFixed(2)));
  assert.equal(teamRecords(rows, '1', NOW - 10000 * DAY).avgCorners, null, 'Fewer than five earlier games: no average');
  const forecast = forecastFootball(modelFits(model), '1', '6', {});
  assert.ok(forecast.probabilities.homeWin > 60 && forecast.corners.expected.home > forecast.corners.expected.away);

  rememberLeagueModel(model);
  t.after(forgetLeagueModels);
  const match = applyFootballForecast({ id: 'espn-1', espnCode: 'test.1', status: 'SCHEDULED', kickoff: new Date(NOW + DAY).toISOString(),
    homeTeamId: '1', awayTeamId: '6', homeTeam: { id: '1', name: 'Uno' }, awayTeam: { id: '6', name: 'Seis' }, odds: {} });
  assert.equal(match.model.engine, 'football-ratings-2026-10-07');
  assert.ok(match.model.corners && match.model.cards && match.halfGoals);
  const lean = listView(match);
  for (const field of ['corners', 'cards', 'halves', 'scoreDistribution', 'statisticalProbabilities']) assert.equal(lean.model[field], undefined, field);
  assert.equal(lean.probabilitySources, undefined);
  assert.deepEqual(lean.model.probabilities, match.model.probabilities);
  assert.ok(JSON.stringify(lean).length < JSON.stringify(match).length / 2);

  // Detail statistics come from the stored league records without provider calls.
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('No per-match summary requests'); });
  const enriched = await enrichHistoricalStats(match);
  assert.equal(enriched.homeTeam.statsSource, 'ESPN · resultados de la liga');
  assert.equal(enriched.homeTeam.avgCorners, model.teams['1'].avgCorners);
  const home = calculateTeamDetailedStats(enriched.homeTeam, true, enriched), away = calculateTeamDetailedStats(enriched.awayTeam, false, enriched);
  const diff = calculateDifferential(home, away, enriched);
  assert.equal(diff.totalMatchCorners, match.model.corners.expected.total);
  assert.equal(diff.matchCornersProbs.over85, match.model.corners.total.over85);
  assert.equal(diff.matchCardsProbs.over35, match.model.cards.total.over35);
  assert.equal(home.expectedCorners, match.model.corners.expected.home);
});

test('an old league model is served at once while a fresh one is built in the background; failures are not retried per request', async t => {
  forgetLeagueModels();
  t.after(forgetLeagueModels);
  const league = { id: 'refresh-league', espnCode: 'refresh.1' };
  const old = { ...buildLeagueModel(league, [{ events: season(420) }, { events: season(200) }], NOW), builtAt: Date.now() - 7 * 3600000 };
  rememberLeagueModel(old);
  let release, requests = 0;
  const gate = new Promise(resolve => { release = resolve; });
  t.mock.method(globalThis, 'fetch', async () => { requests++; await gate; return new Response(JSON.stringify({ events: [...season(420), ...season(200)] })); });
  const served = await loadLeagueModel(league);
  assert.equal(served.builtAt, old.builtAt, 'The member does not wait for the provider');
  release();
  for (let i = 0; i < 50 && leagueModelFor('refresh.1').builtAt === old.builtAt; i++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(leagueModelFor('refresh.1').builtAt > old.builtAt, 'The refreshed model replaces the old one');
  assert.equal(requests, 2, 'One refresh: previous and current calendar years');

  const empty = { id: 'empty-league', espnCode: 'empty.1' };
  t.mock.method(globalThis, 'fetch', async () => { requests++; return new Response(JSON.stringify({ events: [] })); });
  const before = requests;
  assert.equal(await loadLeagueModel(empty), null);
  assert.equal(await loadLeagueModel(empty), null);
  assert.equal(requests - before, 2, 'An unusable league is not rebuilt again on the next request');
});
