import fs from 'node:fs/promises';
import path from 'node:path';

// football-data.co.uk publishes free historical results, match statistics and
// bookmaker prices. Files are cached locally; nothing here touches app storage.
export const LEAGUES = { E0: 'Premier League', SP1: 'LaLiga', I1: 'Serie A', F1: 'Ligue 1', D1: 'Bundesliga' };
export const SEASONS = ['2122', '2223', '2324', '2425', '2526', '2627'];
const CACHE = path.resolve('artifacts/backtest-cache');

export function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(line => line.trim());
  const header = lines.shift().split(',').map(value => value.trim());
  return lines.map(line => {
    const cells = line.split(',');
    return Object.fromEntries(header.map((key, i) => [key, cells[i]?.trim() ?? '']));
  });
}

const number = value => value === '' || value == null ? null : Number.isFinite(Number(value)) ? Number(value) : null;
function time(date, clock) {
  const [d, m, y] = date.split('/').map(Number);
  const year = y < 100 ? 2000 + y : y;
  const [hh, mm] = /^\d{1,2}:\d{2}$/.test(clock || '') ? clock.split(':').map(Number) : [15, 0];
  return Date.UTC(year, m - 1, d, hh, mm);
}

async function download(file, url) {
  const target = path.join(CACHE, file);
  try { const text = await fs.readFile(target, 'utf8'); if (text.length > 100) return text; } catch {}
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const text = await response.text();
  await fs.mkdir(CACHE, { recursive: true });
  await fs.writeFile(target, text);
  return text;
}

export async function loadLeague(code) {
  const games = [];
  for (const season of SEASONS) {
    let text;
    try { text = await download(`${code}-${season}.csv`, `https://www.football-data.co.uk/mmz4281/${season}/${code}.csv`); }
    catch { continue; }
    for (const row of parseCsv(text)) {
      const hg = number(row.FTHG), ag = number(row.FTAG);
      if (!row.HomeTeam || !row.AwayTeam || !Number.isInteger(hg) || !Number.isInteger(ag) || !row.Date) continue;
      games.push({ league: code, season, time: time(row.Date, row.Time), home: row.HomeTeam, away: row.AwayTeam, hg, ag,
        hthg: number(row.HTHG), htag: number(row.HTAG), hs: number(row.HS), as: number(row.AS), hst: number(row.HST), ast: number(row.AST), hc: number(row.HC), ac: number(row.AC), hy: number(row.HY), ay: number(row.AY),
        avg: { homeWin: number(row.AvgH), draw: number(row.AvgD), awayWin: number(row.AvgA), over25: number(row['Avg>2.5']), under25: number(row['Avg<2.5']) },
        b365: { homeWin: number(row.B365H), draw: number(row.B365D), awayWin: number(row.B365A), over25: number(row['B365>2.5']), under25: number(row['B365<2.5']) },
        // Pinnacle closing when published, otherwise the market-average closing price.
        close: number(row.PSCH) ? { homeWin: number(row.PSCH), draw: number(row.PSCD), awayWin: number(row.PSCA), over25: number(row['PC>2.5']) ?? number(row['AvgC>2.5']), under25: number(row['PC<2.5']) ?? number(row['AvgC<2.5']) }
          : { homeWin: number(row.AvgCH), draw: number(row.AvgCD), awayWin: number(row.AvgCA), over25: number(row['AvgC>2.5']), under25: number(row['AvgC<2.5']) } });
    }
  }
  return games.sort((a, b) => a.time - b.time);
}
