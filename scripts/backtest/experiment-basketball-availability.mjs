// NBA availability: does knowing who plays improve the own forecast?
// Team ratings are the production ones (opponent- and venue-adjusted points,
// half-life 60 days). Each player is part of his team's rating in proportion
// to the recency-weighted games he played for it ("share"). Margin adjustment
// = alpha x sum(value x (plays - share)), value = game score per game above a
// replacement, from his earlier box scores only. Who plays is the real box
// score (in the app: roster minus the ESPN injury report).
// Two share versions: exact (game by game) and the one the app can compute
// from ESPN season averages (games played per season, injury date).
// Regular season: fitted on 2023-24 and 2024-25, scored blind on 2025-26.
// Preseason: fitted on 2023 and 2024, scored blind on 2025. Bookmaker prices only measure the distance to
// the market, never enter the forecast.
//   node scripts/backtest/fetch-nba-boxscores.mjs && node scripts/backtest/experiment-basketball-availability.mjs
import fs from 'node:fs/promises';
import * as fm from '../../src/utils/footballModel.js';
import { normalCdf } from '../../server/services/sportProbabilityModel.js';
import { BASKETBALL_RATINGS } from '../../server/services/basketballRatings.js';
import { lineupAdjustment, blendedStats, gameScoreOf, AVAILABILITY } from '../../server/services/basketballAvailability.js';
import { espnEventOdds, americanToProbability, noVig } from '../blind-test/common.mjs';

const CACHE = 'artifacts/backtest-cache', DAY = 86400000, HOUR = 3600000, HALF = BASKETBALL_RATINGS.halfLifeDays * DAY;
const read = async name => JSON.parse(await fs.readFile(`${CACHE}/${name}`, 'utf8'));
const sorted = list => [...new Map(list.filter(g => Number.isFinite(g.hs) && Number.isFinite(g.as)).map(g => [g.id, g])).values()].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
const results = {
  reg2022: sorted(await read('espn-nba-202210-202304.json')), pre2023: sorted(await read('espn-nba-preseason-2023.json')),
  reg2023: sorted(await read('espn-nba-202310-202404.json')), reg2024: sorted(await read('espn-nba-202410-202504.json')), reg2025: sorted(await read('espn-nba-202510-202604.json')),
  pre2024: sorted(await read('espn-nba-preseason-2024.json')), pre2025: sorted(await read('espn-nba-preseason-2025.json'))
};
const box = {
  reg2022: await read('espn-nba-box-regular-2022.json'), pre2023: await read('espn-nba-box-preseason-2023.json'),
  reg2023: await read('espn-nba-box-regular-2023.json'), reg2024: await read('espn-nba-box-regular-2024.json'), reg2025: await read('espn-nba-box-regular-2025.json'),
  pre2024: await read('espn-nba-box-preseason-2024.json'), pre2025: await read('espn-nba-box-preseason-2025.json')
};
const KEYS = ['minutes', 'points', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers', 'fgm', 'fga', 'ftm', 'fta'];
// Row: [team, athlete, dnp, MIN, PTS, REB, AST, STL, BLK, TO, FGM, FGA, FTM, FTA, starter, reason]
const played = r => !r[2] && r[3] > 0;
const line = r => Object.fromEntries(KEYS.map((k, i) => [k, r[3 + i]]));

function addTotals(totals, rows) {
  for (const r of rows) {
    if (!played(r)) continue;
    const t = totals.get(r[1]) || { gp: 0, ...Object.fromEntries(KEYS.map(k => [k, 0])) };
    t.gp++; for (const [k, v] of Object.entries(line(r))) t[k] += v;
    totals.set(r[1], t);
  }
}
const averages = t => t?.gp ? { gp: t.gp, ...Object.fromEntries(KEYS.map(k => [k, t[k] / t.gp])) } : null;
// Current season blended with the previous ones while the sample is short (as the app does).
function blended(current, previous, older) {
  const stats = blendedStats(averages(current), averages(previous), averages(older));
  return stats && { ...stats, gameScore: gameScoreOf(stats) };
}

// Team game log: [{ time, season, players: Set }].
function teamLogs(labels) {
  const logs = new Map();
  for (const label of labels) for (const g of results[label]) {
    const rows = box[label][g.id];
    if (!rows) continue;
    for (const team of [g.home, g.away]) {
      const list = logs.get(team) || [];
      list.push({ time: Date.parse(g.kickoff), season: label, id: g.id, players: new Set(rows.filter(r => r[0] === team && played(r)).map(r => r[1])) });
      logs.set(team, list);
    }
  }
  return logs;
}

// Exact share: recency-weighted fraction of the team's earlier games he played.
function exactShares(log, before, asOf = before) {
  const shares = new Map();
  let total = 0;
  for (const game of log) {
    if (game.time >= before) break;
    const w = 0.5 ** ((asOf - game.time) / HALF);
    total += w;
    for (const id of game.players) shares.set(id, (shares.get(id) || 0) + w);
  }
  for (const [id, v] of shares) shares.set(id, v / total);
  return shares;
}
// App share: games played per season with the team, the seasons weighted as the
// rating weighs them, and an absent player's share cut to the games before he
// stopped playing (the injury report date in the app).
function approxShares(log, before, asOf, seasons) {
  const weight = {}, count = {}, gp = {};
  for (const game of log) {
    if (game.time >= before || !seasons.includes(game.season)) continue;
    const w = 0.5 ** ((asOf - game.time) / HALF);
    weight[game.season] = (weight[game.season] || 0) + w; count[game.season] = (count[game.season] || 0) + 1;
    for (const id of game.players) { gp[id] ||= {}; gp[id][game.season] = (gp[id][game.season] || 0) + 1; }
  }
  const total = Object.values(weight).reduce((a, b) => a + b, 0), shares = new Map();
  for (const [id, bySeason] of Object.entries(gp)) shares.set(id, Object.entries(bySeason).reduce((s, [season, n]) => s + weight[season] * n / count[season], 0) / total);
  return { shares, weightBefore: date => log.filter(g => g.time < Math.min(date, before) && seasons.includes(g.season)).reduce((s, g) => s + 0.5 ** ((asOf - g.time) / HALF), 0) / total };
}
const lastPlayed = (log, id, before) => { for (let i = log.length - 1; i >= 0; i--) if (log[i].time < before && log[i].players.has(id)) return log[i].time; return null; };

function walk(history, target) {
  const all = [...history, ...target].map(x => ({ time: Date.parse(x.kickoff), home: x.home, away: x.away, hv: x.hs, av: x.as }));
  const fits = new Map(), out = new Map();
  for (const g of target) {
    const t = Date.parse(g.kickoff), cutoff = Math.floor((t - 10 * HOUR) / DAY) * DAY + 10 * HOUR;
    if (!fits.has(cutoff)) fits.set(cutoff, fm.fitStrengths(all.filter(x => x.time < cutoff), { asOf: cutoff, halfLifeDays: BASKETBALL_RATINGS.halfLifeDays, priorGames: BASKETBALL_RATINGS.priorGames }));
    const pair = fm.expectedPair(fits.get(cutoff), g.home, g.away, { minGames: BASKETBALL_RATINGS.minGames });
    if (pair) out.set(g.id, pair.home - pair.away);
  }
  return out;
}

// For every game: rated margin and, per side, the players with their value
// inputs, whether they played, and both share versions.
function buildRows(prevLabel, label, preseason, olderLabel = null) {
  const previous = new Map(); for (const g of results[prevLabel]) if (box[prevLabel][g.id]) addTotals(previous, box[prevLabel][g.id]);
  const older = new Map(); if (olderLabel) for (const g of results[olderLabel]) if (box[olderLabel][g.id]) addTotals(older, box[olderLabel][g.id]);
  const logs = teamLogs(preseason ? [prevLabel] : [prevLabel, label]), current = new Map(), rows = [];
  let margins;
  if (preseason) {
    const asOf = Date.parse(results[label][0].kickoff) - DAY;
    const fit = fm.fitStrengths(results[prevLabel].map(g => ({ time: Date.parse(g.kickoff), home: g.home, away: g.away, hv: g.hs, av: g.as })), { asOf, halfLifeDays: BASKETBALL_RATINGS.halfLifeDays, priorGames: BASKETBALL_RATINGS.priorGames });
    margins = new Map(results[label].map(g => [g.id, fm.expectedPair(fit, g.home, g.away, { minGames: BASKETBALL_RATINGS.minGames })]).filter(([, p]) => p).map(([id, p]) => [id, p.home - p.away]));
  } else margins = walk(results[prevLabel], results[label]);
  for (const g of results[label]) {
    const t = Date.parse(g.kickoff), gameRows = box[label][g.id];
    if (gameRows && margins.has(g.id)) {
      const sides = {};
      for (const [side, team] of [['home', g.home], ['away', g.away]]) {
        const log = logs.get(team) || [], before = preseason ? Date.parse(results[label][0].kickoff) : t;
        const asOf = preseason ? Date.parse(results[prevLabel].at(-1).kickoff) : t;
        const exact = exactShares(log, before, asOf), approx = approxShares(log, before, asOf, preseason ? [prevLabel] : [prevLabel, label]);
        const tonight = new Set(gameRows.filter(r => r[0] === team && played(r)).map(r => r[1]));
        const listed = new Set(gameRows.filter(r => r[0] === team && !played(r)).map(r => r[1]));
        const ids = new Set([...tonight, ...exact.keys()]);
        sides[side] = [...ids].map(id => {
          const stats = blended(preseason ? null : current.get(id), previous.get(id), older.get(id));
          if (!stats) return null;
          // Listed as not playing (injury report): his share counts only up to the date he stopped.
          let share = approx.shares.get(id) || 0;
          if (!tonight.has(id) && listed.has(id)) { const last = lastPlayed(log, id, before); if (last !== null) share *= approx.weightBefore(last + DAY); }
          return { stats, plays: tonight.has(id) ? 1 : 0, exact: exact.get(id) || 0, approx: share };
        }).filter(Boolean);
      }
      rows.push({ g, margin: margins.get(g.id), sides });
    }
    if (gameRows && !preseason) addTotals(current, gameRows);
  }
  return rows;
}

const ll = (p, y) => -Math.log(Math.min(1 - 1e-9, Math.max(1e-9, y ? p : 1 - p)));
const adjustment = (players, params, kind) => lineupAdjustment(players.map(p => ({ stats: p.stats, plays: p.plays, share: p[kind] })), params);
const predict = (row, params, kind, scale = 1) => normalCdf((scale * row.margin + adjustment(row.sides.home, params, kind) - adjustment(row.sides.away, params, kind)) / BASKETBALL_RATINGS.deviation.nba);
function score(rows, f, odds) {
  let loss = 0, hits = 0, gap = 0, same = 0, priced = 0;
  for (const row of rows) {
    const p = f(row), y = row.g.hs > row.g.as;
    loss += ll(p, y); hits += Number((p >= 0.5) === y);
    const q = odds?.[row.g.id], market = q ? noVig(americanToProbability(q.home), americanToProbability(q.away)) : null;
    if (market !== null) { gap += Math.abs(p - market); same += Number((p >= 0.5) === (market >= 0.5)); priced++; }
  }
  return { n: rows.length, acc: +(hits / rows.length * 100).toFixed(1), logLoss: +(loss / rows.length).toFixed(4),
    vsMarket: priced ? { n: priced, meanGap: +(gap / priced * 100).toFixed(1), sameFavourite: +(same / priced * 100).toFixed(1) } : null };
}
function fit(rows, kind, scales = [1]) {
  let best = null;
  for (const scale of scales) for (const replacement of [0, 0.1, 0.2, 0.25, 0.3, 0.35]) for (const power of [1, 1.5, 2, 2.5, 3]) for (const shrinkGames of [0, 10]) for (let alpha = 0; alpha <= 1.2001; alpha += 0.05) {
    const params = { alpha: +alpha.toFixed(2), replacement, power, shrinkGames, minMinutes: AVAILABILITY.minMinutes };
    const loss = rows.reduce((s, row) => s + ll(predict(row, params, kind, scale), row.g.hs > row.g.as), 0) / rows.length;
    if (!best || loss < best.loss) best = { scale, params, loss: +loss.toFixed(4) };
  }
  return best;
}
const marketScore = (rows, odds) => score(rows.filter(r => odds[r.g.id]?.home != null && odds[r.g.id]?.away != null), r => noVig(americanToProbability(odds[r.g.id].home), americanToProbability(odds[r.g.id].away)), odds);
const none = { alpha: 0, replacement: 0, minMinutes: AVAILABILITY.minMinutes };

const train = [...buildRows('reg2022', 'reg2023', false), ...buildRows('reg2023', 'reg2024', false, 'reg2022')], test = buildRows('reg2024', 'reg2025', false, 'reg2023');
const exactFit = fit(train, 'exact'), approxFit = fit(train, 'approx');
const oddsRegular = await read('espn-odds-nba-1235-401809243-401811055.json');
const preTrain = [...buildRows('reg2022', 'pre2023', true), ...buildRows('reg2023', 'pre2024', true, 'reg2022')], preTest = buildRows('reg2024', 'pre2025', true, 'reg2023');
const preScales = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1];
const preExact = fit(preTrain, 'exact', preScales), preApprox = fit(preTrain, 'approx', preScales);
const oddsPre = await espnEventOdds('basketball', 'nba', results.pre2025.map(g => g.id));
const shippedPre = BASKETBALL_RATINGS.preseason.nba_preseason.scale;
console.log(JSON.stringify({
  regular: { trainGames: train.length, testGames: test.length, fittedOn2023_24and2024_25: { exact: exactFit, app: approxFit },
    blind2025_26: { ratingsOnly: score(test, r => predict(r, none, 'approx'), oddsRegular), exactShares: score(test, r => predict(r, exactFit.params, 'exact'), oddsRegular),
      appShares: score(test, r => predict(r, approxFit.params, 'approx'), oddsRegular), shipped: score(test, r => predict(r, AVAILABILITY.regular, 'approx'), oddsRegular), market: marketScore(test, oddsRegular) } },
  preseason: { trainGames: preTrain.length, testGames: preTest.length, fittedOn2023and2024: { exact: preExact, app: preApprox },
    blind2025: { previous: score(preTest, r => predict(r, none, 'approx', shippedPre), oddsPre), exactShares: score(preTest, r => predict(r, preExact.params, 'exact', preExact.scale), oddsPre),
      appShares: score(preTest, r => predict(r, preApprox.params, 'approx', preApprox.scale), oddsPre), shipped: score(preTest, r => predict(r, AVAILABILITY.preseason, 'approx', AVAILABILITY.preseason.scale), oddsPre), market: marketScore(preTest, oddsPre) } }
}, null, 1));
