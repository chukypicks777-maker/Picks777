// Market integration choices, evaluated walk-forward with pre-match average prices.
import * as fm from '../../src/utils/footballModel.js';
import { LEAGUES, loadLeague } from './footballData.mjs';

const TRAIN = new Set(['2122', '2223', '2324']);
const DAY = 86400000;
const ll = p => -Math.log(Math.min(1 - 1e-9, Math.max(1e-9, p)));
const mix = (x, y, w) => ({ home: x.home ** (1 - w) * y.home ** w, away: x.away ** (1 - w) * y.away ** w });
const combine = (shareFrom, totalFrom) => { const T = totalFrom.home + totalFrom.away, s = shareFrom.home / (shareFrom.home + shareFrom.away); return { home: T * s, away: T * (1 - s) }; };

function devig(odds, keys, method) {
  const inv = keys.map(k => 1 / odds[k]);
  if (inv.some(v => !(v > 0 && v < 1))) return null;
  if (method === 'power') {
    let low = 0.5, high = 3;
    for (let i = 0; i < 60; i++) { const k = (low + high) / 2; if (inv.reduce((s, q) => s + q ** k, 0) > 1) low = k; else high = k; }
    return inv.map(q => q ** ((low + high) / 2));
  }
  if (method === 'shin') {
    const sum = inv.reduce((a, b) => a + b, 0);
    let low = 0, high = 0.4;
    const probs = z => inv.map(q => (Math.sqrt(z * z + 4 * (1 - z) * q * q / sum) - z) / (2 * (1 - z)));
    for (let i = 0; i < 60; i++) { const z = (low + high) / 2; if (probs(z).reduce((a, b) => a + b, 0) > 1) low = z; else high = z; }
    const p = probs((low + high) / 2), s = p.reduce((a, b) => a + b, 0);
    return p.map(v => v / s);
  }
  const s = inv.reduce((a, b) => a + b, 0);
  return inv.map(v => v / s);
}

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
    const sot = fm.fitStrengths(history.filter(g => Number.isFinite(g.hst)).map(g => ({ time: g.time, home: g.home, away: g.away, hv: g.hst, av: g.ast })), { asOf: day, halfLifeDays: 240, priorGames: 8, prior });
    for (const g of batch) {
      const a = fm.expectedPair(sup, g.home, g.away), b = fm.expectedPair(tot, g.home, g.away), s = fm.expectedPair(sot, g.home, g.away);
      if (!a || !b || !s || !(g.avg.homeWin > 1 && g.avg.draw > 1 && g.avg.awayWin > 1 && g.avg.over25 > 1 && g.avg.under25 > 1)) continue;
      const sg = { home: s.home * tot.baseHome / sot.baseHome, away: s.away * tot.baseAway / sot.baseAway };
      const rates = combine(mix(a, sg, 0.25), mix(b, sg, 0.4));
      records.push({ g, train: TRAIN.has(g.season), rates, league: { home: tot.baseHome, away: tot.baseAway } });
    }
  }
}

for (const split of [true, false]) {
  const rows = records.filter(r => r.train === split);
  console.log(split ? '\n=== TRAIN' : '\n=== TEST', rows.length);
  const outcome = g => g.hg > g.ag ? 0 : g.hg === g.ag ? 1 : 2;
  // 1. De-vig method and pooling with the model.
  for (const method of ['proportional', 'power', 'shin']) {
    const line = [];
    for (const w of [0, 0.1, 0.2, 0.3]) {
      let loss = 0;
      for (const r of rows) {
        const m = devig(r.g.avg, ['homeWin', 'draw', 'awayWin'], method);
        const p = fm.goalMarkets(fm.scoreMatrix(r.rates.home, r.rates.away, -0.07)).probabilities;
        const model = [p.homeWin, p.draw, p.awayWin].map(v => v / 100);
        const pooled = m.map((v, i) => v ** (1 - w) * model[i] ** w), sum = pooled.reduce((x, y) => x + y, 0);
        loss += ll(pooled[outcome(r.g)] / sum);
      }
      line.push(`w=${w}: ${(loss / rows.length).toFixed(5)}`);
    }
    console.log('1X2', method.padEnd(13), line.join('  '));
  }
  // 2. Total goals when only 1X2 is quoted, scored on O/U 1.5, 2.5, 3.5 and BTTS.
  const totalVariants = {
    model: r => r.rates.home + r.rates.away,
    league: r => r.league.home + r.league.away,
    drawImplied: r => {
      const m = devig(r.g.avg, ['homeWin', 'draw', 'awayWin'], 'proportional');
      const target = m[1];
      // Draw probability decreases with the total for a fixed supremacy.
      let low = 0.5, high = 6;
      for (let i = 0; i < 40; i++) {
        const T = (low + high) / 2, solved = fm.solveGoalRates({ homeWin: m[0] * 100, awayWin: m[2] * 100 }, { total: T });
        const d = fm.goalMarkets(fm.scoreMatrix(solved.home, solved.away, -0.07)).probabilities.draw / 100;
        if (d > target) low = T; else high = T;
      }
      return (low + high) / 2;
    }
  };
  totalVariants.blendDraw = r => Math.sqrt(totalVariants.model(r) * totalVariants.drawImplied(r));
  for (const [name, total] of Object.entries(totalVariants)) {
    let o15 = 0, o25 = 0, o35 = 0, btts = 0;
    for (const r of rows) {
      const m = devig(r.g.avg, ['homeWin', 'draw', 'awayWin'], 'proportional');
      const solved = fm.solveGoalRates({ homeWin: m[0] * 100, awayWin: m[2] * 100 }, { total: total(r) });
      const p = fm.goalMarkets(fm.scoreMatrix(solved.home, solved.away, -0.07)).probabilities, t = r.g.hg + r.g.ag;
      o15 += ll((t > 1.5 ? p.over15 : p.under15) / 100); o25 += ll((t > 2.5 ? p.over25 : p.under25) / 100);
      o35 += ll((t > 3.5 ? p.over35 : p.under35) / 100); btts += ll((r.g.hg > 0 && r.g.ag > 0 ? p.bttsYes : p.bttsNo) / 100);
    }
    const n = rows.length;
    console.log('1X2-only total', name.padEnd(12), 'o1.5', (o15 / n).toFixed(5), 'o2.5', (o25 / n).toFixed(5), 'o3.5', (o35 / n).toFixed(5), 'btts', (btts / n).toFixed(5));
  }
  // 3. Both quotes: market total vs pooled with the model total.
  for (const w of [0, 0.15, 0.3]) {
    let o15 = 0, o25 = 0, o35 = 0, btts = 0;
    for (const r of rows) {
      const m = devig(r.g.avg, ['homeWin', 'draw', 'awayWin'], 'proportional'), ou = devig(r.g.avg, ['over25', 'under25'], 'proportional');
      const marketRates = fm.solveGoalRates({ homeWin: m[0] * 100, awayWin: m[2] * 100, over25: ou[0] * 100 });
      const T = (marketRates.home + marketRates.away) ** (1 - w) * (r.rates.home + r.rates.away) ** w;
      const solved = fm.solveGoalRates({ homeWin: m[0] * 100, awayWin: m[2] * 100 }, { total: T });
      const p = fm.goalMarkets(fm.scoreMatrix(solved.home, solved.away, -0.07)).probabilities, t = r.g.hg + r.g.ag;
      o15 += ll((t > 1.5 ? p.over15 : p.under15) / 100); o25 += ll((t > 2.5 ? p.over25 : p.under25) / 100);
      o35 += ll((t > 3.5 ? p.over35 : p.under35) / 100); btts += ll((r.g.hg > 0 && r.g.ag > 0 ? p.bttsYes : p.bttsNo) / 100);
    }
    const n = rows.length;
    console.log(`both quotes total w=${w}`.padEnd(26), 'o1.5', (o15 / n).toFixed(5), 'o2.5', (o25 / n).toFixed(5), 'o3.5', (o35 / n).toFixed(5), 'btts', (btts / n).toFixed(5));
  }
}
