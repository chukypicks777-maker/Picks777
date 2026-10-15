// NPB and KBO: full-season run ratings against the window the app used before
// (NPB: last 21 days; KBO: about two months), and the tie chance from the whole
// league against the two teams' last games. Walk-forward: every forecast only
// uses games before its day. No bookmaker price is used.
//   node scripts/backtest/experiment-asian-baseball.mjs
import fs from 'node:fs/promises';
import { parseNpbCalendar, parseKboSchedule, kboPage } from '../../server/services/baseballDataService.js';
import { ratedRuns } from '../../server/services/baseballRatings.js';
import { leagueTieChance } from '../../server/services/sportProbabilityModel.js';

const CACHE = 'artifacts/backtest-cache', DAY = 86400000;
const npbLeague = { id: 'npb', name: 'NPB', allowsDraw: true }, kboLeague = { id: 'kbo', name: 'KBO', allowsDraw: true };
async function cached(name, load) {
  try { return await fs.readFile(`${CACHE}/${name}`, 'utf8'); } catch {}
  const body = await load(); await fs.writeFile(`${CACHE}/${name}`, body); return body;
}
async function npbSeason(year) {
  const games = [];
  for (let m = 3; m <= 11; m++) {
    const html = await cached(`npb-calendar-${year}-${m}.html`, async () => { const r = await fetch(`https://npb.jp/bis/eng/${year}/calendar/index_${String(m).padStart(2, '0')}.html`); return r.ok ? r.text() : ''; });
    if (html.includes('stschedule')) games.push(...parseNpbCalendar(html, npbLeague, year));
  }
  return games;
}
// KBO: the official month pages, walked back through the ASP.NET postback.
async function kboMonths(count) {
  const file = `${CACHE}/kbo-months-${count}.json`;
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch {}
  const session = {}, pages = [];
  let html = await kboPage(session);
  for (let k = 0; k < count; k++) { pages.push(html); html = await kboPage(session, html, 'previous'); }
  await fs.writeFile(file, JSON.stringify(pages));
  return pages;
}

const ll = p => -Math.log(Math.min(1 - 1e-9, Math.max(1e-9, p)));
function walk(games, from, windowDays) {
  const finished = games.filter(g => g.status === 'FINISHED').sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  const out = { full: [], window: [] };
  for (const g of finished.filter(g => Date.parse(g.kickoff) >= from)) {
    const start = Date.parse(g.kickoff), match = { ...g, status: 'SCHEDULED' };
    const earlier = finished.filter(x => Date.parse(x.kickoff) < Math.floor(start / DAY) * DAY - 3 * 3600000);
    const result = g.finalScore.home > g.finalScore.away ? 'home' : g.finalScore.home < g.finalScore.away ? 'away' : 'draw';
    for (const [kind, history] of [['full', earlier], ['window', earlier.filter(x => Date.parse(x.kickoff) >= start - windowDays * DAY)]]) {
      const rated = ratedRuns(match, history, start);
      if (!rated) continue;
      const share = rated.full.home / (rated.full.home + rated.full.away);
      // Tie: whole league (shipped) or the two teams' last 20 games each (previous).
      const teams = [g.homeTeam.id, g.awayTeam.id];
      const recent = [...new Map(teams.flatMap(id => history.filter(x => [x.homeTeam.id, x.awayTeam.id].includes(id)).slice(-20)).map(x => [x.id, x])).values()];
      const teamTie = (recent.filter(x => x.finalScore.home === x.finalScore.away).length + 0.5) / (recent.length + 1);
      const tie = kind === 'full' ? leagueTieChance(earlier, { before: start }) : teamTie;
      out[kind].push({ result, share, tie });
    }
  }
  return out;
}
function score(rows) {
  const decisive = rows.filter(r => r.result !== 'draw');
  const p3 = r => r.result === 'draw' ? r.tie : (1 - r.tie) * (r.result === 'home' ? r.share : 1 - r.share);
  return { n: rows.length, decisiveAcc: +(decisive.filter(r => (r.share >= 0.5) === (r.result === 'home')).length / decisive.length * 100).toFixed(1),
    decisiveLogLoss: +(decisive.reduce((s, r) => s + ll(r.result === 'home' ? r.share : 1 - r.share), 0) / decisive.length).toFixed(4),
    threeWayLogLoss: +(rows.reduce((s, r) => s + ll(p3(r)), 0) / rows.length).toFixed(4),
    tieSaid: +(rows.reduce((s, r) => s + r.tie, 0) / rows.length * 100).toFixed(2), tieHappened: +(rows.filter(r => r.result === 'draw').length / rows.length * 100).toFixed(2),
    tieMax: +(Math.max(...rows.map(r => r.tie)) * 100).toFixed(1) };
}
const npb = [...await npbSeason(2025), ...await npbSeason(2026)];
const kbo = (await kboMonths(20)).flatMap(html => { try { return parseKboSchedule(html, kboLeague, '2026-10-14T12:00:00Z'); } catch { return []; } });
const kboUnique = [...new Map(kbo.map(g => [g.id, g])).values()];
const report = {};
for (const [name, games, from, windowDays] of [['NPB 2026', npb, Date.parse('2026-04-15'), 21], ['KBO 2026', kboUnique, Date.parse('2026-04-15'), 60], ['KBO 2025', kboUnique.filter(g => g.kickoff < '2025-12'), Date.parse('2025-04-15'), 60]]) {
  const w = walk(games, from, windowDays);
  report[name] = { games: games.filter(g => g.status === 'FINISHED' && Date.parse(g.kickoff) >= from).length, previous: score(w.window), shipped: score(w.full) };
}
console.log(JSON.stringify(report, null, 1));
