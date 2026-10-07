// Compares goal-rate constructions: one responsive fit, separate supremacy and
// total fits, and blends with shots-on-target strengths. Walk-forward only.
import * as fm from '../../src/utils/footballModel.js';
import { LEAGUES, loadLeague } from './footballData.mjs';

const TRAIN = new Set(['2122', '2223', '2324']);
const DAY = 86400000;
const ll = p => -Math.log(Math.min(1 - 1e-9, Math.max(1e-9, p)));
const sotParams = (process.env.SOT || '240:8').split(':').map(Number);
const records = [];
for (const code of Object.keys(LEAGUES)) {
  const games = await loadLeague(code);
  const firstSeen = new Map(), seasonStart = new Map();
  for (const g of games) { for (const t of [g.home, g.away]) if (!firstSeen.has(t)) firstSeen.set(t, g.time); if (!seasonStart.has(g.season)) seasonStart.set(g.season, g.time); }
  const days = [...new Set(games.map(g => Math.floor(g.time / DAY) * DAY))].sort((a, b) => a - b);
  let cursor = 0;
  for (const day of days) {
    while (cursor < games.length && games[cursor].time < day) cursor++;
    const batch = games.filter(g => g.time >= day && g.time < day + DAY);
    if (cursor < 60 || !batch.length) continue;
    const season = batch[0].season, history = games.slice(0, cursor);
    const prior = id => season !== '2122' && (firstSeen.get(id) ?? Infinity) >= seasonStart.get(season) ? { attack: 0.85, defense: 1.18 } : null;
    const goals = history.map(g => ({ time: g.time, home: g.home, away: g.away, hv: g.hg, av: g.ag }));
    const sup = fm.fitStrengths(goals, { asOf: day, halfLifeDays: 240, priorGames: 6, prior });
    const tot = fm.fitStrengths(goals, { asOf: day, halfLifeDays: 540, priorGames: 24, prior });
    const sot = fm.fitStrengths(history.filter(g => Number.isFinite(g.hst)).map(g => ({ time: g.time, home: g.home, away: g.away, hv: g.hst, av: g.ast })),
      { asOf: day, halfLifeDays: sotParams[0], priorGames: sotParams[1], prior });
    for (const g of batch) {
      const a = fm.expectedPair(sup, g.home, g.away), b = fm.expectedPair(tot, g.home, g.away), s = fm.expectedPair(sot, g.home, g.away);
      if (!a || !b || !s) continue;
      // Shots on target converted with the same window's league conversion rate.
      const sGoals = { home: s.home * tot.baseHome / sot.baseHome, away: s.away * tot.baseAway / sot.baseAway };
      records.push({ g, train: TRAIN.has(g.season), a, b, s: sGoals });
    }
  }
}
const mix = (x, y, w) => ({ home: x.home ** (1 - w) * y.home ** w, away: x.away ** (1 - w) * y.away ** w });
const combine = (shareFrom, totalFrom) => {
  const T = totalFrom.home + totalFrom.away, share = shareFrom.home / (shareFrom.home + shareFrom.away);
  return { home: T * share, away: T * (1 - share) };
};
const variants = {
  single: r => r.a,
  splitTotal: r => combine(r.a, r.b),
  sotOnly: r => r.s,
  ...Object.fromEntries([0.25, 0.4, 0.5, 0.6].map(w => [`sot${w}`, r => combine(mix(r.a, r.s, w), mix(r.b, r.s, w))])),
  ...Object.fromEntries([0.25, 0.5].map(w => [`supSot${w}`, r => combine(mix(r.a, r.s, w), r.b)]))
};
for (const split of [true, false]) {
  console.log(split ? '\nTRAIN' : '\nTEST');
  for (const [name, f] of Object.entries(variants)) {
    let n = 0, x12 = 0, ou = 0, ou15 = 0, btts = 0;
    for (const r of records.filter(r => r.train === split)) {
      const p = f(r), m = fm.goalMarkets(fm.scoreMatrix(p.home, p.away, -0.07)).probabilities, { hg, ag } = r.g;
      x12 += ll((hg > ag ? m.homeWin : hg === ag ? m.draw : m.awayWin) / 100);
      ou += ll((hg + ag > 2.5 ? m.over25 : m.under25) / 100);
      ou15 += ll((hg + ag > 1.5 ? m.over15 : m.under15) / 100);
      btts += ll((hg > 0 && ag > 0 ? m.bttsYes : m.bttsNo) / 100);
      n++;
    }
    console.log(name.padEnd(12), 'n', n, '1x2', (x12 / n).toFixed(5), 'o2.5', (ou / n).toFixed(5), 'o1.5', (ou15 / n).toFixed(5), 'btts', (btts / n).toFixed(5));
  }
}
