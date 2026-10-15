// MLB starting pitchers on top of the production run ratings. Each probable
// starter's quality is his FIP (home runs, walks, hit batters and strikeouts per
// inning) from his EARLIER games of this and last season, shrunk toward the
// league with k innings; the runs his team allows are scaled by
// 1 + w x (starter FIP / reference FIP - 1). Reference: the league, or the
// pitchers who started for that team in the last 60 days (the rating already
// contains them). Tuned on MLB 2025, scored blind on MLB 2026. Prices only
// measure the distance to the market.
//   node scripts/backtest/experiment-baseball-starters.mjs
import fs from 'node:fs/promises';
import { fitStrengths, expectedPair, countDistribution } from '../../src/utils/footballModel.js';
import { BASEBALL_RATINGS } from '../../server/services/baseballRatings.js';
import { starterFactor, STARTERS } from '../../server/services/baseballStarters.js';
import { americanToProbability, noVig } from '../blind-test/common.mjs';

const CACHE = 'artifacts/backtest-cache', DAY = 86400000;
const read = async name => JSON.parse(await fs.readFile(`${CACHE}/${name}`, 'utf8'));
const games = [];
for (const year of [2025, 2026]) {
  const data = await read(`mlb-${year}-schedule-pitchers.json`);
  for (const g of data.dates.flatMap(day => day.games)) {
    if (g.status?.abstractGameState !== 'Final' || !Number.isInteger(g.teams.home.score) || g.gameType !== 'R') continue;
    games.push({ id: g.gamePk, year, time: Date.parse(g.gameDate), home: String(g.teams.home.team.id), away: String(g.teams.away.team.id),
      homeName: g.teams.home.team.name, awayName: g.teams.away.team.name, hv: g.teams.home.score, av: g.teams.away.score, hp: g.teams.home.probablePitcher?.id ?? null, ap: g.teams.away.probablePitcher?.id ?? null });
  }
}
games.sort((a, b) => a.time - b.time);

// Game logs of every probable starter (cached).
async function logs(year, ids) {
  const file = `${CACHE}/mlb-pitcher-logs-${year}.json`;
  let out = {};
  try { out = JSON.parse(await fs.readFile(file, 'utf8')); } catch {}
  const missing = [...ids].filter(id => !out[id]);
  for (let i = 0; i < missing.length; i += 12) {
    await Promise.all(missing.slice(i, i + 12).map(async id => {
      const r = await fetch(`https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=gameLog&group=pitching&season=${year}`);
      const splits = r.ok ? (await r.json()).stats?.[0]?.splits || [] : [];
      out[id] = splits.map(s => [Date.parse(s.date), s.stat.outs || 0, s.stat.homeRuns || 0, s.stat.baseOnBalls || 0, s.stat.hitByPitch || 0, s.stat.strikeOuts || 0, s.stat.gamesStarted || 0]);
    }));
  }
  await fs.writeFile(file, JSON.stringify(out));
  return out;
}
const starters = new Set(games.flatMap(g => [g.hp, g.ap]).filter(Boolean));
const pitcherLogs = { 2024: await logs(2024, starters), 2025: await logs(2025, starters), 2026: await logs(2026, starters) };
// Totals of a pitcher before a time: this season and the previous one.
function totals(id, year, before) {
  const sum = (list, filter) => (list || []).filter(filter).reduce((t, x) => ({ outs: t.outs + x[1], hr: t.hr + x[2], bb: t.bb + x[3], hbp: t.hbp + x[4], k: t.k + x[5] }), { outs: 0, hr: 0, bb: 0, hbp: 0, k: 0 });
  return { current: sum(pitcherLogs[year]?.[id], x => x[0] < before), previous: sum(pitcherLogs[year - 1]?.[id], () => true) };
}

const ll = p => -Math.log(Math.min(1 - 1e-9, Math.max(1e-9, p)));
const resultOf = (home, away) => { let h = 0, a = 0; home.forEach((p, i) => away.forEach((q, j) => { if (i > j) h += p * q; else if (i < j) a += p * q; })); return h / (h + a); };
const fits = new Map();
// Inputs per game: rated expected runs (production parameters, one fit per day) and both starters' totals.
const rows = [];
for (const g of games) {
  const day = Math.floor(g.time / DAY) * DAY + 10 * 3600000, cutoff = g.time < day ? day - DAY : day;
  if (!fits.has(cutoff)) fits.set(cutoff, fitStrengths(games.filter(x => x.time < cutoff), { asOf: cutoff, halfLifeDays: BASEBALL_RATINGS.halfLifeDays, priorGames: BASEBALL_RATINGS.priorGames }));
  const pair = expectedPair(fits.get(cutoff), g.home, g.away, { minGames: BASEBALL_RATINGS.minGames });
  if (!pair || !g.hp || !g.ap) continue;
  // Team reference: starters of each team in the 60 days before.
  const recent = side => games.filter(x => x.time < cutoff && x.time >= cutoff - 60 * DAY && (x.home === g[side] || x.away === g[side])).map(x => x.home === g[side] ? x.hp : x.ap).filter(Boolean);
  // Game logs are dated by the local game day (UTC midnight): only earlier days count,
  // never the start being forecast.
  const localDay = Date.parse(new Date(g.time - 10 * 3600000).toISOString().slice(0, 10));
  rows.push({ g, pair, year: g.year, home: totals(g.hp, g.year, localDay), away: totals(g.ap, g.year, localDay),
    homeRotation: recent('home').map(id => totals(id, g.year, localDay)), awayRotation: recent('away').map(id => totals(id, g.year, localDay)) });
}
// League FIP per season so far (from the totals of every starter before the day is close enough: use each season's full average).
function predict(r, params) {
  const f = side => starterFactor(r[side], params.reference === 'team' ? r[`${side}Rotation`] : null, params);
  const home = r.pair.home * f('away'), away = r.pair.away * f('home');
  return resultOf(countDistribution(home, BASEBALL_RATINGS.size, 40), countDistribution(away, BASEBALL_RATINGS.size, 40));
}
function score(list, params, odds) {
  let loss = 0, hits = 0, gap = 0, same = 0, priced = 0;
  for (const r of list) {
    const p = predict(r, params), y = r.g.hv > r.g.av;
    loss += ll(y ? p : 1 - p); hits += Number((p >= 0.5) === y);
    const q = odds?.[r.g.espn], market = q ? noVig(americanToProbability(q.home), americanToProbability(q.away)) : null;
    if (market !== null) { gap += Math.abs(p - market); same += Number((p >= 0.5) === (market >= 0.5)); priced++; }
  }
  return { n: list.length, acc: +(hits / list.length * 100).toFixed(1), logLoss: +(loss / list.length).toFixed(4), vsMarket: priced ? { n: priced, meanGap: +(gap / priced * 100).toFixed(1), sameFavourite: +(same / priced * 100).toFixed(1) } : null };
}
const train = rows.filter(r => r.year === 2025 && r.g.time >= Date.parse('2025-04-20')), test = rows.filter(r => r.year === 2026 && r.g.time >= Date.parse('2026-04-20'));
let best = null;
for (const reference of ['league']) for (const k of [80, 120, 160, 240, 320]) for (const prevWeight of [0.5, 1]) for (let w = 0.3; w <= 1.0001; w += 0.1) {
  const params = { ...STARTERS, reference, shrinkInnings: k, previousWeight: prevWeight, weight: +w.toFixed(1) };
  const loss = train.reduce((s, r) => s + ll(r.g.hv > r.g.av ? predict(r, params) : 1 - predict(r, params)), 0) / train.length;
  if (!best || loss < best.loss) best = { params, loss: +loss.toFixed(4) };
}
// ESPN odds of 2026 (cached by the blind test) keyed by ESPN event id: match by date and teams.
const espn = await read('espn-odds-mlb-1922-401815164-401817111.json');
const blind = await read('espn-mlb-2026-may-sep.json');
const key = (t, h, a) => `${new Date(t).toISOString().slice(0, 13)}|${h}|${a}`;
const byKey = new Map(blind.map(e => [key(Date.parse(e.date), e.home, e.away), e.id]));
for (const r of test) r.g.espn = byKey.get(key(r.g.time, r.g.homeName, r.g.awayName));
const none = { ...STARTERS, weight: 0 };
console.log(JSON.stringify({ games: { train: train.length, test: test.length }, chosen: best,
  blind2026: { withoutStarters: score(test, none, espn), withStarters: score(test, best.params, espn), shipped: score(test, STARTERS, espn),
    market: (() => { const priced = test.filter(r => espn[r.g.espn]?.home != null && espn[r.g.espn]?.away != null); const p = r => noVig(americanToProbability(espn[r.g.espn].home), americanToProbability(espn[r.g.espn].away));
      return { n: priced.length, acc: +(priced.filter(r => (p(r) >= 0.5) === (r.g.hv > r.g.av)).length / priced.length * 100).toFixed(1), logLoss: +(priced.reduce((s, r) => s + ll(r.g.hv > r.g.av ? p(r) : 1 - p(r)), 0) / priced.length).toFixed(4) }; })() } }, null, 1));
