// Walk-forward evaluation of the football probabilities with free historical data
// (football-data.co.uk). Each forecast is fitted only with matches from earlier
// calendar days. The production functions are called directly.
// Usage: node --import ./tests/setup.js scripts/backtest-football.mjs
import fs from 'node:fs/promises';
import { applyLegacyFootballForecast } from '../server/services/probabilityModel.js';
import { halfGoalModel } from '../server/services/verifiedStats.js';
import { totalLines } from '../src/utils/probability.js';
import { getTop3Opportunities } from '../src/utils/mathProbabilities.js';
import * as fm from '../src/utils/footballModel.js';
import { LEAGUES, loadLeague } from './backtest/footballData.mjs';

const TRAIN = new Set(['2122', '2223', '2324']);
const DAY = 86400000;

class Metric {
  constructor() { this.n = 0; this.brier = 0; this.logLoss = 0; this.hits = 0; this.bins = new Map(); }
  add(probabilities, observed) {
    const total = probabilities.reduce((a, b) => a + b, 0);
    if (!probabilities.every(Number.isFinite) || Math.abs(total - 1) > 0.02) return;
    const p = probabilities.map(v => Math.min(1 - 1e-9, Math.max(1e-9, v / total)));
    this.n++;
    // Binary markets: the usual Brier score; 1X2: sum over the three outcomes.
    this.brier += p.reduce((sum, v, i) => sum + (v - Number(i === observed)) ** 2, 0) / (p.length === 2 ? 2 : 1);
    this.logLoss -= Math.log(p[observed]);
    this.hits += Number(p.indexOf(Math.max(...p)) === observed);
    p.forEach((v, i) => {
      if (p.length === 2 && i === 1) return;
      const key = Math.min(9, Math.floor(v * 10)), bin = this.bins.get(key) || { n: 0, predicted: 0, observed: 0 };
      bin.n++; bin.predicted += v; bin.observed += Number(i === observed); this.bins.set(key, bin);
    });
  }
  report() {
    if (!this.n) return null;
    const bins = [...this.bins].sort((a, b) => a[0] - b[0]).map(([k, b]) => ({ range: `${k * 10}-${k * 10 + 10}%`, n: b.n,
      predicted: +(b.predicted / b.n * 100).toFixed(1), observed: +(b.observed / b.n * 100).toFixed(1) }));
    const weight = bins.reduce((s, b) => s + b.n, 0);
    return { n: this.n, accuracy: +(this.hits / this.n * 100).toFixed(2), brier: +(this.brier / this.n).toFixed(5), logLoss: +(this.logLoss / this.n).toFixed(5),
      ece: +(bins.reduce((s, b) => s + b.n * Math.abs(b.predicted - b.observed), 0) / weight).toFixed(2), bins };
  }
}

class PickMetric {
  constructor() { this.n = 0; this.hits = 0; this.probability = 0; this.bands = new Map(); this.markets = new Map(); }
  add(pick, won) {
    if (!pick || won == null) return;
    this.n++; this.hits += Number(won); this.probability += pick.probability;
    for (const [map, key] of [[this.bands, Math.min(9, Math.floor(pick.probability / 10))], [this.markets, pick.key]]) {
      const b = map.get(key) || { n: 0, hits: 0, probability: 0 };
      b.n++; b.hits += Number(won); b.probability += pick.probability; map.set(key, b);
    }
  }
  report() {
    const row = b => ({ n: b.n, hitRate: +(b.hits / b.n * 100).toFixed(1), meanProbability: +(b.probability / b.n).toFixed(1) });
    return this.n ? { ...row(this), bands: Object.fromEntries([...this.bands].sort((a, b) => a[0] - b[0]).map(([k, b]) => [`${k * 10}-${k * 10 + 10}%`, row(b)])),
      markets: Object.fromEntries([...this.markets].sort((a, b) => b[1].n - a[1].n).map(([k, b]) => [k, row(b)])) } : null;
  }
}

const pickWon = (key, h, a) => ({ homeWin: h > a, awayWin: a > h, dc1X: h >= a, dcX2: a >= h, bttsYes: h > 0 && a > 0, bttsNo: h === 0 || a === 0,
  over15: h + a > 1.5, under15: h + a < 1.5, over25: h + a > 2.5, under25: h + a < 2.5, over35: h + a > 3.5, under35: h + a < 3.5 })[key] ?? null;
const oneX2 = odds => ({ homeWin: odds.homeWin, draw: odds.draw, awayWin: odds.awayWin });

// What production derives today from ESPN standings and the last ten boxscores.
function currentTeamStats(history, team, season) {
  const own = history.filter(g => g.season === season && (g.home === team || g.away === team));
  const recent = own.slice(-10), side = g => g.home === team;
  const mean = values => values.length >= 5 ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const halves = recent.filter(g => Number.isFinite(g.hthg) && Number.isFinite(g.htag));
  return { gamesPlayed: own.length, goalsFor: own.reduce((s, g) => s + (side(g) ? g.hg : g.ag), 0), goalsAgainst: own.reduce((s, g) => s + (side(g) ? g.ag : g.hg), 0),
    avgCorners: mean(recent.map(g => side(g) ? g.hc : g.ac).filter(Number.isFinite)),
    avgYellowCards: mean(recent.map(g => side(g) ? g.hy : g.ay).filter(Number.isFinite)),
    halves: { sampleSizes: { halves: halves.length }, firstFor: halves.reduce((s, g) => s + (side(g) ? g.hthg : g.htag), 0), firstAgainst: halves.reduce((s, g) => s + (side(g) ? g.htag : g.hthg), 0),
      totalFor: halves.reduce((s, g) => s + (side(g) ? g.hg : g.ag), 0), totalAgainst: halves.reduce((s, g) => s + (side(g) ? g.ag : g.hg), 0) } };
}

function currentForecast(g, homeStats, awayStats, odds) {
  const match = applyLegacyFootballForecast({ id: `${g.league}-${g.time}`, status: 'SCHEDULED', kickoff: new Date(g.time).toISOString(),
    homeTeam: { name: g.home, ...homeStats }, awayTeam: { name: g.away, ...awayStats }, odds });
  const p = match.model?.probabilities || match.probabilities;
  return { probabilities: p && Number.isFinite(p.homeWin) ? p : null, pick: match.aiPick ? { key: match.aiPick.key, probability: match.aiPick.probability } : null, model: match.model };
}

function newPick(g, forecast, odds) {
  if (!forecast) return null;
  const pick = getTop3Opportunities({ id: 'x', status: 'SCHEDULED', homeTeam: { name: g.home }, awayTeam: { name: g.away }, odds,
    model: { probabilities: forecast.probabilities, probabilitySources: forecast.sources }, probabilities: forecast.probabilities })[0];
  return pick ? { key: pick.key, probability: pick.probability } : null;
}

export async function collect() {
  const records = [];
  for (const code of Object.keys(LEAGUES)) {
    const games = await loadLeague(code);
    const seasonStart = new Map();
    for (const g of games) if (!seasonStart.has(g.season)) seasonStart.set(g.season, g.time);
    const days = [...new Set(games.map(g => Math.floor(g.time / DAY) * DAY))].sort((a, b) => a - b);
    let cursor = 0;
    for (const day of days) {
      while (cursor < games.length && games[cursor].time < day) cursor++;
      const batch = games.filter(g => g.time >= day && g.time < day + DAY);
      if (cursor < 60 || !batch.length) continue;
      const history = games.slice(0, cursor), season = batch[0].season;
      const fits = fm.fitFootballLeague(history, { asOf: day, seasonStart: seasonStart.get(season) });
      for (const g of batch) {
        const homeStats = currentTeamStats(history, g.home, season), awayStats = currentTeamStats(history, g.away, season);
        const current = currentForecast(g, homeStats, awayStats, {});
        const currentMarket = currentForecast(g, homeStats, awayStats, { ...g.avg });
        const currentMarket1x2 = currentForecast(g, homeStats, awayStats, oneX2(g.avg));
        const next = fm.forecastFootball(fits, g.home, g.away, {});
        const nextMarket = fm.forecastFootball(fits, g.home, g.away, g.avg);
        const nextMarket1x2 = fm.forecastFootball(fits, g.home, g.away, oneX2(g.avg));
        const close = fm.devigPower(g.close, ['homeWin', 'draw', 'awayWin']), closeOu = fm.devigPower(g.close, ['over25', 'under25']);
        const r = { game: g, train: TRAIN.has(g.season),
          app: current.probabilities, appMarket: currentMarket.probabilities, appMarket1x2: currentMarket1x2.probabilities,
          new: next?.probabilities || null, newMarket: nextMarket?.probabilities || null, newMarket1x2: nextMarket1x2?.probabilities || null,
          close: close ? { ...close.probabilities, ...(closeOu?.probabilities || {}) } : null,
          picks: { app: current.pick, appMarket: currentMarket.pick, appMarket1x2: currentMarket1x2.pick,
            new: newPick(g, next, {}), newMarket: newPick(g, nextMarket, g.avg), newMarket1x2: newPick(g, nextMarket1x2, oneX2(g.avg)) },
          newCorners: nextMarket?.corners || next?.corners || null, newCards: nextMarket?.cards || next?.cards || null,
          newHalves: nextMarket?.halves || null, cornerMeans: fm.expectedPair(fits.corners, g.home, g.away), cardMeans: fm.expectedPair(fits.cards, g.home, g.away) };
        if (Number.isFinite(homeStats.avgCorners) && Number.isFinite(awayStats.avgCorners)) {
          r.appCorners = { total: totalLines(homeStats.avgCorners + awayStats.avgCorners, [5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5]),
            home: totalLines(homeStats.avgCorners, [3.5, 4.5, 5.5]), away: totalLines(awayStats.avgCorners, [3.5, 4.5, 5.5]) };
        }
        if (Number.isFinite(homeStats.avgYellowCards) && Number.isFinite(awayStats.avgYellowCards)) r.appCards = totalLines(homeStats.avgYellowCards + awayStats.avgYellowCards, [2.5, 3.5, 4.5, 5.5]);
        // Current half model: team half splits applied to the production goal model.
        if (currentMarket.model) r.appHalves = halfGoalModel(currentMarket.model, homeStats.halves, awayStats.halves);
        records.push(r);
      }
    }
  }
  return records;
}

function score(records) {
  const metrics = new Map(), picks = new Map();
  const metric = key => { if (!metrics.has(key)) metrics.set(key, new Metric()); return metrics.get(key); };
  const binary = (key, over, happened) => Number.isFinite(over) && metric(key).add([over / 100, 1 - over / 100], happened ? 0 : 1);
  for (const r of records) {
    const { hg, ag, hc, ac, hy, ay, hthg, htag } = r.game;
    // Common sample: every compared model produced a forecast.
    if (!['app', 'new', 'appMarket', 'newMarket'].every(k => r[k])) continue;
    for (const model of ['app', 'appMarket', 'appMarket1x2', 'new', 'newMarket', 'newMarket1x2', 'close']) {
      const p = r[model];
      if (!p) continue;
      metric(`${model}|1x2`).add([p.homeWin, p.draw, p.awayWin].map(v => v / 100), hg > ag ? 0 : hg === ag ? 1 : 2);
      for (const line of [1.5, 2.5, 3.5]) binary(`${model}|over${line}`, p[`over${String(line).replace('.', '')}`], hg + ag > line);
      binary(`${model}|btts`, p.bttsYes, hg > 0 && ag > 0);
      if (model !== 'close') picks.set(model, picks.get(model) || new PickMetric());
      if (model !== 'close') picks.get(model).add(r.picks[model], r.picks[model] ? pickWon(r.picks[model].key, hg, ag) : null);
    }
    if (r.appCorners && r.newCorners && Number.isFinite(hc)) {
      for (const line of [5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5]) {
        const k = String(line).replace('.', '');
        binary(`corners.current|total${line}`, r.appCorners.total[`over${k}`], hc + ac > line);
        binary(`corners.new|total${line}`, r.newCorners.total[`over${k}`], hc + ac > line);
      }
      for (const [side, value] of [['home', hc], ['away', ac]]) for (const line of [3.5, 4.5, 5.5]) {
        const k = String(line).replace('.', '');
        binary(`corners.current|${side}${line}`, r.appCorners[side][`over${k}`], value > line);
        binary(`corners.new|${side}${line}`, r.newCorners[side][`over${k}`], value > line);
      }
    }
    if (r.appCards && r.newCards && Number.isFinite(hy)) for (const line of [2.5, 3.5, 4.5, 5.5]) {
      const k = String(line).replace('.', '');
      binary(`cards.current|total${line}`, r.appCards[`over${k}`], hy + ay > line);
      binary(`cards.new|total${line}`, r.newCards.total[`over${k}`], hy + ay > line);
    }
    if (r.appHalves && r.newHalves && Number.isFinite(hthg)) for (const line of [0.5, 1.5]) {
      const k = String(line).replace('.', '');
      binary(`half1.current|over${line}`, r.appHalves.first[`over${k}`], hthg + htag > line);
      binary(`half1.new|over${line}`, r.newHalves.first[`over${k}`], hthg + htag > line);
      binary(`half2.current|over${line}`, r.appHalves.second[`over${k}`], hg + ag - hthg - htag > line);
      binary(`half2.new|over${line}`, r.newHalves.second[`over${k}`], hg + ag - hthg - htag > line);
    }
  }
  return { metrics: Object.fromEntries([...metrics].sort().map(([k, m]) => [k, m.report()])), picks: Object.fromEntries([...picks].map(([k, m]) => [k, m.report()])) };
}

if (process.argv[1]?.endsWith('backtest-football.mjs')) {
  const started = Date.now();
  const records = await collect();
  const train = records.filter(r => r.train && r.cornerMeans && Number.isFinite(r.game.hc));
  const dispersion = {
    cornersTotal: fm.estimateDispersion(train.map(r => ({ mean: r.cornerMeans.home + r.cornerMeans.away, value: r.game.hc + r.game.ac }))),
    cornersHome: fm.estimateDispersion(train.map(r => ({ mean: r.cornerMeans.home, value: r.game.hc }))),
    cornersAway: fm.estimateDispersion(train.map(r => ({ mean: r.cornerMeans.away, value: r.game.ac }))),
    cardsTotal: fm.estimateDispersion(records.filter(r => r.train && r.cardMeans && Number.isFinite(r.game.hy)).map(r => ({ mean: r.cardMeans.home + r.cardMeans.away, value: r.game.hy + r.game.ay })))
  };
  const report = { checkedAt: new Date().toISOString(), runtimeSeconds: (Date.now() - started) / 1000, model: fm.FOOTBALL_MODEL, trainingDispersion: dispersion,
    data: 'football-data.co.uk (Premier League, LaLiga, Serie A, Ligue 1, Bundesliga), 2021-22 a 2026-27 parcial. Mercado visible: cuotas previas promedio. Referencia: cierre Pinnacle o promedio de cierre.',
    split: 'Entrenamiento 2021-22 a 2023-24 (parámetros elegidos aquí); prueba 2024-25 a 2026-27.',
    train: score(records.filter(r => r.train)), test: score(records.filter(r => !r.train)) };
  await fs.mkdir('artifacts/opt-2026-10-07', { recursive: true });
  await fs.writeFile('artifacts/opt-2026-10-07/backtest-football.json', JSON.stringify(report, null, 2));
  for (const split of ['train', 'test']) {
    console.log(`\n=== ${split.toUpperCase()} ===`);
    for (const [key, v] of Object.entries(report[split].metrics)) if (v) console.log(key.padEnd(28), 'n', String(v.n).padStart(5), 'acc', String(v.accuracy).padStart(6), 'brier', v.brier.toFixed(4), 'logloss', v.logLoss.toFixed(4), 'ece', v.ece);
    for (const [key, v] of Object.entries(report[split].picks)) if (v) console.log('PICK', key.padEnd(14), 'n', v.n, 'hit', v.hitRate, 'meanP', v.meanProbability);
  }
  console.log('\ntraining dispersion', JSON.stringify(dispersion), 'runtime', report.runtimeSeconds, 's');
}
