// Tennis blind test (ESPN, October 2025 onwards): the production formula with
// Elo and game-share Elo replayed from earlier results, ranking points from the
// last weekly ATP/WTA list before each match and head-to-head wins. No casino
// price enters the forecast; ESPN does not publish tennis odds to compare.
import { tennisGames } from '../backtest/experiment-tennis.mjs';
import { features, weeklyRankings } from '../backtest/experiment-tennis-v2.mjs';
import { tennisFeatureProbability } from '../../server/services/sportProbabilityModel.js';
import { Binary, writeReport } from './common.mjs';

const FROM = Date.parse('2025-10-01');
const report = { checkedAt: new Date().toISOString(),
  method: 'Prueba ciega: Elo por resultados y por porcentaje de juegos con partidos anteriores, ranking ATP/WTA de la última lista semanal previa al partido y cara a cara previo. Pesos ajustados antes de octubre de 2025. Sin cuotas de casas.' };
for (const tour of ['atp', 'wta']) {
  const rows = features(await tennisGames(tour), await weeklyRankings(tour));
  const winner = new Binary(), strong = new Binary();
  for (const r of rows) {
    if (r.t < FROM || r.nh < 5 || r.na < 5) continue;
    const p = tennisFeatureProbability(tour, { eloChance: r.pElo, gameGap: r.gelo * 400 / Math.LN10, pointsRatio: Math.exp(r.rank), homeWins: r.hw, awayWins: r.aw });
    winner.add(p, Boolean(r.y));
    if (Math.max(p, 1 - p) >= 0.65) strong.add(p, Boolean(r.y));
  }
  report[tour] = { winner: winner.report(), favouriteAtLeast65: strong.report() };
}
await writeReport('tennis', report);
console.log(JSON.stringify(report, null, 1));
