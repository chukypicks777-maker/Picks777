// Model winner vs the published price (no-vig) for every scheduled tennis and
// basketball fixture, to see where the own percentage disagrees with the market.
//   node --import ./tests/setup.js scripts/compare-market.mjs [out.json]
import fs from 'node:fs/promises';
process.env.KALSHI_TENNIS_ODDS = 'on';
process.env.NBA_AVAILABILITY = 'on';
const { getSportsFeed, getSportsDetails } = await import('../server/services/sportsDataService.js');
const { marketWinner } = await import('../server/services/sportProbabilityModel.js');
const { loadBasketballHistory } = await import('../server/services/basketballHistory.js');
for (const league of ['nba', 'wnba']) for (let i = 0; i < 40 && !(await loadBasketballHistory(league)); i++) await new Promise(r => setTimeout(r, 3000));

const rows = [];
for (const sport of ['tenis', 'basquetbol']) {
  const feed = await getSportsFeed(sport, { calendarOnly: true });
  const scheduled = feed.matches.filter(m => m.status === 'SCHEDULED');
  for (let i = 0; i < scheduled.length; i += 12) for (const m of (await getSportsDetails(sport, scheduled.slice(i, i + 12).map(m => m.id), {})).matches) {
    const market = marketWinner(m.odds), model = m.analysis?.winner?.home;
    rows.push({ sport, league: m.leagueId || m.tour, tournament: m.tournamentName, kickoff: m.kickoff, home: m.homeTeam?.name, away: m.awayTeam?.name,
      model: model ?? null, market: market === null ? null : Math.round(market * 1000) / 10, gap: market === null || model == null ? null : Math.round((model - market * 100) * 10) / 10,
      odds: m.odds ? { home: m.odds.homeWin, away: m.odds.awayWin, source: m.odds.source || m.odds.provider } : null, method: m.analysis?.method?.slice(0, 80) });
  }
}
const priced = rows.filter(r => r.gap !== null);
const summary = s => { const v = priced.filter(r => r.sport === s); return { fixtures: rows.filter(r => r.sport === s).length, priced: v.length,
  meanAbsGap: v.length ? +(v.reduce((a, r) => a + Math.abs(r.gap), 0) / v.length).toFixed(1) : null,
  over10: v.filter(r => Math.abs(r.gap) > 10).length, over20: v.filter(r => Math.abs(r.gap) > 20).length,
  oppositeFavourite: v.filter(r => (r.model - 50) * (r.market - 50) < 0).length }; };
if (process.argv[2]) await fs.writeFile(process.argv[2], JSON.stringify(rows, null, 1));
console.log(JSON.stringify({ tenis: summary('tenis'), basquetbol: summary('basquetbol'),
  worst: priced.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)).slice(0, 25).map(r => `${r.sport} ${r.league} ${r.home} vs ${r.away}: modelo ${r.model} / mercado ${r.market} (${r.gap})`) }, null, 1));
process.exit(0);
