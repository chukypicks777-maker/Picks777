// Live read-only audit. Run with --import ./tests/setup.js to isolate credentials.
// Responses are evidence only; this script never writes application seed data.
import fs from 'node:fs/promises';
import { getFootballFeed, enrichMatchWithRealData, LEAGUES, parseEspnEvent } from '../server/services/footballDataService.js';
import { getSportsFeed, getSportsHistory, getSportsMatch } from '../server/services/sportsDataService.js';
import { analyzeSportMatch } from '../server/services/sportProbabilityModel.js';
import { poissonModel } from '../server/services/probabilityModel.js';
import { readHistoricalSummary, aggregateHistory } from '../server/services/verifiedStats.js';
import { calculateCornerProbabilities } from '../src/utils/mathProbabilities.js';
import { totalLines } from '../src/utils/probability.js';

// Standalone audits need a referenced handle while upstream timeout signals
// (which Node intentionally unrefs) are pending. The web server already has one.
const auditKeepAlive = setInterval(() => {}, 1000);
const now = Date.now(), failures = [], checks = [], samples = [], backtests = [];
const check = (name, pass, extra = {}) => { checks.push({ name, pass: Boolean(pass), ...extra }); if (!pass) failures.push(name); };
const known = value => typeof value === 'number' && Number.isFinite(value);
const outcomes = (name, values) => {
  const numbers = Object.values(values || {});
  check(name + ':range', numbers.every(value => value == null || (known(value) && value >= 0 && value <= 100)));
  if (numbers.length && numbers.every(known)) check(name + ':sum', Math.abs(numbers.reduce((a, b) => a + b, 0) - 100) < 0.11);
};
const ladder = (name, rows) => {
  (rows || []).forEach((row, i) => {
    outcomes(name + ':' + row.line, { over: row.over, under: row.under });
    if (i && known(row.over) && known(rows[i - 1].over)) check(name + ':monotonic:' + row.line, row.over <= rows[i - 1].over);
  });
};
const provenance = match => check(match.id + ':source', /^https:\/\//.test(match.sourceUrl || '') && Number.isFinite(Date.parse(match.fetchedAt)) && Date.parse(match.fetchedAt) <= Date.now() + 1000);
const footballMath = match => {
  provenance(match);
  const p = match.model?.probabilities || match.probabilities || {};
  outcomes(match.id + ':1x2', { home: p.homeWin, draw: p.draw, away: p.awayWin });
  outcomes(match.id + ':btts', { yes: p.bttsYes, no: p.bttsNo });
  ladder(match.id + ':goals', [0.5, 1.5, 2.5, 3.5, 4.5].map(line => ({ line, over: p['over' + String(line).replace('.', '')], under: p['under' + String(line).replace('.', '')] })));
  if (known(p.bttsYes) && known(p.over15)) check(match.id + ':btts-subset', p.bttsYes <= p.over15 + 1e-8);
};
const sportMath = match => {
  provenance(match);
  const a = match.analysis || {};
  outcomes(match.id + ':winner', a.winner);
  if (match.sport === 'beisbol') {
    outcomes(match.id + ':inning1', a.firstInning);
    ladder(match.id + ':innings1-5', a.firstFive);
    for (const side of ['home', 'away']) { outcomes(match.id + ':score:' + side, a.scoresRun?.[side]); ladder(match.id + ':runs:' + side, a.teamRuns?.[side]); }
    if (a.inningSampleSize?.first.home < 5 || a.inningSampleSize?.first.away < 5) check(match.id + ':no-invented-inning', a.firstInning?.home === null);
  } else if (match.sport === 'tenis') {
    outcomes(match.id + ':first-set', a.firstSet); outcomes(match.id + ':second-set', a.secondSet);
    for (const side of ['home', 'away']) { outcomes(match.id + ':wins-set:' + side, a.winsSet?.[side]); if (known(a.winsSet?.[side]?.yes) && known(a.winner?.[side])) check(match.id + ':set-subset:' + side, a.winsSet[side].yes >= a.winner[side] - 0.11); }
  } else for (const side of ['home', 'away']) {
    const rows = [...(a.handicaps?.[side] || [])].sort((a, b) => a.line - b.line);
    for (let i = 1; i < rows.length; i++) if (known(rows[i].probability) && known(rows[i - 1].probability)) check(match.id + ':handicap-monotonic:' + side + ':' + i, rows[i].probability >= rows[i - 1].probability);
    for (const row of rows) {
      const other = a.handicaps?.[side === 'home' ? 'away' : 'home']?.find(other => other.line === -row.line);
      if (known(row.probability) && known(other?.probability)) check(match.id + ':handicap-complement:' + side + ':' + row.line, Math.abs(row.probability + other.probability - 100) < 0.11);
    }
  }
};
const day = offset => new Date(now + offset * 86400000).toISOString().slice(0, 10).replaceAll('-', '');
const fetchJson = async url => {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'Cache-Control': 'no-cache' } });
  if (!response.ok) throw new Error('Provider HTTP ' + response.status); return response.json();
};
const feeds = await Promise.all([getFootballFeed(), getFootballFeed({ sport: 'femenil' }), ...['beisbol', 'tenis', 'basquetbol'].map(sport => getSportsFeed(sport))]);
for (const [i, feed] of feeds.entries()) {
  const sport = ['futbol', 'femenil', 'beisbol', 'tenis', 'basquetbol'][i];
  for (const match of feed.matches) (i < 2 ? footballMath : sportMath)(match);
  samples.push({ sport, matches: feed.matches.length, coverage: feed.coverage });
  console.log(JSON.stringify({ stage: 'feed', sport, count: feed.matches.length, failures: failures.length }));
}

// Cross-check scoring records and every derived metric on two fixtures per league.
for (const league of LEAGUES) {
  const feed = feeds[league.sport === 'femenil' ? 1 : 0];
  const selected = feed.matches.filter(match => match.leagueId === league.id).slice(0, 2);
  for (const match of selected) {
    const detail = await enrichMatchWithRealData(match);
    const metricChecks = [];
    for (const team of [detail.homeTeam, detail.awayTeam]) {
      const rows = await Promise.all((team.statsRecords || []).map(async record => {
        try { return readHistoricalSummary(await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${record.leagueCode || match.espnCode}/summary?event=${record.id}`), team.id, Math.min(now, Date.parse(match.kickoff))); } catch { return null; }
      }));
      const independentlyRead = aggregateHistory(rows);
      for (const [field, metric] of [['avgCorners', 'corners'], ['avgCornersConceded', 'cornersAgainst'], ['avgYellowCards', 'cards'], ['avgFouls', 'fouls'], ['bttsRate', 'bttsRate']]) {
        if (!team.statsRecords?.length) continue;
        const reported = team[field], reread = independentlyRead[metric];
        const pass = reported === null && reread === null || known(reported) && known(reread) && Math.abs(reported - reread) < 1e-8;
        check(match.id + ':stats:' + team.id + ':' + field, pass);
        metricChecks.push({ team: team.name, field, reported, reread, sample: independentlyRead.sampleSizes });
      }
    }
    const summary = await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${match.espnCode}/summary?event=${match.espnEventId}`);
    const comp = summary.header?.competitions?.[0];
    check(match.id + ':fixture-identity', comp?.competitors?.some(team => String(team.id) === match.homeTeamId) && comp?.competitors?.some(team => String(team.id) === match.awayTeamId));
    footballMath(detail);
    samples.push({ id: match.id, league: league.name, sourceUrl: match.sourceUrl, detailAvailable: detail.detailsAvailable, metricChecks });
    console.log(JSON.stringify({ stage: 'football-detail', league: league.id, id: match.id, failures: failures.length }));
  }
}

const npb = feeds[2].matches.find(match => match.leagueId === 'npb' && match.status === 'SCHEDULED');
if (npb) {
  const detail = await getSportsMatch('beisbol', npb.id); sportMath(detail);
  samples.push({ id: npb.id, sourceUrl: npb.sourceUrl, inningSampleSize: detail.analysis.inningSampleSize });
  console.log(JSON.stringify({ stage: 'npb-innings', sample: detail.analysis.inningSampleSize }));
}

// Chronological holdouts: no target score, future result, or present-day bookmaker odds.
const scoreBacktest = (sport, games, predict) => {
  const byLeague = new Map();
  for (const game of games.filter(game => game.status === 'FINISHED').sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))) {
    if (!known(game.finalScore?.home) || !known(game.finalScore?.away) || game.finalScore.home === game.finalScore.away || game.retired) continue;
    const p = predict(game, games);
    if (!known(p) || p < 0 || p > 1) continue;
    const y = game.finalScore.home > game.finalScore.away ? 1 : 0;
    if (!byLeague.has(game.leagueId)) byLeague.set(game.leagueId, []);
    byLeague.get(game.leagueId).push({ id: game.id, kickoff: game.kickoff, homeProbability: p, observedHomeWin: y });
  }
  for (const [league, records] of byLeague) {
    const n = records.length, brier = records.reduce((s, row) => s + (row.homeProbability - row.observedHomeWin) ** 2, 0) / n;
    const accuracy = records.filter(row => (row.homeProbability >= 0.5 ? 1 : 0) === row.observedHomeWin).length / n;
    const bins = Array.from({ length: 5 }, (_, i) => {
      const rows = records.filter(row => row.homeProbability >= i / 5 && (row.homeProbability < (i + 1) / 5 || i === 4));
      return { range: [i / 5, (i + 1) / 5], n: rows.length, meanPrediction: rows.length ? rows.reduce((s, row) => s + row.homeProbability, 0) / rows.length : null, observedFrequency: rows.length ? rows.reduce((s, row) => s + row.observedHomeWin, 0) / rows.length : null };
    });
    backtests.push({ sport, league, n, brier, neutralBrier: 0.25, accuracy, bins, records, note: 'Exploratory retrospective test; excludes draws and current odds. Uses provider records available now, not archived contemporaneous predictions. Not a validated hit rate.' });
    console.log(JSON.stringify({ stage: 'backtest', sport, league, n, brier, accuracy }));
  }
};
for (const sport of ['beisbol', 'tenis', 'basquetbol']) {
  const { games } = await getSportsHistory(sport);
  scoreBacktest(sport, games, (game, all) => {
    const a = analyzeSportMatch({ ...game, status: 'SCHEDULED', odds: {} }, all, Date.parse(game.kickoff));
    return known(a.winner.home) && known(a.winner.away) && a.winner.home + a.winner.away > 0 ? a.winner.home / (a.winner.home + a.winner.away) : null;
  });
}
for (const league of LEAGUES) {
  try {
    const data = await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league.espnCode}/scoreboard?dates=${day(-100)}-${day(-1)}&limit=1000`);
    const games = (data.events || []).map(event => parseEspnEvent(event, league)).filter(Boolean);
    scoreBacktest(league.sport, games, (game, all) => {
      const team = id => {
        const sample = all.filter(previous => previous.id !== game.id && previous.status === 'FINISHED' && Date.parse(previous.kickoff) < Date.parse(game.kickoff) && [previous.homeTeam.id, previous.awayTeam.id].includes(id))
          .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff)).slice(0, 20);
        return { gamesPlayed: sample.length, goalsFor: sample.reduce((sum, previous) => sum + previous.finalScore[previous.homeTeam.id === id ? 'home' : 'away'], 0), goalsAgainst: sample.reduce((sum, previous) => sum + previous.finalScore[previous.homeTeam.id === id ? 'away' : 'home'], 0) };
      };
      const m = poissonModel(team(game.homeTeam.id), team(game.awayTeam.id));
      return m ? m.probabilities.homeWin / (m.probabilities.homeWin + m.probabilities.awayWin) : null;
    });
  } catch { backtests.push({ sport: league.sport, league: league.id, n: 0, note: 'Historical scoreboard range unavailable; accuracy not established.' }); }
}
// The match corners and cards ladders are estimated, never observed success rates.
for (const lambda of [0, 1, 2.5, 4, 7, 10, 15]) {
  const corners = calculateCornerProbabilities(lambda);
  ladder('corner-model:' + lambda, [5.5, 6.5, 7.5, 8.5, 9.5].map(line => ({ line, over: corners['over' + String(line).replace('.', '')], under: corners['under' + String(line).replace('.', '')] })));
  const cards = totalLines(lambda);
  ladder('card-model:' + lambda, [2.5, 3.5, 4.5].map(line => ({ line, over: cards['over' + String(line).replace('.', '')], under: cards['under' + String(line).replace('.', '')] })));
}
const report = { checkedAt: new Date().toISOString(), pass: failures.length === 0, checks: checks.length, failures, samples, backtests,
  limitations: ['Provider cross-checks are not independent ground truth.', 'Consultation time is not provider update time.', 'NPB/KBO have no verified live scoreboard in this integration.', 'Exploratory backtests cannot prove future accuracy or probability calibration.', 'No fabricated fixture, score or observed statistic is substituted for missing data.'] };
await fs.mkdir('artifacts', { recursive: true });
await fs.writeFile('artifacts/sports-deep-audit-2026-10-05.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ complete: true, checks: checks.length, pass: report.pass, failures, backtestLeagues: backtests.length }));
if (!report.pass) process.exitCode = 1;
clearInterval(auditKeepAlive);
