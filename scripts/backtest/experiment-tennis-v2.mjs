// Tennis winner v2: which of the app's own signals improve the forecast?
// Walk-forward on real ESPN singles results: every feature uses only matches
// before the forecast. Weights are fitted on March-September 2025 and scored
// on October 2025 onwards. No bookmaker price is used anywhere.
import fs from 'node:fs/promises';
import { tennisGames } from './experiment-tennis.mjs';
import { calibrateTennis, tennisFeatureProbability } from '../../server/services/sportProbabilityModel.js';

// Formula shipped until 8 October 2026 (ATP only; WTA used calibrated Elo).
const PREVIOUS_ATP = { elo: 0.37, rank: 0.43, h2h: 0.42 };

const CACHE = 'artifacts/backtest-cache';
const SPLIT = Date.parse('2025-10-01'), START = Date.parse('2025-03-01');
const ll = p => -Math.log(Math.min(1 - 1e-9, Math.max(1e-9, p)));
const logit = p => Math.log(p / (1 - p)), sigmoid = x => 1 / (1 + Math.exp(-x));
const clampP = p => Math.min(0.99, Math.max(0.01, p));

export async function weeklyRankings(tour) {
  const file = `${CACHE}/espn-rankings-${tour}.json`;
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch {}
  const lists = [];
  for (const year of [2024, 2025, 2026]) for (let week = 1; week <= 53; week += 4) {
    const batch = await Promise.all([0, 1, 2, 3].map(async offset => {
      const response = await fetch(`https://sports.core.api.espn.com/v2/sports/tennis/leagues/${tour}/seasons/${year}/types/2/weeks/${week + offset}/rankings/${tour === 'wta' ? 2 : 1}`);
      if (!response.ok) return null;
      const data = await response.json();
      if (!Array.isArray(data.ranks) || !data.lastUpdated) return null;
      return { date: data.lastUpdated, ranks: data.ranks.map(rank => [rank.athlete?.$ref?.match(/athletes\/(\d+)/)?.[1], rank.current, rank.points]) };
    }));
    lists.push(...batch.filter(Boolean));
  }
  const unique = [...new Map(lists.map(list => [list.date, list])).values()].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  await fs.writeFile(file, JSON.stringify(unique));
  return unique;
}

const validSet = s => Number.isFinite(s.home) && Number.isFinite(s.away) && ((Math.max(s.home, s.away) >= 6 && Math.abs(s.home - s.away) >= 2) || (Math.max(s.home, s.away) === 7 && Math.min(s.home, s.away) === 6));
export const gameShare = game => {
  const sets = (game.setScores || []).filter(validSet), total = sets.reduce((s, x) => s + x.home + x.away, 0);
  return total ? sets.reduce((s, x) => s + x.home, 0) / total : null;
};
const kFor = n => 250 / ((n || 0) + 5) ** 0.4;

// Pre-match features for every game, replayed in date order.
export function features(games, rankings = []) {
  const elo = new Map(), gelo = new Map(), played = new Map(), last = new Map(), h2h = new Map(), recent = new Map(), rows = [];
  let cursor = 0, list = null;
  const pointsOf = (id, t) => {
    while (cursor < rankings.length && Date.parse(rankings[cursor].date) < t - 86400000) list = rankings[cursor++];
    if (!list) return null;
    return list.ranks.find(rank => rank[0] === id)?.[2] ?? list.ranks.at(-1)[2] * 0.7;
  };
  for (const g of games) {
    const t = Date.parse(g.kickoff), h = g.homeTeam.id, a = g.awayTeam.id, won = g.finalScore.home > g.finalScore.away ? 1 : 0;
    const eh = elo.get(h) ?? 1500, ea = elo.get(a) ?? 1500, gh = gelo.get(h) ?? 1500, ga = gelo.get(a) ?? 1500;
    const pElo = 1 / (1 + 10 ** ((ea - eh) / 400));
    const key = [h, a].sort().join('|'), record = h2h.get(key) || {}, hw = record[h] || 0, aw = record[a] || 0;
    const form = id => { const xs = recent.get(id) || []; return xs.length ? (xs.reduce((s, x) => s + x, 0) + 2.5) / (xs.length + 5) : 0.5; };
    const rest = id => last.has(id) ? Math.min(120, (t - last.get(id)) / 86400000) : 120;
    const ph = pointsOf(h.replace(/^(atp|wta)-/, ''), t), pa = pointsOf(a.replace(/^(atp|wta)-/, ''), t);
    rows.push({ id: g.id, t, y: won, nh: played.get(h) || 0, na: played.get(a) || 0, pElo,
      elo: logit(clampP(pElo)), gelo: (gh - ga) / 400 * Math.LN10, rank: ph && pa ? Math.log(ph / pa) : 0, hasRank: Boolean(ph && pa),
      h2h: (hw - aw) / (hw + aw + 2), hw, aw, form: form(h) - form(a), rest: Math.log1p(rest(h)) - Math.log1p(rest(a)), one: 1 });
    // Updates after the match.
    const kh = kFor(played.get(h)), ka = kFor(played.get(a));
    elo.set(h, eh + kh * (won - pElo)); elo.set(a, ea - ka * (won - pElo));
    const share = gameShare(g);
    if (share !== null) {
      // Game-share Elo: the expected share of games follows the rating gap.
      const expected = 1 / (1 + 10 ** ((ga - gh) / 400));
      gelo.set(h, gh + kh * 2 * (share - expected)); gelo.set(a, ga - ka * 2 * (share - expected));
    }
    played.set(h, (played.get(h) || 0) + 1); played.set(a, (played.get(a) || 0) + 1);
    last.set(h, t); last.set(a, t);
    record[h] = hw + won; record[a] = aw + 1 - won; h2h.set(key, record);
    for (const [id, value] of [[h, share ?? won], [a, share === null ? 1 - won : 1 - share]]) {
      const xs = recent.get(id) || []; xs.push(value); if (xs.length > 10) xs.shift(); recent.set(id, xs);
    }
  }
  return rows;
}

export function fitLogistic(rows, names, iterations = 4000, rate = 0.1, l2 = 0.001) {
  const w = names.map(() => 0);
  for (let it = 0; it < iterations; it++) {
    const grad = names.map(() => 0);
    for (const r of rows) {
      const p = sigmoid(names.reduce((s, f, i) => s + w[i] * r[f], 0));
      names.forEach((f, i) => { grad[i] += (p - r.y) * r[f]; });
    }
    names.forEach((_, i) => { w[i] -= rate * (grad[i] / rows.length + l2 * w[i]); });
  }
  return w;
}

export function score(rows, prob) {
  const n = rows.length; let loss = 0, hits = 0, brier = 0; const bands = new Map();
  for (const r of rows) {
    const p = prob(r); loss += ll(r.y ? p : 1 - p); hits += Number((p >= 0.5) === Boolean(r.y)); brier += (p - r.y) ** 2;
    const said = Math.max(p, 1 - p), band = Math.min(9, Math.floor(said * 10)), b = bands.get(band) || { n: 0, said: 0, hap: 0 };
    b.n++; b.said += said; b.hap += Number((p >= 0.5) === Boolean(r.y)); bands.set(band, b);
  }
  return { n, acc: +(hits / n * 100).toFixed(1), logLoss: +(loss / n).toFixed(4), brier: +(brier / n).toFixed(4),
    bands: [...bands].sort((a, b) => a[0] - b[0]).map(([k, b]) => `${k * 10}%:${b.n} dijo ${(b.said / b.n * 100).toFixed(1)}→${(b.hap / b.n * 100).toFixed(1)}`).join(' · ') };
}

if (process.argv[1]?.endsWith('experiment-tennis-v2.mjs')) {
  const out = {};
  for (const tour of ['atp', 'wta']) {
    const games = await tennisGames(tour), rankings = await weeklyRankings(tour);
    const rows = features(games, rankings).filter(r => r.t >= START && r.nh >= 5 && r.na >= 5);
    const train = rows.filter(r => r.t < SPLIT), test = rows.filter(r => r.t >= SPLIT);
    const shipped = r => {
      if (tour === 'atp' && r.hasRank) { const w = PREVIOUS_ATP; return sigmoid(w.elo * r.elo + w.rank * r.rank + w.h2h * r.h2h); }
      return calibrateTennis(r.pElo, tour);
    };
    out[tour] = { rankingLists: rankings.length, train: train.length, test: test.length, testWithRank: test.filter(r => r.hasRank).length, variants: {} };
    out[tour].variants.previous = score(test, shipped);
    out[tour].variants.production = score(test, r => tennisFeatureProbability(tour, { eloChance: r.pElo, gameGap: r.gelo * 400 / Math.LN10, pointsRatio: Math.exp(r.rank), homeWins: r.hw, awayWins: r.aw }));
    for (const names of [['elo', 'rank', 'h2h'], ['elo', 'gelo', 'rank', 'h2h'], ['gelo', 'rank', 'h2h'], ['elo', 'gelo', 'rank', 'h2h', 'form'], ['elo', 'gelo', 'rank', 'h2h', 'rest'], ['elo', 'gelo', 'rank', 'h2h', 'form', 'rest']]) {
      const w = fitLogistic(train, names);
      out[tour].variants[`${names.join('+')} [${w.map(x => x.toFixed(2)).join(', ')}]`] = score(test, r => sigmoid(names.reduce((s, f, i) => s + w[i] * r[f], 0)));
    }
  }
  console.log(JSON.stringify(out, null, 1));
}
