// Basketball: opponent-adjusted points ratings versus the last-20-margins model.
// Tuned on NBA 2024-25 / WNBA 2025 (previous season as history), measured
// blind on NBA 2025-26 / WNBA 2026 against DraftKings closing prices.
import { basketballAnalysis, normalCdf } from '../../server/services/sportProbabilityModel.js';
import * as fm from '../../src/utils/footballModel.js';
import { cachedJson, espnEventOdds, americanToProbability, noVig } from '../blind-test/common.mjs';

const DAY = 86400000, HOUR = 3600000;
const ll = p => -Math.log(Math.min(1 - 1e-9, Math.max(1e-9, p)));
async function season(league, months) {
  const events = await cachedJson(`espn-${league}-${months[0]}-${months.at(-1)}`, async () => {
    const lists = await Promise.all(months.map(async m => (await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/${league}/scoreboard?dates=${m}&limit=1000`)).json()).events || []));
    return lists.flat().filter(e => e.status?.type?.completed && e.season?.type === 2).map(e => {
      const c = e.competitions[0], h = c.competitors.find(t => t.homeAway === 'home'), a = c.competitors.find(t => t.homeAway === 'away');
      return { id: e.id, kickoff: e.date, home: h.team.id, away: a.team.id, hs: Number(h.score), as: Number(a.score) };
    });
  });
  return [...new Map(events.map(e => [e.id, e])).values()].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
}
const months = (from, count) => Array.from({ length: count }, (_, i) => { const d = new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(4)) - 1 + i, 1)); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`; });
// One fit per US calendar day: every earlier day is complete by 10:00 UTC.
function walk(history, target, { halfLifeDays, priorGames }) {
  const all = [...history, ...target].map(x => ({ time: Date.parse(x.kickoff), home: x.home, away: x.away, hv: x.hs, av: x.as }));
  const fits = new Map(), out = [];
  for (const g of target) {
    const t = Date.parse(g.kickoff), cutoff = Math.floor((t - 10 * HOUR) / DAY) * DAY + 10 * HOUR;
    if (!fits.has(cutoff)) fits.set(cutoff, fm.fitStrengths(all.filter(x => x.time < cutoff), { asOf: cutoff, halfLifeDays, priorGames }));
    const pair = fm.expectedPair(fits.get(cutoff), g.home, g.away, { minGames: 5 });
    out.push({ g, mean: pair ? pair.home - pair.away : null, early: t < Date.parse(target[Math.floor(target.length * 0.15)].kickoff) });
  }
  return out;
}
const sdOf = preds => Math.sqrt(preds.reduce((s, p) => s + (p.g.hs - p.g.as - p.mean) ** 2, 0) / preds.length);
function score(rows, odds) {
  let n = 0, loss = 0, hits = 0, diff = 0, vc = 0, same = 0, spreadLoss = 0, spreadHits = 0, sn = 0;
  for (const { g, p, cover } of rows) {
    const won = g.hs > g.as;
    loss += ll(won ? p : 1 - p); hits += Number((p >= 0.5) === won); n++;
    const q = odds?.[g.id], casino = q ? noVig(americanToProbability(q.home), americanToProbability(q.away)) : null;
    if (casino !== null) { diff += Math.abs(p - casino); same += Number((p >= 0.5) === (casino >= 0.5)); vc++; }
    if (cover && q && Number.isFinite(q.spread) && q.spread % 1 !== 0) {
      const c = cover(q.spread), covered = g.hs - g.as + q.spread > 0;
      spreadLoss += ll(covered ? c : 1 - c); spreadHits += Number((c >= 0.5) === covered); sn++;
    }
  }
  return { n, acc: +(hits / n * 100).toFixed(1), ll: +(loss / n).toFixed(4), vsCasino: vc ? { diff: +(diff / vc * 100).toFixed(1), sameFavourite: +(same / vc * 100).toFixed(1) } : null,
    spreadAtCasinoLine: sn ? { n: sn, acc: +(spreadHits / sn * 100).toFixed(1), ll: +(spreadLoss / sn).toFixed(4) } : null };
}
const rated = (preds, sd, k = 1) => preds.filter(x => x.mean !== null).map(x => ({ ...x, p: normalCdf(k * x.mean / sd), cover: line => normalCdf((k * x.mean + line) / sd) }));
const LEAGUES = [['nba', ['202310', '202410', '202510'], 7], ['wnba', ['202405', '202505', '202605'], 5]];
const data = Object.fromEntries(await Promise.all(LEAGUES.map(async ([league, starts, length]) => [league, await Promise.all(starts.map(s => season(league, months(s, length))))])));
// Shared parameters chosen on the earlier seasons of both leagues together.
let best = null;
for (const halfLifeDays of [15, 20, 30, 45, 60, 90, 120]) for (const priorGames of [0.5, 1, 2, 4]) {
  const walks = Object.fromEntries(Object.entries(data).map(([league, [old, train]]) => { const preds = walk(old, train, { halfLifeDays, priorGames }).filter(x => x.mean !== null); return [league, { preds, sd: sdOf(preds) }]; }));
  for (const k of [0.85, 0.9, 0.95, 1]) {
    let loss = 0, n = 0;
    for (const { preds, sd } of Object.values(walks)) { const s = score(rated(preds, sd, k)); loss += s.ll * s.n; n += s.n; }
    if (!best || loss / n < best.ll) best = { halfLifeDays, priorGames, k, ll: +(loss / n).toFixed(4), sd: Object.fromEntries(Object.entries(walks).map(([l, w]) => [l, +w.sd.toFixed(2)])) };
  }
}
console.log('MEJOR entrenamiento conjunto', JSON.stringify(best));
for (const [league] of LEAGUES) {
  const [, train, test] = data[league];
  const odds = await espnEventOdds('basketball', league, test.map(g => g.id));
  const preds = walk(train, test, best), withRatings = rated(preds, best.sd[league], best.k);
  const games = [...train, ...test].map(e => ({ id: e.id, sport: 'basquetbol', leagueId: league, status: 'FINISHED', kickoff: e.kickoff, homeTeam: { id: e.home }, awayTeam: { id: e.away }, finalScore: { home: e.hs, away: e.as } }));
  const production = preds.map(({ g, early }) => {
    const a = basketballAnalysis({ ...games.find(x => x.id === g.id), status: 'SCHEDULED', odds: {} }, games, Date.parse(g.kickoff));
    if (a.winner.home == null) return null;
    return { g, early, p: a.winner.home / 100 };
  }).filter(Boolean);
  const both = new Set(production.map(x => x.g.id).filter(id => withRatings.some(x => x.g.id === id)));
  for (const [label, filter] of [['temporada completa', () => true], ['primer 15%', x => x.early], ['resto', x => !x.early]]) {
    console.log(league, label.padEnd(18), 'ratings   ', JSON.stringify(score(withRatings.filter(x => both.has(x.g.id) && filter(x)), odds)));
    console.log(league, label.padEnd(18), 'producción', JSON.stringify(score(production.filter(x => both.has(x.g.id) && filter(x)), odds)));
  }
}
