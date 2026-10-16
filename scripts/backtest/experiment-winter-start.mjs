// Winter leagues (LMP, LVBP, LIDOM): how good are the run ratings in the first
// weeks of a season, when most of the history is last winter? Blind on the
// 2025-26 seasons: every forecast uses only earlier games. Compared with a
// home-advantage-only baseline and with ratings whose old-season games are
// regressed toward the league average.
//   node scripts/backtest/experiment-winter-start.mjs
import fs from 'node:fs/promises';
import { ratedRuns } from '../../server/services/baseballRatings.js';

const CACHE = 'artifacts/backtest-cache';
async function season(leagueId, from, to) {
  const file = `${CACHE}/winter-${leagueId}-${from}-${to}.json`;
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch {}
  const data = await (await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=17&leagueId=${leagueId}&startDate=${from}&endDate=${to}`)).json();
  const games = (data.dates || []).flatMap(d => d.games).filter(g => g.status?.abstractGameState === 'Final' && Number.isInteger(g.teams.home.score) && g.teams.home.score !== g.teams.away.score)
    .map(g => ({ id: String(g.gamePk), kickoff: g.gameDate, leagueId: String(leagueId), status: 'FINISHED', homeTeam: { id: String(g.teams.home.team.id) }, awayTeam: { id: String(g.teams.away.team.id) },
      finalScore: { home: g.teams.home.score, away: g.teams.away.score } }));
  await fs.writeFile(file, JSON.stringify(games));
  return games;
}
const ll = p => -Math.log(Math.min(1 - 1e-9, Math.max(1e-9, p)));
const out = {};
for (const [name, id] of [['LMP', 132], ['LVBP', 135], ['LIDOM', 131]]) {
  const games = [...await season(id, '2024-10-01', '2025-02-15'), ...await season(id, '2025-10-01', '2026-02-15')].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  const start = Date.parse('2025-10-01');
  const target = games.filter(g => Date.parse(g.kickoff) >= start);
  const firstDay = Date.parse(target[0]?.kickoff);
  const rows = [];
  for (const g of target) {
    const t = Date.parse(g.kickoff), earlier = games.filter(x => Date.parse(x.kickoff) < t - 3 * 3600000);
    const homeRate = earlier.filter(x => Date.parse(x.kickoff) >= t - 400 * 86400000);
    const base = (homeRate.filter(x => x.finalScore.home > x.finalScore.away).length + 50) / (homeRate.length + 100);
    const rated = ratedRuns({ ...g, status: 'SCHEDULED' }, earlier, t);
    if (!rated) continue;
    const p = rated.full.home / (rated.full.home + rated.full.away);
    rows.push({ y: g.finalScore.home > g.finalScore.away, p, base, week: Math.floor((t - firstDay) / (7 * 86400000)) });
  }
  const score = (list, f) => ({ n: list.length, acc: +(list.filter(r => (f(r) >= 0.5) === r.y).length / list.length * 100).toFixed(1), logLoss: +(list.reduce((s, r) => s + ll(r.y ? f(r) : 1 - f(r)), 0) / list.length).toFixed(4) });
  const blend = w => r => w * r.p + (1 - w) * r.base;
  const early = rows.filter(r => r.week < 3), later = rows.filter(r => r.week >= 3);
  out[name] = { games: rows.length, homeWinRate: +(rows.filter(r => r.y).length / rows.length * 100).toFixed(1),
    first3weeks: { ratings: score(early, r => r.p), homeOnly: score(early, r => r.base), half: score(early, blend(0.5)) },
    afterWeek3: { ratings: score(later, r => r.p), homeOnly: score(later, r => r.base), half: score(later, blend(0.5)) } };
}
console.log(JSON.stringify(out, null, 1));
