import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { getSportsFeed, getSportsDetails, getSportsHistory } from '../server/services/sportsDataService.js';
import { isKnownFixture } from '../src/utils/fixtureEligibility.js';

const checks = [], started = new Date().toISOString();
for (const [sport, leagueId] of [['tenis', 'wta'], ['beisbol', 'mlb'], ['basquetbol', 'nba_preseason']]) {
  const start = performance.now();
  const feed = await getSportsFeed(sport, { calendarOnly: true, leagueId });
  assert.ok(feed.coverage.some(league => league.status !== 'unavailable'));
  assert.ok(feed.matches.every(isKnownFixture));
  const calendarMs = Math.round(performance.now() - start);
  const upcoming = feed.matches.filter(match => match.status === 'SCHEDULED' && Date.parse(match.kickoff) > Date.now());
  const selected = sport === 'tenis' ? upcoming.filter(match => /Hanyu|Uchijima/.test(`${match.homeTeam.name} ${match.awayTeam.name}`)) : upcoming.slice(0, 2);
  const detailStart = performance.now();
  const result = await getSportsDetails(sport, selected.map(match => match.id), { leagueId });
  assert.deepEqual(result.errors, []);
  const records = [];
  for (const match of result.matches) {
    const a = match.analysis;
    const finite = Object.values(a.winner).filter(value => value !== null);
    assert.ok(finite.every(value => value >= 0 && value <= 100));
    if (finite.length) assert.ok(Math.abs(finite.reduce((sum, value) => sum + value, 0) - 100) <= 0.11);
    if (sport === 'tenis') {
      assert.ok(a.sampleSize.home >= 5 && a.sampleSize.away >= 5, 'The reported N/D pairs have real prior history');
      assert.ok(Number.isFinite(a.winner.home));
      for (const key of ['firstSet', 'secondSet']) assert.equal(a[key].home + a[key].away, 100);
      for (const side of ['home', 'away']) assert.equal(a.winsSet[side].yes + a.winsSet[side].no, 100);
    }
    for (const rows of [a.teamRuns?.home, a.teamRuns?.away, a.firstFive, a.totalRuns].filter(Boolean)) {
      for (let i = 0; i < rows.length; i++) if (rows[i].over !== null) {
        assert.equal(rows[i].over + rows[i].under, 100);
        if (i) assert.ok(rows[i].over <= rows[i - 1].over);
      }
    }
    if (a.records) for (const list of Object.values(a.records)) assert.ok(list.every(record => Date.parse(record.date) < Math.min(Date.parse(match.kickoff), Date.now()) && record.sourceUrl));
    records.push({ id: match.id, teams: [match.homeTeam.name, match.awayTeam.name], kickoff: match.kickoff, source: match.source, sourceUrl: match.sourceUrl,
      fetchedAt: match.fetchedAt, winner: a.winner, sampleSize: a.sampleSize, setSampleSize: a.setSampleSize, inningSampleSize: a.inningSampleSize,
      form: a.form, probabilitySource: a.probabilitySource, method: a.method, notice: a.notice });
  }
  const detailMs = Math.round(performance.now() - detailStart);
  let verifiedHistory;
  if (sport === 'tenis') {
    const { games } = await getSportsHistory(sport, Date.now(), { leagueId });
    verifiedHistory = records.map(record => ({ id: record.id, samples: record.teams.map((name, side) => {
      const teamId = result.matches.find(match => match.id === record.id)[`${side ? 'away' : 'home'}Team`].id;
      const prior = games.filter(game => game.tour === 'wta' && game.status === 'FINISHED' && !game.retired && [game.homeTeam.id, game.awayTeam.id].includes(teamId)
        && Date.parse(game.kickoff) < Math.min(Date.parse(record.kickoff), Date.now()) && game.id !== record.id && game.setScores.length);
      assert.ok(prior.length >= 5);
      return { name, verifiedCompletedSingles: prior.length, sourceExamples: prior.slice(-3).map(game => ({ id: game.id, date: game.kickoff, sourceUrl: game.sourceUrl, score: game.finalScore, sets: game.setScores })) };
    }) }));
  }
  checks.push({ sport, leagueId, calendarMs, detailMs, calendarCount: feed.matches.length, upcomingCount: upcoming.length, inspectedCount: records.length, records, verifiedHistory });
}
const report = { started, finished: new Date().toISOString(), pass: true, checks,
  limitation: 'Provider queries at the recorded time, not future prediction accuracy. These checks do not call the paid AI. Missing histories remain unavailable.' };
await fs.writeFile('artifacts/sports-loading-live-2026-10-05.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
