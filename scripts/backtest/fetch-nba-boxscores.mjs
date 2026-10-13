// Compact ESPN NBA box scores (who played, minutes and counting stats, and who
// did not play) for the availability experiment. Cached per season.
//   node scripts/backtest/fetch-nba-boxscores.mjs
import fs from 'node:fs/promises';

const CACHE = 'artifacts/backtest-cache';
const SEASONS = {
  'regular-2024': 'espn-nba-202410-202504.json', 'regular-2025': 'espn-nba-202510-202604.json',
  'preseason-2023': 'espn-nba-preseason-2023.json', 'preseason-2024': 'espn-nba-preseason-2024.json', 'preseason-2025': 'espn-nba-preseason-2025.json',
  'regular-2023': 'espn-nba-202310-202404.json', 'regular-2022': 'espn-nba-202210-202304.json'
};
const index = (labels, name) => labels.indexOf(name);
const madeAttempted = value => { const [m, a] = String(value || '').split('-').map(Number); return [m || 0, a || 0]; };

export function compactBox(summary) {
  const rows = [];
  for (const team of summary.boxscore?.players || []) {
    const stats = team.statistics?.[0], labels = stats?.labels || [];
    for (const a of stats?.athletes || []) {
      const s = a.stats || [], get = name => Number(s[index(labels, name)]) || 0;
      const [fgm, fga] = madeAttempted(s[index(labels, 'FG')]), [ftm, fta] = madeAttempted(s[index(labels, 'FT')]);
      rows.push([String(team.team.id), String(a.athlete.id), a.didNotPlay || !s.length ? 1 : 0, get('MIN'), get('PTS'), get('REB'), get('AST'), get('STL'), get('BLK'), get('TO'), fgm, fga, ftm, fta, a.starter ? 1 : 0, a.reason || '']);
    }
  }
  return rows;
}

for (const [label, file] of Object.entries(SEASONS)) {
  const out = `${CACHE}/espn-nba-box-${label}.json`;
  let done = {};
  try { done = JSON.parse(await fs.readFile(out, 'utf8')); } catch {}
  const games = JSON.parse(await fs.readFile(`${CACHE}/${file}`, 'utf8')).filter(g => !done[g.id]);
  for (let i = 0; i < games.length; i += 12) {
    await Promise.all(games.slice(i, i + 12).map(async g => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${g.id}`);
          if (!response.ok) throw new Error(String(response.status));
          const rows = compactBox(await response.json());
          if (rows.length) done[g.id] = rows;
          return;
        } catch { await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); }
      }
    }));
    if (i % 120 === 0) { await fs.writeFile(out, JSON.stringify(done)); console.log(label, Object.keys(done).length); }
  }
  await fs.writeFile(out, JSON.stringify(done));
  console.log(label, 'done', Object.keys(done).length);
}
