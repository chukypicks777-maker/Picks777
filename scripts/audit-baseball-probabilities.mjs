// Read-only, chronological replay. Each forecast uses only earlier results;
// today's published quotes are never used to predict a historical winner.
import fs from 'node:fs/promises';
import { getSportsHistory, getSportsFeed, getSportsMatch, getSportsBankerCandidates } from '../server/services/sportsDataService.js';
import { baseballAnalysis, runLadder } from '../server/services/sportProbabilityModel.js';

const now = Date.now();
const { games } = await getSportsHistory('beisbol', now, { leagueId: 'mlb' });
const bins = Array.from({ length: 10 }, (_, index) => ({ range: `${index * 10}–${(index + 1) * 10}`, count: 0, predicted: 0, observed: 0 }));
const metrics = new Map();
const score = (key, current, previous, outcome) => {
  if (![current, previous].every(Number.isFinite)) return;
  const metric = metrics.get(key) || { forecasts: 0, currentBrier: 0, previousBrier: 0, currentLogLoss: 0, previousLogLoss: 0 };
  const p = current / 100, q = previous / 100;
  metric.forecasts++;
  metric.currentBrier += (p - outcome) ** 2; metric.previousBrier += (q - outcome) ** 2;
  const logLoss = value => -Math.log(Math.max(1e-12, outcome ? value : 1 - value));
  metric.currentLogLoss += logLoss(p); metric.previousLogLoss += logLoss(q);
  metrics.set(key, metric);
  if (key === 'firstFive:2.5') {
    const bin = bins[Math.min(9, Math.floor(current / 10))];
    bin.count++; bin.predicted += current; bin.observed += outcome * 100;
  }
};

let evaluatedGames = 0;
const finished = games.filter(game => game.status === 'FINISHED' && Date.parse(game.kickoff) < now).sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
for (const game of finished) {
  const analysis = baseballAnalysis({ ...game, odds: {} }, games, now);
  if (analysis.expectedRuns.home === null || analysis.expectedRuns.away === null) continue;
  evaluatedGames++;
  const previousTotal = runLadder(analysis.expectedRuns.home + analysis.expectedRuns.away, analysis.totalRuns.map(row => row.line));
  for (const row of analysis.totalRuns) score(`fullTotal:${row.line}`, row.over, previousTotal.find(previous => previous.line === row.line).over, Number(game.finalScore.home + game.finalScore.away > row.line));
  const five = analysis.countDiagnostics.five;
  const innings = game.inningScores?.filter(inning => inning.num >= 1 && inning.num <= 5);
  if (!five.home || !five.away || innings?.length !== 5 || innings.some(inning => !Number.isInteger(inning.home) || !Number.isInteger(inning.away))) continue;
  const total = innings.reduce((sum, inning) => sum + inning.home + inning.away, 0);
  const previousFive = runLadder(five.home.mean + five.away.mean);
  for (const row of analysis.firstFive) score(`firstFive:${row.line}`, row.over, previousFive.find(previous => previous.line === row.line).over, Number(total > row.line));
}

const feed = await getSportsFeed('beisbol', { leagueId: 'mlb' });
const pool = await getSportsBankerCandidates('beisbol', { leagueId: 'mlb' });
const upcoming = feed.matches.filter(match => match.status === 'SCHEDULED');
const samples = [];
for (const match of upcoming.slice(0, 4)) {
  const detail = await getSportsMatch('beisbol', match.id, { leagueId: 'mlb' });
  const banker = pool.matches.find(candidate => candidate.id === match.id);
  samples.push({ id: match.id, home: match.homeTeam.name, away: match.awayTeam.name, kickoff: match.kickoff, odds: match.odds,
    source: match.analysis.probabilitySource, winner: match.analysis.winner, firstFive: match.analysis.firstFive,
    sample: match.analysis.sampleSize, modelVersion: match.analysis.modelVersion,
    consistent: JSON.stringify(match.analysis) === JSON.stringify(detail?.analysis) && JSON.stringify(match.analysis) === JSON.stringify(banker?.analysis) });
}
const report = { checkedAt: new Date(now).toISOString(), source: 'MLB Stats API / ESPN', historicalGames: finished.length, evaluatedGames,
  methodology: 'Walk-forward on the available 45-day MLB window. A match and all later starts are excluded from its input. Same expected means, comparing prior Poisson totals with negative binomial predictive totals. Lower Brier/log loss is better.',
  limits: 'Retrospective check on one short window; not a prospective accuracy guarantee. No archived bookmaker quotes or pitcher/lineup data. Models assume independent team scoring.',
  metrics: Object.fromEntries([...metrics].map(([key, value]) => [key, { forecasts: value.forecasts, ...Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'forecasts').map(([key, total]) => [key, Number((total / value.forecasts).toFixed(6))])) }])),
  firstFive25Reliability: bins.filter(bin => bin.count).map(bin => ({ range: bin.range, forecasts: bin.count, meanPredicted: Number((bin.predicted / bin.count).toFixed(1)), observed: Number((bin.observed / bin.count).toFixed(1)) })),
  upcoming: samples, allPathsConsistent: samples.every(sample => sample.consistent) };
await fs.writeFile('artifacts/probability-validation-2026-10-06.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.allPathsConsistent) process.exitCode = 1;
