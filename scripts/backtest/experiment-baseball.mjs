// Baseball run ratings: tuned on MLB 2025, measured blind on MLB 2026 (May-Sep).
// Compares the production last-20-games model with opponent-adjusted ratings.
import { parseMlbGame } from '../../server/services/baseballDataService.js';
import { baseballAnalysis } from '../../server/services/sportProbabilityModel.js';
import { SPORT_LEAGUES } from '../../src/constants/leagues.js';
import * as fm from '../../src/utils/footballModel.js';
import { cachedJson } from '../blind-test/common.mjs';

const league = SPORT_LEAGUES.beisbol.find(item => item.id === 'mlb');
const DAY = 86400000;
const ll = p => -Math.log(Math.min(1 - 1e-9, Math.max(1e-9, p)));
async function seasonGames(year) {
  const data = await cachedJson(`mlb-${year}-schedule`, async () => (await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${year}-03-15&endDate=${year}-09-30&gameType=R&hydrate=linescore`)).json());
  return data.dates.flatMap(day => day.games).map(game => parseMlbGame(game, league)).filter(game => game?.status === 'FINISHED' && Number.isInteger(game.finalScore.home))
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
}
const games = [...await seasonGames(2025), ...await seasonGames(2026)];
const rows = games.map(g => {
  const innings = g.inningScores || [], sum = (from, to, side) => innings.filter(i => i.num >= from && i.num <= to).reduce((s, i) => s + (i[side] ?? 0), 0);
  const complete5 = innings.filter(i => i.num <= 5 && Number.isInteger(i.home) && Number.isInteger(i.away)).length === 5;
  return { g, time: Date.parse(g.kickoff), home: g.homeTeam.id, away: g.awayTeam.id, hv: g.finalScore.home, av: g.finalScore.away,
    h1: sum(1, 1, 'home'), a1: sum(1, 1, 'away'), h5: complete5 ? sum(1, 5, 'home') : null, a5: complete5 ? sum(1, 5, 'away') : null, extra: Number.isInteger(g.lastInning) ? g.lastInning > 9 : null };
});

// Walk-forward expected runs for one parameter set (refitted daily).
function expectations({ halfLifeDays, priorGames }, from, to) {
  const out = [];
  const days = [...new Set(rows.filter(r => r.time >= from && r.time < to).map(r => Math.floor(r.time / DAY) * DAY))];
  for (const day of days) {
    const history = rows.filter(r => r.time < day);
    const fit = fm.fitStrengths(history, { asOf: day, halfLifeDays, priorGames });
    for (const r of rows.filter(x => x.time >= day && x.time < day + DAY)) {
      const pair = fm.expectedPair(fit, r.home, r.away, { minGames: 5 });
      if (pair) out.push({ r, pair, base: { home: fit.baseHome, away: fit.baseAway } });
    }
  }
  return out;
}
function winnerProbability(lh, la, size) {
  const ph = fm.countDistribution(lh, size, 40), pa = fm.countDistribution(la, size, 40);
  let home = 0, away = 0;
  ph.forEach((p, h) => pa.forEach((q, a) => { if (h > a) home += p * q; else if (a > h) away += p * q; }));
  return home / (home + away);
}
function score(preds, size, label) {
  let n = 0, win = 0, winHits = 0, t85 = 0, t85Hits = 0;
  for (const { r, pair } of preds) {
    const p = winnerProbability(pair.home, pair.away, size), homeWon = r.hv > r.av;
    win += ll(homeWon ? p : 1 - p); winHits += Number((p >= 0.5) === homeWon);
    const total = fm.countLines(convolve(fm.countDistribution(pair.home, size, 40), fm.countDistribution(pair.away, size, 40)), [8.5]).over85 / 100;
    t85 += ll(r.hv + r.av > 8.5 ? total : 1 - total); t85Hits += Number((total >= 0.5) === (r.hv + r.av > 8.5)); n++;
  }
  console.log(label.padEnd(44), 'n', n, 'winner acc', (winHits / n * 100).toFixed(1), 'll', (win / n).toFixed(4), '| over8.5 acc', (t85Hits / n * 100).toFixed(1), 'll', (t85 / n).toFixed(4));
  return { win: win / n, t85: t85 / n };
}
export function convolve(a, b) {
  const out = new Array(a.length + b.length - 1).fill(0);
  a.forEach((p, i) => b.forEach((q, j) => { out[i + j] += p * q; }));
  return out;
}

const TRAIN = [Date.parse('2025-05-01'), Date.parse('2025-10-01')], TEST = [Date.parse('2026-05-01'), Date.parse('2026-09-30')];
// Production baseline on the test window.
{
  let n = 0, win = 0, hits = 0, t85 = 0, t85h = 0;
  for (const r of rows.filter(x => x.time >= TEST[0] && x.time < TEST[1])) {
    const a = baselineAnalysis(r);
    if (a.winner.home == null || r.hv === r.av) continue;
    const p = a.winner.home / 100, won = r.hv > r.av; win += ll(won ? p : 1 - p); hits += Number((p >= 0.5) === won);
    const o = a.totalRuns.find(x => x.line === 8.5).over / 100; t85 += ll(r.hv + r.av > 8.5 ? o : 1 - o); t85h += Number((o >= 0.5) === (r.hv + r.av > 8.5)); n++;
  }
  console.log('production (last 20 games)'.padEnd(44), 'n', n, 'winner acc', (hits / n * 100).toFixed(1), 'll', (win / n).toFixed(4), '| over8.5 acc', (t85h / n * 100).toFixed(1), 'll', (t85 / n).toFixed(4));
}
function baselineAnalysis(r) { return baseballAnalysis({ ...r.g, status: 'SCHEDULED', odds: {} }, games, r.time); }

const results = [];
for (const halfLifeDays of [60, 120, 240, 400]) for (const priorGames of [10, 20, 40, 80]) {
  const train = expectations({ halfLifeDays, priorGames }, ...TRAIN);
  const size = fm.estimateDispersion(train.flatMap(({ r, pair }) => [{ mean: pair.home, value: r.hv }, { mean: pair.away, value: r.av }]));
  const s = score(train, size, `train hl=${halfLifeDays} prior=${priorGames} size=${size.toFixed(1)}`);
  results.push({ halfLifeDays, priorGames, size, ...s });
}
results.sort((a, b) => (a.win + a.t85) - (b.win + b.t85));
const best = results[0];
console.log('BEST on 2025', JSON.stringify(best));
score(expectations(best, ...TEST), best.size, `TEST 2026 hl=${best.halfLifeDays} prior=${best.priorGames}`);
