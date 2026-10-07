// Parameter selection on the training seasons only (2021-22 to 2023-24).
// Usage: node scripts/backtest/tune-football.mjs
import * as fm from '../../src/utils/footballModel.js';
import { LEAGUES, loadLeague } from './footballData.mjs';

const TRAIN = new Set(['2122', '2223', '2324']);
const DAY = 86400000;
const leagues = await Promise.all(Object.keys(LEAGUES).map(loadLeague));

// Collect walk-forward expected values for one count family and parameter set.
function walk(games, field, { halfLifeDays, priorGames, newcomer }) {
  const out = [];
  const firstSeen = new Map(), seasonStart = new Map();
  for (const g of games) { for (const t of [g.home, g.away]) if (!firstSeen.has(t)) firstSeen.set(t, g.time); if (!seasonStart.has(g.season)) seasonStart.set(g.season, g.time); }
  const days = [...new Set(games.map(g => Math.floor(g.time / DAY) * DAY))].sort((a, b) => a - b);
  const [hk, ak] = field;
  const rows = games.filter(g => Number.isFinite(g[hk]) && Number.isFinite(g[ak])).map(g => ({ time: g.time, home: g.home, away: g.away, hv: g[hk], av: g[ak], g }));
  let cursor = 0;
  for (const day of days) {
    const batch = games.filter(g => g.time >= day && g.time < day + DAY && TRAIN.has(g.season));
    if (!batch.length) continue;
    while (cursor < rows.length && rows[cursor].time < day) cursor++;
    if (cursor < 60) continue;
    const season = batch[0].season;
    const prior = id => newcomer && season !== '2122' && (firstSeen.get(id) ?? Infinity) >= seasonStart.get(season) ? newcomer : null;
    const fit = fm.fitStrengths(rows.slice(0, cursor), { asOf: day, halfLifeDays, priorGames, prior });
    for (const g of batch) {
      const pair = fm.expectedPair(fit, g.home, g.away);
      if (pair && Number.isFinite(g[hk])) out.push({ g, pair });
    }
  }
  return out;
}

const ll = p => -Math.log(Math.min(1 - 1e-9, Math.max(1e-9, p)));
function goalScore(predictions, rho) {
  let n = 0, x12 = 0, ou = 0;
  for (const { g, pair } of predictions) {
    const m = fm.goalMarkets(fm.scoreMatrix(pair.home, pair.away, rho)).probabilities;
    const r = g.hg > g.ag ? m.homeWin : g.hg === g.ag ? m.draw : m.awayWin;
    x12 += ll(r / 100); ou += ll((g.hg + g.ag > 2.5 ? m.over25 : m.under25) / 100); n++;
  }
  return { n, x12: x12 / n, ou: ou / n };
}
function countScore(predictions, field, lines) {
  const [hk, ak] = field;
  const size = fm.estimateDispersion(predictions.map(({ g, pair }) => ({ mean: pair.home + pair.away, value: g[hk] + g[ak] })));
  let n = 0, loss = 0, se = 0;
  for (const { g, pair } of predictions) {
    const dist = fm.countDistribution(pair.home + pair.away, size);
    const probs = fm.countLines(dist, lines);
    const total = g[hk] + g[ak];
    for (const line of lines) { const k = String(line).replace('.', ''); loss += ll((total > line ? probs[`over${k}`] : probs[`under${k}`]) / 100); }
    se += (total - pair.home - pair.away) ** 2; n++;
  }
  return { n, logLoss: loss / n / lines.length, rmse: Math.sqrt(se / n), size };
}

const started = Date.now();
const list = (name, fallback) => (process.env[name] || fallback).split(',').map(Number);
const goalResults = [];
if (!process.env.SKIP_GOALS) for (const halfLifeDays of list('HL', '120,180,240,365,540,730')) for (const priorGames of list('PG', '4,6,10,16,24')) {
  const newcomer = { attack: 0.85, defense: 1.18 };
  const predictions = leagues.flatMap(games => walk(games, ['hg', 'ag'], { halfLifeDays, priorGames, newcomer }));
  for (const rho of [-0.04, -0.07, -0.1]) goalResults.push({ halfLifeDays, priorGames, rho, ...goalScore(predictions, rho) });
}
for (const [label, key] of [['BEST 1X2', 'x12'], ['BEST O/U 2.5', 'ou']]) {
  goalResults.sort((a, b) => a[key] - b[key]);
  console.log(label);
  for (const r of goalResults.slice(0, 6)) console.log(JSON.stringify(r));
}

for (const [name, field, lines] of [['CORNERS', ['hc', 'ac'], [7.5, 8.5, 9.5, 10.5, 11.5]], ['CARDS', ['hy', 'ay'], [2.5, 3.5, 4.5, 5.5]]]) {
  const results = [];
  for (const halfLifeDays of name === 'CORNERS' ? [365, 540] : [120, 180, 270]) for (const priorGames of name === 'CORNERS' ? [32, 48, 64, 96] : [12, 16, 24]) {
    const predictions = leagues.flatMap(games => walk(games, field, { halfLifeDays, priorGames }));
    results.push({ halfLifeDays, priorGames, ...countScore(predictions, field, lines) });
  }
  results.sort((a, b) => a.logLoss - b.logLoss);
  console.log(`${name} top 6:`);
  for (const r of results.slice(0, 6)) console.log(JSON.stringify(r));
}
console.log('runtime', (Date.now() - started) / 1000, 's');
