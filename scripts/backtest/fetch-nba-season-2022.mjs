// NBA 2022-23 regular-season results (ESPN), the history for the 2023 preseason
// and the 2023-24 season in the availability experiment.
import fs from 'node:fs/promises';
const out = 'artifacts/backtest-cache/espn-nba-202210-202304.json';
const days = []; for (let t = Date.parse('2022-10-15'); t <= Date.parse('2023-04-12'); t += 86400000) days.push(new Date(t).toISOString().slice(0, 10).replaceAll('-', ''));
const games = [];
for (let i = 0; i < days.length; i += 10) {
  const lists = await Promise.all(days.slice(i, i + 10).map(async d => (await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${d}&limit=100`)).json()).events || []));
  for (const e of lists.flat()) {
    if (!e.status?.type?.completed || e.season?.type !== 2) continue;
    const c = e.competitions[0], h = c.competitors.find(t => t.homeAway === 'home'), a = c.competitors.find(t => t.homeAway === 'away');
    games.push({ id: e.id, kickoff: e.date, home: h.team.id, away: a.team.id, hs: Number(h.score), as: Number(a.score) });
  }
}
const unique = [...new Map(games.map(g => [g.id, g])).values()].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
await fs.writeFile(out, JSON.stringify(unique));
console.log(unique.length);
