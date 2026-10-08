// Starting pitchers in the baseball run ratings. Each starter's quality is the
// shrunk average of first-five-innings runs his team allowed in his EARLIER
// starts (MLB Stats API probable pitchers). Tuned on 2025, measured on 2026.
import * as fm from '../../src/utils/footballModel.js';
import { cachedJson } from '../blind-test/common.mjs';
const convolve = (a, b) => { const out = new Array(a.length + b.length - 1).fill(0); a.forEach((p, i) => b.forEach((q, j) => { out[i + j] += p * q; })); return out; };

const DAY = 86400000;
const ll = p => -Math.log(Math.min(1 - 1e-9, Math.max(1e-9, p)));
async function season(year) {
  const data = await cachedJson(`mlb-${year}-schedule-pitchers`, async () => (await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${year}-03-15&endDate=${year}-09-30&gameType=R&hydrate=probablePitcher,linescore`)).json());
  return data.dates.flatMap(day => day.games).filter(g => g.status?.abstractGameState === 'Final' && Number.isInteger(g.teams.home.score)).map(g => {
    const innings = g.linescore?.innings || [], f5 = side => innings.filter(i => i.num <= 5).reduce((s, i) => s + (i[side]?.runs ?? 0), 0);
    return { id: g.gamePk, time: Date.parse(g.gameDate), home: String(g.teams.home.team.id), away: String(g.teams.away.team.id),
      hv: g.teams.home.score, av: g.teams.away.score, h5: innings.length >= 5 ? f5('home') : null, a5: innings.length >= 5 ? f5('away') : null,
      hp: g.teams.home.probablePitcher?.id ?? null, ap: g.teams.away.probablePitcher?.id ?? null };
  });
}
const rows = [...await season(2025), ...await season(2026)].sort((a, b) => a.time - b.time);

// Pitcher factor: shrunk F5 runs allowed per start relative to the league.
function pitcherFactors(history, k) {
  const sum = new Map(), count = new Map();
  let total = 0, n = 0;
  for (const r of history) {
    if (r.h5 === null) continue;
    for (const [pitcher, allowed] of [[r.hp, r.a5], [r.ap, r.h5]]) {
      total += allowed; n++;
      if (!pitcher) continue;
      sum.set(pitcher, (sum.get(pitcher) || 0) + allowed); count.set(pitcher, (count.get(pitcher) || 0) + 1);
    }
  }
  const league = n ? total / n : 2.5;
  return { league, factor: id => id && count.has(id) ? ((sum.get(id) + k * league) / (count.get(id) + k)) / league : 1 };
}
function evaluate({ beta, k }, from, to, size) {
  let n = 0, win = 0, winHits = 0, tot = 0, totHits = 0;
  const days = [...new Set(rows.filter(r => r.time >= from && r.time < to).map(r => Math.floor(r.time / DAY) * DAY))];
  for (const day of days) {
    const history = rows.filter(r => r.time < day);
    const fit = fm.fitStrengths(history, { asOf: day, halfLifeDays: 60, priorGames: 40 });
    const pitchers = pitcherFactors(history.filter(r => r.time >= day - 400 * DAY), k);
    for (const r of rows.filter(x => x.time >= day && x.time < day + DAY && x.hv !== x.av)) {
      const pair = fm.expectedPair(fit, r.home, r.away, { minGames: 5 });
      if (!pair) continue;
      const lh = pair.home * pitchers.factor(r.ap) ** beta, la = pair.away * pitchers.factor(r.hp) ** beta;
      const ph = fm.countDistribution(lh, size, 40), pa = fm.countDistribution(la, size, 40);
      let home = 0, away = 0; ph.forEach((p, h) => pa.forEach((q, a) => { if (h > a) home += p * q; else if (a > h) away += p * q; }));
      const p = home / (home + away), won = r.hv > r.av;
      win += ll(won ? p : 1 - p); winHits += Number((p >= 0.5) === won);
      const over = fm.countLines(convolve(ph, pa), [8.5]).over85 / 100, wentOver = r.hv + r.av > 8.5;
      tot += ll(wentOver ? over : 1 - over); totHits += Number((over >= 0.5) === wentOver); n++;
    }
  }
  return { n, winnerAcc: winHits / n * 100, winnerLoss: win / n, totalAcc: totHits / n * 100, totalLoss: tot / n };
}
const TRAIN = [Date.parse('2025-05-01'), Date.parse('2025-10-01')], TEST = [Date.parse('2026-05-01'), Date.parse('2026-09-30')];
const results = [];
for (const beta of [0, 0.25, 0.4, 0.5, 0.7]) for (const k of [20, 40, 80]) {
  if (beta === 0 && k !== 20) continue;
  const r = evaluate({ beta, k }, ...TRAIN, 3.3);
  results.push({ beta, k, ...r });
  console.log('train', JSON.stringify({ beta, k, acc: r.winnerAcc.toFixed(1), ll: r.winnerLoss.toFixed(4), totAcc: r.totalAcc.toFixed(1), totLl: r.totalLoss.toFixed(4) }));
}
results.sort((a, b) => (a.winnerLoss + a.totalLoss) - (b.winnerLoss + b.totalLoss));
const best = results[0];
const test = evaluate(best, ...TEST, 3.3), plain = evaluate({ beta: 0, k: 20 }, ...TEST, 3.3);
console.log('TEST 2026 sin abridores', JSON.stringify(plain));
console.log('TEST 2026 con abridores', JSON.stringify({ beta: best.beta, k: best.k, ...test }));
