// Baseball markets: constants estimated on MLB 2025, blind evaluation on 2026.
// Usage: node --import ./tests/setup.js scripts/backtest/experiment-baseball-markets.mjs [estimate]
import { parseMlbGame } from '../../server/services/baseballDataService.js';
import { baseballAnalysis } from '../../server/services/sportProbabilityModel.js';
import { ratedRuns, BASEBALL_RATINGS } from '../../server/services/baseballRatings.js';
import { SPORT_LEAGUES } from '../../src/constants/leagues.js';
import * as fm from '../../src/utils/footballModel.js';
import { Binary, Multi, cachedJson } from '../blind-test/common.mjs';

const league = SPORT_LEAGUES.beisbol.find(item => item.id === 'mlb');
const DAY = 86400000, WINDOW = 120 * DAY;
async function season(year) {
  const data = await cachedJson(`mlb-${year}-schedule`, async () => (await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${year}-03-15&endDate=${year}-09-30&gameType=R&hydrate=linescore`)).json());
  return data.dates.flatMap(day => day.games).map(game => parseMlbGame(game, league)).filter(game => game?.status === 'FINISHED' && Number.isInteger(game.finalScore.home));
}
const games = [...await season(2025), ...await season(2026)].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
const inningRuns = (game, from, to) => {
  const innings = (game.inningScores || []).filter(i => i.num >= from && i.num <= to);
  if (innings.length !== to - from + 1 || !innings.every(i => Number.isInteger(i.away) && (Number.isInteger(i.home) || i.num === 9))) return null;
  return { home: innings.reduce((s, i) => s + (i.home ?? 0), 0), away: innings.reduce((s, i) => s + i.away, 0) };
};
const window = (time) => games.filter(g => Date.parse(g.kickoff) < time && Date.parse(g.kickoff) >= time - WINDOW);

if (process.argv.includes('estimate')) {
  const train = games.filter(g => g.kickoff.startsWith('2025'));
  let total = 0, f5 = 0, f1 = 0, reg = 0;
  for (const g of train) {
    const five = inningRuns(g, 1, 5), one = inningRuns(g, 1, 1), nine = inningRuns(g, 1, 9);
    if (!five || !one || !nine) continue;
    total += g.finalScore.home + g.finalScore.away; f5 += five.home + five.away; f1 += one.home + one.away; reg += nine.home + nine.away;
  }
  console.log('shares on 2025:', { firstFiveShare: (f5 / total).toFixed(3), firstInningShare: (f1 / total).toFixed(3), regulationShare: (reg / total).toFixed(3) });
  // Dispersion of partial counts around the rated expectation (walk-forward, May-Sep 2025).
  const pairsF5 = [], pairsF1 = [], pairsFull = [];
  for (const g of train.filter(g => Date.parse(g.kickoff) >= Date.parse('2025-05-01'))) {
    const rated = ratedRuns({ ...g, status: 'SCHEDULED' }, window(Date.parse(g.kickoff)), Date.parse(g.kickoff));
    if (!rated) continue;
    const five = inningRuns(g, 1, 5), one = inningRuns(g, 1, 1);
    pairsFull.push({ mean: rated.expected.home, value: g.finalScore.home }, { mean: rated.expected.away, value: g.finalScore.away });
    if (five) pairsF5.push({ mean: rated.expected.home * f5 / total, value: five.home }, { mean: rated.expected.away * f5 / total, value: five.away });
    if (one) pairsF1.push({ mean: rated.expected.home * f1 / total, value: one.home }, { mean: rated.expected.away * f1 / total, value: one.away });
  }
  console.log('sizes on 2025:', { size: fm.estimateDispersion(pairsFull).toFixed(2), firstFiveSize: fm.estimateDispersion(pairsF5).toFixed(2), firstInningSize: fm.estimateDispersion(pairsF1).toFixed(2) });
} else {
  const lines = (dist, line) => fm.countLines(dist, [line])[`over${String(line).replace('.', '')}`] / 100;
  const m = {};
  const add = (name, kind, value, outcome) => { (m[name] ||= kind === 'multi' ? new Multi() : new Binary()).add(value, outcome); };
  for (const g of games.filter(g => Date.parse(g.kickoff) >= Date.parse('2026-05-01'))) {
    const t = Date.parse(g.kickoff), history = window(t);
    const old = baseballAnalysis({ ...g, status: 'SCHEDULED', odds: {} }, games, t), rated = ratedRuns({ ...g, status: 'SCHEDULED' }, history, t);
    if (!rated || old.winner.home == null) continue;
    const { home, away } = g.finalScore, total = home + away, five = inningRuns(g, 1, 5), one = inningRuns(g, 1, 1);
    if (home !== away) {
      add('winner · producción', 'binary', old.winner.home / 100, home > away);
      add('winner · ratings', 'binary', rated.full.home / (rated.full.home + rated.full.away), home > away);
    }
    for (const line of [7.5, 8.5, 9.5]) {
      add(`total ${line} · producción`, 'binary', old.totalRuns.find(r => r.line === line).over / 100, total > line);
      add(`total ${line} · ratings`, 'binary', lines(rated.total, line), total > line);
    }
    add('local 3.5 · producción', 'binary', old.teamRuns.home.find(r => r.line === 3.5).over / 100, home > 3.5);
    add('local 3.5 · ratings', 'binary', lines(rated.home, 3.5), home > 3.5);
    add('visita 3.5 · producción', 'binary', old.teamRuns.away.find(r => r.line === 3.5).over / 100, away > 3.5);
    add('visita 3.5 · ratings', 'binary', lines(rated.away, 3.5), away > 3.5);
    if (five) for (const line of [2.5, 4.5]) {
      const row = old.firstFive.find(r => r.line === line);
      if (row?.over != null) add(`5 entradas ${line} · producción`, 'binary', row.over / 100, five.home + five.away > line);
      add(`5 entradas ${line} · ratings`, 'binary', lines(rated.firstFive, line), five.home + five.away > line);
    }
    if (one) {
      const outcome = one.home > one.away ? 0 : one.home === one.away ? 1 : 2;
      if (old.firstInning.home != null) add('1ª entrada · producción', 'multi', [old.firstInning.home, old.firstInning.draw, old.firstInning.away], outcome);
      add('1ª entrada · ratings', 'multi', [rated.firstInning.home, rated.firstInning.draw, rated.firstInning.away], outcome);
    }
    if (Number.isInteger(g.lastInning)) {
      if (old.extraInnings.yes != null) add('extra innings · producción', 'binary', old.extraInnings.yes / 100, g.lastInning > 9);
      add('extra innings · ratings', 'binary', rated.regulationTie, g.lastInning > 9);
    }
  }
  for (const [name, metric] of Object.entries(m)) {
    const r = metric.report();
    console.log(name.padEnd(30), 'n', String(r.n).padStart(5), 'acierto', String(r.hitRate).padStart(5), 'brier', r.brier.toFixed(4), 'logloss', r.logLoss.toFixed(4),
      r.calibration ? ' | ' + r.calibration.map(b => `${b.band}:${b.said}→${b.happened}(${b.n})`).join(' ') : '');
  }
  console.log('constantes', JSON.stringify(BASEBALL_RATINGS));
}
