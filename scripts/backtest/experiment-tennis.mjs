// Tennis winner calibration, walk-forward on ESPN singles results (ATP and WTA).
// Compares the production Elo with a dynamic-K Elo and a calibrated (shrunk) one.
import fs from 'node:fs/promises';
import { parseTennisEvents } from '../../server/services/sportsDataService.js';
import { tennisAnalysis } from '../../server/services/sportProbabilityModel.js';

const CACHE = 'artifacts/backtest-cache';
const DAY = 86400000;
async function year(tour, y) {
  const file = `${CACHE}/espn-tennis-${tour}-${y}.json`;
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch {}
  const end = y === 2026 ? new Date().toISOString().slice(0, 10).replaceAll('-', '') : `${y}1231`;
  const data = await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/tennis/${tour}/scoreboard?dates=${y}0101-${end}&limit=1000`)).json();
  await fs.writeFile(file, JSON.stringify(data));
  return data;
}
const ll = p => -Math.log(Math.min(1 - 1e-9, Math.max(1e-9, p)));
const logit = p => Math.log(p / (1 - p)), sigmoid = x => 1 / (1 + Math.exp(-x));

export async function tennisGames(tour) {
  const games = [];
  for (const y of [2024, 2025, 2026]) games.push(...parseTennisEvents(await year(tour, y), tour, new Date().toISOString()));
  return [...new Map(games.map(g => [g.id, g])).values()].filter(g => g.status === 'FINISHED' && !g.retired && Number.isInteger(g.finalScore?.home) && g.finalScore.home !== g.finalScore.away)
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
}

// Elo with K = scale / (matches + offset)^shape (FiveThirtyEight tennis form).
export function eloSeries(games, { scale = 250, offset = 5, shape = 0.4, fixedK = null } = {}) {
  const rating = new Map(), played = new Map(), out = new Map();
  for (const g of games) {
    const h = g.homeTeam.id, a = g.awayTeam.id, rh = rating.get(h) ?? 1500, ra = rating.get(a) ?? 1500;
    const p = 1 / (1 + 10 ** ((ra - rh) / 400));
    out.set(g.id, { p, nh: played.get(h) || 0, na: played.get(a) || 0 });
    const won = g.finalScore.home > g.finalScore.away ? 1 : 0;
    const k = side => fixedK ?? scale / ((played.get(side) || 0) + offset) ** shape;
    rating.set(h, rh + k(h) * (won - p)); rating.set(a, ra - k(a) * (won - p));
    played.set(h, (played.get(h) || 0) + 1); played.set(a, (played.get(a) || 0) + 1);
  }
  return out;
}

if (process.argv[1]?.endsWith('experiment-tennis.mjs')) {
  const TRAIN_END = Date.parse('2025-10-01'), TEST_START = TRAIN_END;
  for (const tour of ['atp', 'wta']) {
    const games = await tennisGames(tour);
    const dyn = eloSeries(games), fixed = eloSeries(games, { fixedK: 24 });
    const rows = [];
    // Production: the analysis the app computes with the previous 365 days.
    let i = 0;
    for (const g of games) {
      const t = Date.parse(g.kickoff);
      if (t < Date.parse('2025-03-01')) continue;
      while (i < games.length && Date.parse(games[i].kickoff) < t - DAY / 4) i++;
      const prior = games.slice(0, i).filter(x => Date.parse(x.kickoff) >= t - 365 * DAY);
      const a = tennisAnalysis({ ...g, status: 'SCHEDULED', odds: {} }, prior, t);
      const won = g.finalScore.home > g.finalScore.away;
      rows.push({ t, won, app: a.winner.home != null ? a.winner.home / 100 : null, dyn: dyn.get(g.id), fixed: fixed.get(g.id) });
    }
    const evaluate = (name, pick, filter = () => true) => {
      const sample = rows.filter(r => r.t >= TEST_START && filter(r)).map(r => ({ p: pick(r), won: r.won })).filter(r => Number.isFinite(r.p));
      const n = sample.length, loss = sample.reduce((s, r) => s + ll(r.won ? r.p : 1 - r.p), 0) / n;
      const brier = sample.reduce((s, r) => s + (r.p - Number(r.won)) ** 2, 0) / n, acc = sample.filter(r => (r.p >= 0.5) === r.won).length / n;
      const strong = sample.filter(r => Math.max(r.p, 1 - r.p) >= 0.65), strongHit = strong.filter(r => (r.p >= 0.5) === r.won).length / strong.length;
      const strongMean = strong.reduce((s, r) => s + Math.max(r.p, 1 - r.p), 0) / strong.length;
      console.log(tour, name.padEnd(26), 'n', n, 'acc', (acc * 100).toFixed(1), 'brier', brier.toFixed(4), 'logloss', loss.toFixed(4), '| fav>=65%:', strong.length, 'said', (strongMean * 100).toFixed(1), 'hit', (strongHit * 100).toFixed(1));
    };
    const appCovered = r => r.app != null;
    evaluate('production (app)', r => r.app, appCovered);
    evaluate('fixed K=24 2y', r => r.fixed.p, appCovered);
    evaluate('dynamic K 2y', r => r.dyn.p, appCovered);
    // Shrinkage chosen on matches before TEST_START only.
    for (const [name, base] of [['app', r => r.app], ['dyn', r => r.dyn.p]]) {
      const train = rows.filter(r => r.t < TRAIN_END && appCovered(r));
      let best = null;
      for (let c = 0.3; c <= 1.2; c += 0.05) {
        const loss = train.reduce((s, r) => { const p = sigmoid(c * logit(Math.min(0.99, Math.max(0.01, base(r))))); return s + ll(r.won ? p : 1 - p); }, 0);
        if (!best || loss < best.loss) best = { c, loss };
      }
      evaluate(`${name} shrunk c=${best.c.toFixed(2)}`, r => sigmoid(best.c * logit(Math.min(0.99, Math.max(0.01, base(r))))), appCovered);
    }
  }
}
