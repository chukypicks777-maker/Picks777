// Offline CPU comparison against copies of the modules from the preceding
// commit. Uses existing local historical files; no service or AI calls.
// node scripts/measure-cpu-optimization.mjs <baseline-directory> <data-directory>
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import * as after from '../src/utils/footballModel.js';
import { ratedMargin } from '../server/services/basketballRatings.js';
import { parseCsv } from './backtest/footballData.mjs';

const [baselineDirectory, dataDirectory] = process.argv.slice(2);
if (!baselineDirectory || !dataDirectory) throw new Error('Pass the baseline module directory and existing data directory.');
const before = await import(pathToFileURL(path.resolve(baselineDirectory, 'footballModel-before.mjs')));
const basketballBefore = await import(pathToFileURL(path.resolve(baselineDirectory, 'basketballRatings-before.mjs')));
const football = parseCsv(await fs.readFile(path.join(dataDirectory, 'E0-2526.csv'), 'utf8'));
const basketball = JSON.parse(await fs.readFile(path.join(dataDirectory, 'espn-nba-202510-202604.json'), 'utf8'));
const asOf = Date.parse('2026-10-11T12:00:00Z'), DAY = 86400000;
const rows = football.flatMap((row, i) => {
  const hv = Number(row.FTHG), av = Number(row.FTAG);
  return row.FTHG !== '' && row.FTAG !== '' ? [{ time: asOf - (football.length - i) * DAY, home: row.HomeTeam, away: row.AwayTeam, hv, av }] : [];
});
const prices = football.map(row => ({ homeWin: Number(row.B365H), draw: Number(row.B365D), awayWin: Number(row.B365A) }))
  .filter(odds => Object.values(odds).every(value => value > 1)).slice(0, 80);
const normalizeFit = fit => fit ? { baseHome: fit.baseHome, baseAway: fit.baseAway, teams: [...fit.teams], games: fit.games, weight: fit.weight } : null;
let comparisons = 0;
for (const priorGames of [0.01, 1, 6, 40]) for (const halfLifeDays of [0, 60, 240, 540]) {
  const options = { asOf, priorGames, halfLifeDays, prior: id => id === rows[0].home ? { attack: 0.85, defense: 1.18 } : null };
  assert.deepEqual(normalizeFit(after.fitStrengths(rows, options)), normalizeFit(before.fitStrengths(rows, options)));
  comparisons++;
}
for (const odds of prices) {
  assert.deepEqual(after.forecastFootball(null, 'home', 'away', odds), before.forecastFootball(null, 'home', 'away', odds));
  comparisons++;
}
const history = { leagueId: 'nba', builtAt: asOf, rows: basketball.map(g => [`espn-nba-${g.id}`, Date.parse(g.kickoff) / 1000, g.home, g.away, g.hs, g.as]) };
const match = { leagueId: 'nba', kickoff: new Date(asOf + DAY).toISOString(), homeTeam: { id: basketball.at(-1).home }, awayTeam: { id: basketball.at(-1).away } };
assert.deepEqual(ratedMargin(match, [], history, asOf), basketballBefore.ratedMargin(match, [], history, asOf)); comparisons++;

function measure(work, count) {
  work();
  const results = [];
  for (let trial = 0; trial < 5; trial++) {
    const start = process.cpuUsage();
    for (let i = 0; i < count; i++) work();
    const cpu = process.cpuUsage(start);
    results.push((cpu.user + cpu.system) / 1000);
  }
  return results.sort((a, b) => a - b)[2];
}
const workloads = [
  ['football-repeat-calendar', () => prices.forEach(odds => before.forecastFootball(null, 'home', 'away', odds)), () => prices.forEach(odds => after.forecastFootball(null, 'home', 'away', odds)), 10],
  ['strength-fit', () => before.fitStrengths(rows, { asOf, halfLifeDays: 240, priorGames: 1 }), () => after.fitStrengths(rows, { asOf, halfLifeDays: 240, priorGames: 1 }), 1000],
  ['basketball-cloned-history', () => basketballBefore.ratedMargin(match, [], structuredClone(history), asOf), () => ratedMargin(match, [], structuredClone(history), asOf), 50]
];
const report = { baselineCommit: '6279af9b5f9ce392bb6005773c342bdd436d9bb5', checkedAt: new Date().toISOString(), cpuMeasurement: 'process.cpuUsage user + system, median of five runs',
  data: { footballMatches: rows.length, distinctPriceSnapshots: prices.length, basketballMatches: history.rows.length }, identicalComparisons: comparisons,
  workloads: workloads.map(([name, old, current, count]) => {
    const beforeMs = measure(old, count), afterMs = measure(current, count);
    return { name, iterationsPerRun: count, beforeCpuMs: beforeMs, afterCpuMs: afterMs, reductionPercent: +(100 * (1 - afterMs / beforeMs)).toFixed(1) };
  }),
  limitation: 'Local repeated-work workloads, not a measurement of total Vercel usage or a promised bill reduction.' };
await fs.mkdir('artifacts/cpu-optimization', { recursive: true });
await fs.writeFile('artifacts/cpu-optimization/measurement-2026-10-11.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
