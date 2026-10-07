import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { poissonModel } from '../server/services/probabilityModel.js';
import { getSportsHistory } from '../server/services/sportsDataService.js';
import { baseballAnalysis } from '../server/services/sportProbabilityModel.js';

// Run with tests/setup.js: no Redis credentials or paid AI are used.
const now = Date.now();
const score = () => ({ n: 0, hits: 0, brier: 0, logLoss: 0, predicted: 0, bins: {} });
function observe(metric, probabilities, outcome) {
  const p = probabilities.map(value => value / 100);
  if (p.some(value => !Number.isFinite(value)) || Math.abs(p.reduce((a, b) => a + b, 0) - 1) > 0.005) return;
  const winner = p.indexOf(Math.max(...p));
  metric.n++; metric.hits += Number(winner === outcome);
  metric.brier += p.reduce((sum, value, i) => sum + (value - Number(i === outcome)) ** 2, 0);
  metric.logLoss -= Math.log(Math.max(1e-12, p[outcome]));
  metric.predicted += p[winner];
  const binKey = `${Math.floor(p[winner] * 10) * 10}-${Math.floor(p[winner] * 10) * 10 + 10}`;
  const bin = metric.bins[binKey] ||= { n: 0, hits: 0, predicted: 0 };
  bin.n++; bin.hits += Number(winner === outcome); bin.predicted += p[winner];
}
const round = n => Number(n.toFixed(5));
const finish = m => ({ forecasts: m.n, hits: m.hits, misses: m.n - m.hits, accuracy: m.n ? round(m.hits / m.n) : null,
  brierMulticlassSum: m.n ? round(m.brier / m.n) : null, logLoss: m.n ? round(m.logLoss / m.n) : null,
  reliability: Object.entries(m.bins).map(([range, b]) => ({ range, n: b.n, meanPredicted: round(b.predicted / b.n), observed: round(b.hits / b.n) })) });
await fs.mkdir('artifacts', { recursive: true });
const football = await Promise.all(['fr.1', 'en.1', 'de.1', 'es.1', 'it.1'].map(async league => {
  const url = `https://raw.githubusercontent.com/openfootball/football.json/master/2025-26/${league}.json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${league}: ${response.status}`);
  const raw = await response.text(), data = JSON.parse(raw);
  await fs.writeFile(`artifacts/audit-data-${league}-2025-26.json`, raw);
  const matches = data.matches.filter(m => m.score?.ft?.length === 2 && m.score.ft.every(Number.isInteger))
    .sort((a, b) => a.date.localeCompare(b.date));
  const totals = new Map(), winner = score(), goals15 = score();
  let alwaysHomeHits = 0;
  // Batch by calendar day: no result from the forecast day can enter its inputs.
  for (const date of [...new Set(matches.map(match => match.date))]) {
    const batch = matches.filter(match => match.date === date);
    for (const m of batch) {
      const model = poissonModel(totals.get(m.team1), totals.get(m.team2));
      if (!model) continue;
      const [h, a] = m.score.ft, p = model.probabilities;
      observe(winner, [p.homeWin, p.draw, p.awayWin], h > a ? 0 : h === a ? 1 : 2);
      observe(goals15, [p.over15, p.under15], h + a > 1.5 ? 0 : 1);
      alwaysHomeHits += Number(h > a);
    }
    for (const m of batch) for (const [name, own, against] of [[m.team1, ...m.score.ft], [m.team2, ...m.score.ft.toReversed()]]) {
      const team = totals.get(name) || { gamesPlayed: 0, goalsFor: 0, goalsAgainst: 0 };
      team.gamesPlayed++; team.goalsFor += own; team.goalsAgainst += against; totals.set(name, team);
    }
  }
  return { league, source: url, license: 'CC0 / public domain', sha256: createHash('sha256').update(raw).digest('hex'),
    finishedMatches: matches.length, period: [matches[0]?.date, matches.at(-1)?.date], winner: finish(winner), goals15: finish(goals15),
    alwaysHome: { hits: alwaysHomeHits, forecasts: winner.n, accuracy: round(alwaysHomeHits / winner.n) } };
}));
const baseball = [];
for (const leagueId of ['kbo', 'mlb']) {
  const { games, coverage } = await getSportsHistory('beisbol', now, { leagueId, calendarOnly: true });
  await fs.writeFile(`artifacts/audit-data-${leagueId}-2026-10-07.json`, JSON.stringify({ games, coverage }));
  const winner = score(), total95 = score();
  const finished = games.filter(game => game.status === 'FINISHED' && Date.parse(game.kickoff) < now && game.finalScore);
  for (const game of finished) {
    // Using midnight as cutoff excludes unfinished/same-day games from training.
    const cutoff = Date.parse(game.kickoff.slice(0, 10));
    const analysis = baseballAnalysis({ ...game, odds: {} }, games, cutoff);
    const [h, a] = [game.finalScore.home, game.finalScore.away];
    if (![h, a].every(Number.isInteger)) continue;
    if (game.allowsDraw) observe(winner, [analysis.winner.home, analysis.winner.draw, analysis.winner.away], h > a ? 0 : h === a ? 1 : 2);
    else if (h !== a) observe(winner, [analysis.winner.home, analysis.winner.away], h > a ? 0 : 1);
    const line = analysis.totalRuns.find(row => row.line === 9.5);
    if (line?.over != null) observe(total95, [line.over, line.under], h + a > 9.5 ? 0 : 1);
  }
  baseball.push({ leagueId, coverage, finishedMatches: finished.length, period: [finished.map(g => g.kickoff).sort()[0], finished.map(g => g.kickoff).sort().at(-1)], winner: finish(winner), total95: finish(total95) });
}
const report = { checkedAt: new Date(now).toISOString(), football, baseball,
  methodology: 'Retrospective walk-forward. Football: all earlier dates in that season; minimum 5 games per team, exact current independent Poisson baseline. Baseball: preceding dates, last 20 results, minimum 5 per team. No fitting or selecting model parameters on these evaluation samples. Multiclass Brier is the sum across outcomes, not the mean.',
  limitations: 'No timestamped historical bookmaker quotes, pitchers, lineups or xG in these datasets. Cannot establish superiority to bookmakers or prospective profits. Reconstructed statistics may differ from historical provider snapshots. Baseball is a short available window. Goal hit rate must be assessed with reliability, not treated as calibrated confidence. Current market baseline is not evaluated retrospectively.' };
await fs.writeFile('artifacts/probability-reliability-2026-10-07.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ football: football.map(({ league, winner, goals15 }) => ({ league, winner, goals15 })), baseball }, null, 2));
