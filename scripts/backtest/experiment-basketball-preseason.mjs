// NBA preseason winner: last season's opponent-adjusted ratings, moderated
// because rotations rest, against the model the app used (last 20 results of
// the same competition, i.e. earlier preseason games) and a coin flip.
// Moderation chosen on the 2024 preseason, scored blind on the 2025 preseason.
import * as fm from '../../src/utils/footballModel.js';
import { basketballAnalysis, normalCdf } from '../../server/services/sportProbabilityModel.js';
import { BASKETBALL_RATINGS } from '../../server/services/basketballRatings.js';
import { cachedJson } from '../blind-test/common.mjs';

const ll = (p, y) => -Math.log(Math.min(1 - 1e-9, Math.max(1e-9, y ? p : 1 - p)));
const days = (from, n) => Array.from({ length: n }, (_, i) => new Date(Date.parse(from) + i * 86400000).toISOString().slice(0, 10).replaceAll('-', ''));
const shape = e => { const c = e.competitions[0], h = c.competitors.find(t => t.homeAway === 'home'), a = c.competitors.find(t => t.homeAway === 'away');
  return { id: e.id, kickoff: e.date, home: String(h.team.id), away: String(a.team.id), hs: Number(h.score), as: Number(a.score), type: e.season?.type }; };
async function events(name, dates, type) {
  const list = await cachedJson(name, async () => (await Promise.all(dates.map(async d => (await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${d}&limit=1000`)).json()).events || []))).flat()
    .filter(e => e.status?.type?.completed).map(shape));
  return [...new Map(list.filter(g => g.type === type && Number.isFinite(g.hs)).map(g => [g.id, g])).values()].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
}
const months = (y, m, n) => Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(y, m - 1 + i, 1)); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`; });
async function regular(y) { // regular season starting in October of year y
  return events(`espn-nba-regular-${y}`, months(y, 10, 7), 2);
}
const pre = { 2023: await events('espn-nba-preseason-2023', days('2023-10-01', 25), 1), 2024: await events('espn-nba-preseason-2024', days('2024-10-01', 25), 1), 2025: await events('espn-nba-preseason-2025', days('2025-10-01', 25), 1) };
const reg = { 2023: await regular(2023), 2024: await regular(2024) };
const { halfLifeDays, priorGames } = BASKETBALL_RATINGS, sd = BASKETBALL_RATINGS.deviation.nba;

function predict(year) {
  const history = reg[year - 1].map(g => ({ time: Date.parse(g.kickoff), home: g.home, away: g.away, hv: g.hs, av: g.as }));
  const asOf = Date.parse(`${year}-10-01`);
  const fit = fm.fitStrengths(history, { asOf, halfLifeDays, priorGames });
  // The app's previous method: earlier preseason games (this and last year).
  const earlier = [...pre[year - 1], ...pre[year]].map(g => ({ id: g.id, sport: 'basquetbol', leagueId: 'nba_preseason', status: 'FINISHED', kickoff: g.kickoff, homeTeam: { id: g.home }, awayTeam: { id: g.away }, finalScore: { home: g.hs, away: g.as } }));
  return pre[year].map(g => {
    const pair = fm.expectedPair(fit, g.home, g.away, { minGames: 5 });
    const legacy = basketballAnalysis({ id: g.id, sport: 'basquetbol', leagueId: 'nba_preseason', status: 'SCHEDULED', kickoff: g.kickoff, homeTeam: { id: g.home }, awayTeam: { id: g.away }, odds: {} }, earlier, Date.parse(g.kickoff));
    return { y: g.hs > g.as, margin: pair ? pair.home - pair.away : null, homeEdge: fit.baseHome - fit.baseAway, legacy: legacy.winner.home == null ? null : legacy.winner.home / 100 };
  });
}
const train = predict(2024), test = predict(2025);
const p = (r, k, edge) => normalCdf(k * (r.margin - (1 - edge) * r.homeEdge) / sd);
let best = null;
for (let k = 0; k <= 1.0001; k += 0.05) for (const edge of [0, 0.25, 0.5, 0.75, 1]) {
  const rows = train.filter(r => r.margin !== null), loss = rows.reduce((s, r) => s + ll(p(r, k, edge), r.y), 0) / rows.length;
  if (!best || loss < best.loss) best = { k: +k.toFixed(2), edge, loss: +loss.toFixed(4) };
}
const score = (rows, f) => { const v = rows.filter(r => f(r) != null); return { n: v.length, acc: +(v.filter(r => (f(r) >= 0.5) === r.y).length / v.length * 100).toFixed(1), logLoss: +(v.reduce((s, r) => s + ll(f(r), r.y), 0) / v.length).toFixed(4),
  extremes: v.filter(r => Math.max(f(r), 1 - f(r)) > 0.75).length }; };
const both = test.filter(r => r.margin !== null && r.legacy !== null);
console.log(JSON.stringify({ games: { train: train.length, test: test.length }, chosen: best, homeWinRate2025: +(test.filter(r => r.y).length / test.length * 100).toFixed(1),
  test2025: { coinFlip: score(both, () => 0.5), homeRate: score(both, () => train.filter(r => r.y).length / train.length), previousApp: score(both, r => r.legacy),
    lastSeasonFull: score(both, r => p(r, 1, 1)), lastSeasonModerated: score(both, r => p(r, best.k, best.edge)) } }, null, 1));
