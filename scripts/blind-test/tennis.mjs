// Tennis blind test (ESPN, October 2025 onwards): the production formula with
// Elo replayed from earlier results, ATP ranking points from the last weekly
// list before each match and head-to-head wins. No casino prices exist on ESPN.
import fs from 'node:fs/promises';
import { tennisGames, eloSeries } from '../backtest/experiment-tennis.mjs';
import { calibrateTennis, TENNIS_ATP_WEIGHTS } from '../../server/services/sportProbabilityModel.js';
import { Binary, CACHE, writeReport } from './common.mjs';

const FROM = Date.parse('2025-10-01');
const report = { checkedAt: new Date().toISOString(),
  method: 'Prueba ciega: Elo con resultados anteriores, ranking ATP de la última lista semanal previa al partido y cara a cara previo. ESPN no publica cuotas de tenis, por lo que no hay comparación con casino.' };
for (const tour of ['atp', 'wta']) {
  const games = await tennisGames(tour), elo = eloSeries(games);
  const rankings = tour === 'atp' ? JSON.parse(await fs.readFile(`${CACHE}/espn-rankings-atp.json`, 'utf8')) : [];
  const points = (id, time) => {
    let list = null;
    for (const item of rankings) { if (Date.parse(item.date) < time - 86400000) list = item; else break; }
    if (!list) return null;
    return list.ranks.find(rank => rank[0] === id)?.[2] ?? list.ranks.at(-1)[2] * 0.7;
  };
  const h2h = new Map(), winner = new Binary(), strong = new Binary();
  for (const g of games) {
    const t = Date.parse(g.kickoff), e = elo.get(g.id), key = [g.homeTeam.id, g.awayTeam.id].sort().join('|');
    const record = h2h.get(key) || {}, hw = record[g.homeTeam.id] || 0, aw = record[g.awayTeam.id] || 0, won = g.finalScore.home > g.finalScore.away;
    if (t >= FROM && e.nh >= 5 && e.na >= 5) {
      let p = calibrateTennis(e.p, tour);
      if (tour === 'atp') {
        const ph = points(g.homeTeam.id.replace('atp-', ''), t), pa = points(g.awayTeam.id.replace('atp-', ''), t);
        if (ph && pa) {
          const q = Math.min(0.99, Math.max(0.01, e.p)), w = TENNIS_ATP_WEIGHTS;
          p = 1 / (1 + Math.exp(-(w.elo * Math.log(q / (1 - q)) + w.rank * Math.log(ph / pa) + w.h2h * (hw - aw) / (hw + aw + 2))));
        }
      }
      winner.add(p, won);
      if (Math.max(p, 1 - p) >= 0.65) strong.add(p, won);
    }
    record[g.homeTeam.id] = hw + Number(won); record[g.awayTeam.id] = aw + Number(!won); h2h.set(key, record);
  }
  report[tour] = { winner: winner.report(), favouriteAtLeast65: strong.report() };
}
await writeReport('tennis', report);
console.log(JSON.stringify(report, null, 1));
