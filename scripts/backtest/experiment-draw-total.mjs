// How reliable is the goal total implied by the draw price alone (used when no
// goals price and no team history exist, e.g. Champions League newcomers)?
// football-data.co.uk closing prices, five leagues, 2021-22 to 2026-27.
// Parameters are chosen on 2021-22 to 2023-24 and scored on later seasons.
import { loadLeague, LEAGUES } from './footballData.mjs';
import { drawImpliedTotal, solveGoalRates, scoreMatrix, goalMarkets, devigPower, FOOTBALL_MODEL } from '../../src/utils/footballModel.js';

const TEST = new Set(['2425', '2526', '2627']);
const ll = (p, y) => -Math.log(Math.min(1 - 1e-9, Math.max(1e-9, y ? p : 1 - p)));
const rows = [];
for (const code of Object.keys(LEAGUES)) for (const g of await loadLeague(code)) {
  const odds = g.close?.homeWin ? g.close : g.avg;
  const x12 = devigPower(odds, ['homeWin', 'draw', 'awayWin']), ou = devigPower(odds, ['over25', 'under25']);
  if (!x12 || !ou) continue;
  const fav = Math.max(x12.probabilities.homeWin, x12.probabilities.awayWin);
  rows.push({ season: g.season, league: code, p: x12.probabilities, marketOver: ou.probabilities.over25, over: g.hg + g.ag > 2.5, over15: g.hg + g.ag > 1.5,
    btts: g.hg > 0 && g.ag > 0, goals: g.hg + g.ag, fav });
}
const { rho } = FOOTBALL_MODEL.goals;
// Goal markets for a total, keeping the 1X2 split of the market.
function markets(r, total) {
  const rates = solveGoalRates({ ...r.p }, { total });
  return goalMarkets(scoreMatrix(rates.home, rates.away, rho)).probabilities;
}
// Over 2.5 depends only on the expected total (Dixon-Coles only moves scores
// below three goals), so the fits use this closed form.
const over25Of = T => (1 - Math.exp(-T) * (1 + T + T * T / 2)) * 100;
const train = rows.filter(r => !TEST.has(r.season)), test = rows.filter(r => TEST.has(r.season));
const leagueMean = train.reduce((s, r) => s + r.goals, 0) / train.length;
for (const r of rows) r.drawTotal = drawImpliedTotal(r.p, rho);

const methods = {
  'draw price (production)': r => r.drawTotal,
  'league mean only': () => leagueMean
};
// Shrink the draw-implied total toward the league mean: total = draw^w * mean^(1-w).
// Also try the favourite's strength: a lopsided 1X2 raises the total moderately.
let best = null;
for (let w = 0; w <= 1.0001; w += 0.05) {
  const loss = train.reduce((s, r) => s + ll(over25Of(r.drawTotal ** w * leagueMean ** (1 - w)) / 100, r.over), 0);
  if (!best || loss < best.loss) best = { w, loss };
}
methods[`shrunk draw w=${best.w.toFixed(2)}`] = r => r.drawTotal ** best.w * leagueMean ** (1 - best.w);
// Regression on the 1X2 imbalance |logit(home) - logit(away)| (fitted on training).
const imbalance = r => Math.abs(Math.log(r.p.homeWin / r.p.awayWin));
let fit = null;
for (let a = 2.2; a <= 3.2; a += 0.02) for (let b = 0; b <= 0.6; b += 0.02) {
  const loss = train.reduce((s, r) => s + ll(over25Of(a + b * imbalance(r)) / 100, r.over), 0);
  if (!fit || loss < fit.loss) fit = { a, b, loss };
}
methods[`imbalance a=${fit.a.toFixed(2)} b=${fit.b.toFixed(2)}`] = r => fit.a + fit.b * imbalance(r);

let out_power = null;
// Power law on the draw-implied total, T = A * draw^B, clamped to the totals the
// market actually prices; fitted on training outcomes (Over 2.5 log loss).
let power = null;
for (let A = 1.0; A <= 1.8; A += 0.01) for (let B = 0.5; B <= 1.0001; B += 0.01) {
  const loss = train.reduce((s, r) => s + ll(over25Of(Math.min(4.6, Math.max(1.8, A * r.drawTotal ** B))) / 100, r.over), 0);
  if (!power || loss < power.loss) power = { A, B, loss };
}
methods[`power A=${power.A.toFixed(2)} B=${power.B.toFixed(2)} clamp 1.8-4.6`] = r => Math.min(4.6, Math.max(1.8, power.A * r.drawTotal ** power.B));
out_power = power;
// Concave in logs: log T = a + b log(draw) + c log(draw)^2, flattening extremes.
let concave = null;
for (let a = -0.3; a <= 0.6; a += 0.03) for (let b = 0.4; b <= 1.4; b += 0.04) for (let c = -0.6; c <= 0.0001; c += 0.03) {
  let loss = 0;
  for (const r of train) { const L = Math.log(r.drawTotal); loss += ll(over25Of(Math.min(4.6, Math.max(1.8, Math.exp(a + b * L + c * L * L)))) / 100, r.over); }
  if (!concave || loss < concave.loss) concave = { a, b, c, loss };
}
methods[`concave a=${concave.a.toFixed(2)} b=${concave.b.toFixed(2)} c=${concave.c.toFixed(2)}`] = r => { const L = Math.log(r.drawTotal); return Math.min(4.6, Math.max(1.8, Math.exp(concave.a + concave.b * L + concave.c * L * L))); };
const bands = [[0, 0.5], [0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1.01]];
const out = { power: out_power, train: train.length, test: test.length, leagueMean: +leagueMean.toFixed(3), methods: {} };
for (const [name, totalOf] of Object.entries(methods)) {
  const res = { byFavourite: {} };
  let loss = 0, gap = 0, hits = 0, l15 = 0, lb = 0;
  for (const r of test) {
    const m = markets(r, totalOf(r));
    loss += ll(m.over25 / 100, r.over); gap += Math.abs(m.over25 - r.marketOver); hits += Number((m.over25 >= 50) === r.over);
    l15 += ll(m.over15 / 100, r.over15); lb += ll(m.bttsYes / 100, r.btts);
  }
  Object.assign(res, { over25LogLoss: +(loss / test.length).toFixed(4), over25Hit: +(hits / test.length * 100).toFixed(1), meanGapToMarketPts: +(gap / test.length).toFixed(2),
    over15LogLoss: +(l15 / test.length).toFixed(4), bttsLogLoss: +(lb / test.length).toFixed(4) });
  for (const [lo, hi] of bands) {
    const part = test.filter(r => r.fav >= lo * 100 && r.fav < hi * 100);
    if (!part.length) continue;
    const said = part.reduce((s, r) => s + over25Of(totalOf(r)), 0) / part.length;
    res.byFavourite[`fav ${lo * 100}-${Math.min(100, hi * 100)}%`] = { n: part.length, modelOver25: +said.toFixed(1),
      marketOver25: +(part.reduce((s, r) => s + r.marketOver, 0) / part.length).toFixed(1), happened: +(part.filter(r => r.over).length / part.length * 100).toFixed(1),
      meanTotal: +(part.reduce((s, r) => s + totalOf(r), 0) / part.length).toFixed(2), realGoals: +(part.reduce((s, r) => s + r.goals, 0) / part.length).toFixed(2) };
  }
  out.methods[name] = res;
}
// The market's own Over 2.5 as the reference ceiling.
out.marketReference = { over25LogLoss: +(test.reduce((s, r) => s + ll(r.marketOver / 100, r.over), 0) / test.length).toFixed(4) };
console.log(JSON.stringify(out, null, 1));
