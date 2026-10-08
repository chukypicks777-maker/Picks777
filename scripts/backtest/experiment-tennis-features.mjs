// Does head-to-head history or the official ranking improve the tennis winner?
// Walk-forward on real ESPN results; weekly ATP rankings are taken from the last
// list published before each match. Coefficients are fitted before October
// 2025 and evaluated afterwards.
import fs from 'node:fs/promises';
import { tennisGames, eloSeries } from './experiment-tennis.mjs';
import { calibrateTennis } from '../../server/services/sportProbabilityModel.js';

const CACHE = 'artifacts/backtest-cache';
const SPLIT = Date.parse('2025-10-01');
const ll = p => -Math.log(Math.min(1 - 1e-9, Math.max(1e-9, p)));
const logit = p => Math.log(p / (1 - p)), sigmoid = x => 1 / (1 + Math.exp(-x));

async function weeklyRankings(tour) {
  const file = `${CACHE}/espn-rankings-${tour}.json`;
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch {}
  const lists = [];
  for (const year of [2024, 2025, 2026]) {
    for (let week = 1; week <= 53; week += 4) {
      const batch = await Promise.all([0, 1, 2, 3].map(async offset => {
        const response = await fetch(`https://sports.core.api.espn.com/v2/sports/tennis/leagues/${tour}/seasons/${year}/types/2/weeks/${week + offset}/rankings/1`);
        if (!response.ok) return null;
        const data = await response.json();
        if (!Array.isArray(data.ranks) || !data.lastUpdated) return null;
        return { date: data.lastUpdated, ranks: data.ranks.map(rank => [rank.athlete?.$ref?.match(/athletes\/(\d+)/)?.[1], rank.current, rank.points]) };
      }));
      lists.push(...batch.filter(Boolean));
    }
  }
  const unique = [...new Map(lists.map(list => [list.date, list])).values()].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  await fs.writeFile(file, JSON.stringify(unique));
  return unique;
}

function fitLogistic(rows, features, iterations = 3000, rate = 0.05) {
  const w = features.map(() => 0);
  for (let it = 0; it < iterations; it++) {
    const grad = features.map(() => 0);
    for (const r of rows) {
      const p = sigmoid(features.reduce((s, f, i) => s + w[i] * r[f], 0));
      features.forEach((f, i) => { grad[i] += (p - r.y) * r[f]; });
    }
    features.forEach((_, i) => { w[i] -= rate * grad[i] / rows.length; });
  }
  return w;
}

for (const tour of ['atp', 'wta']) {
  const games = await tennisGames(tour);
  const elo = eloSeries(games);
  const rankings = tour === 'atp' ? await weeklyRankings(tour) : [];
  const rankAt = (athleteId, time) => {
    let list = null;
    for (const item of rankings) { if (Date.parse(item.date) < time - 86400000) list = item; else break; }
    if (!list) return null;
    const found = list.ranks.find(rank => rank[0] === athleteId);
    // Outside the published top 150: below the last listed player's points.
    return found ? found[2] : list.ranks.at(-1)[2] * 0.7;
  };
  const h2h = new Map(), rows = [];
  for (const g of games) {
    const t = Date.parse(g.kickoff), e = elo.get(g.id);
    const key = [g.homeTeam.id, g.awayTeam.id].sort().join('|'), record = h2h.get(key) || { [g.homeTeam.id]: 0, [g.awayTeam.id]: 0 };
    const hw = record[g.homeTeam.id] || 0, aw = record[g.awayTeam.id] || 0;
    if (t >= Date.parse('2025-03-01') && e.nh >= 5 && e.na >= 5) {
      const ph = rankAt(g.homeTeam.id.replace(`${tour}-`, ''), t), pa = rankAt(g.awayTeam.id.replace(`${tour}-`, ''), t);
      const won = g.finalScore.home > g.finalScore.away;
      rows.push({ t, y: Number(won), elo: logit(Math.min(0.99, Math.max(0.01, e.p))), shipped: calibrateTennis(e.p, tour),
        h2h: (hw - aw) / (hw + aw + 2), h2hCount: hw + aw, rank: ph && pa ? Math.log(ph / pa) : 0, hasRank: Boolean(ph && pa) });
    }
    record[g.homeTeam.id] = hw + (g.finalScore.home > g.finalScore.away ? 1 : 0);
    record[g.awayTeam.id] = aw + (g.finalScore.home > g.finalScore.away ? 0 : 1);
    h2h.set(key, record);
  }
  const train = rows.filter(r => r.t < SPLIT), test = rows.filter(r => r.t >= SPLIT);
  const report = (name, prob) => {
    const n = test.length, loss = test.reduce((s, r) => s + ll(r.y ? prob(r) : 1 - prob(r)), 0) / n;
    const acc = test.filter(r => (prob(r) >= 0.5) === Boolean(r.y)).length / n;
    const strong = test.filter(r => Math.max(prob(r), 1 - prob(r)) >= 0.65);
    console.log(tour, name.padEnd(28), 'n', n, 'acc', (acc * 100).toFixed(1), 'logloss', loss.toFixed(4),
      '| fav>=65%:', strong.length, 'said', (strong.reduce((s, r) => s + Math.max(prob(r), 1 - prob(r)), 0) / strong.length * 100).toFixed(1),
      'hit', (strong.filter(r => (prob(r) >= 0.5) === Boolean(r.y)).length / strong.length * 100).toFixed(1));
  };
  report('shipped (Elo calibrado)', r => r.shipped);
  for (const features of [['elo'], ['elo', 'h2h'], ...(tour === 'atp' ? [['elo', 'rank'], ['elo', 'rank', 'h2h'], ['rank']] : [])]) {
    const w = fitLogistic(train, features);
    report(`${features.join('+')} [${w.map(x => x.toFixed(2)).join(', ')}]`, r => sigmoid(features.reduce((s, f, i) => s + w[i] * r[f], 0)));
  }
  console.log(tour, 'test rows with ranking for both players', test.filter(r => r.hasRank).length, 'with previous h2h', test.filter(r => r.h2hCount > 0).length);
}
