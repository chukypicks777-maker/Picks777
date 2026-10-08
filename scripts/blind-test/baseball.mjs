// MLB 2026 blind test: winner, total runs, team runs, first inning, innings 1-5
// and extra innings, against results and DraftKings prices kept by ESPN.
import { parseMlbGame } from '../../server/services/baseballDataService.js';
import { baseballAnalysis } from '../../server/services/sportProbabilityModel.js';
import { SPORT_LEAGUES } from '../../src/constants/leagues.js';
import { Binary, Multi, VersusCasino, americanToProbability, noVig, cachedJson, espnEventOdds, writeReport } from './common.mjs';

const league = SPORT_LEAGUES.beisbol.find(item => item.id === 'mlb');
const EVAL_FROM = Date.parse('2026-05-01'), EVAL_TO = Date.parse('2026-09-29');
const normalize = value => String(value || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const pct = v => Number.isFinite(v) ? v / 100 : NaN;

const schedule = await cachedJson('mlb-2026-schedule', async () => (await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=2026-03-20&endDate=2026-09-30&gameType=R&hydrate=linescore`)).json());
const games = schedule.dates.flatMap(day => day.games).map(game => parseMlbGame(game, league)).filter(Boolean)
  .filter(game => game.status === 'FINISHED').sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));

// ESPN identifiers by exact teams and start time, then the stored DraftKings odds.
const months = ['202605', '202606', '202607', '202608', '202609'];
const espnEvents = (await cachedJson('espn-mlb-2026-may-sep', async () => {
  const lists = await Promise.all(months.map(async m => (await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${m}&limit=1000`)).json()).events || []));
  return lists.flat().map(e => ({ id: e.id, date: e.date, home: e.competitions[0].competitors.find(c => c.homeAway === 'home')?.team?.displayName, away: e.competitions[0].competitors.find(c => c.homeAway === 'away')?.team?.displayName }));
}));
const espnId = game => {
  const found = espnEvents.filter(e => Math.abs(Date.parse(e.date) - Date.parse(game.kickoff)) <= 60000 && normalize(e.home) === normalize(game.homeTeam.name) && normalize(e.away) === normalize(game.awayTeam.name));
  return found.length === 1 ? found[0].id : null;
};
const evaluated = games.filter(game => Date.parse(game.kickoff) >= EVAL_FROM && Date.parse(game.kickoff) <= EVAL_TO);
const ids = evaluated.map(espnId);
const odds = await espnEventOdds('baseball', 'mlb', ids.filter(Boolean));

const m = { winnerModel: new Binary(), winnerCasino: new Binary(), winnerVsCasino: new VersusCasino(), totalAtCasinoLine: new VersusCasino(),
  total75: new Binary(), total85: new Binary(), total95: new Binary(), homeRuns35: new Binary(), awayRuns35: new Binary(),
  firstInning: new Multi(), firstFive25: new Binary(), firstFive45: new Binary(), extraInnings: new Binary() };
evaluated.forEach((game, i) => {
  const a = baseballAnalysis({ ...game, status: 'SCHEDULED', odds: {} }, games, Date.parse(game.kickoff));
  const { home, away } = game.finalScore, total = home + away;
  if (a.winner.home != null && home !== away) {
    m.winnerModel.add(pct(a.winner.home), home > away);
    const quote = odds[ids[i]];
    const casino = quote ? noVig(americanToProbability(quote.home), americanToProbability(quote.away)) : null;
    if (casino !== null) { m.winnerCasino.add(casino, home > away); m.winnerVsCasino.add(pct(a.winner.home), casino, home > away); }
    if (quote?.total && Number.isFinite(quote.total) && quote.total % 1 === 0.5) {
      const row = a.totalRuns.find(r => r.line === quote.total), casinoOver = noVig(americanToProbability(quote.over), americanToProbability(quote.under));
      if (row?.over != null && casinoOver !== null) m.totalAtCasinoLine.add(pct(row.over), casinoOver, total > quote.total);
    }
  }
  for (const [key, line] of [['total75', 7.5], ['total85', 8.5], ['total95', 9.5]]) { const row = a.totalRuns.find(r => r.line === line); if (row?.over != null) m[key].add(pct(row.over), total > line); }
  const homeRow = a.teamRuns.home.find(r => r.line === 3.5), awayRow = a.teamRuns.away.find(r => r.line === 3.5);
  if (homeRow?.over != null) m.homeRuns35.add(pct(homeRow.over), home > 3.5);
  if (awayRow?.over != null) m.awayRuns35.add(pct(awayRow.over), away > 3.5);
  const first = game.inningScores?.find(inning => inning.num === 1);
  if (a.firstInning.home != null && first && Number.isInteger(first.home) && Number.isInteger(first.away)) m.firstInning.add([a.firstInning.home, a.firstInning.draw, a.firstInning.away].map(pct), first.home > first.away ? 0 : first.home === first.away ? 1 : 2);
  const five = (game.inningScores || []).filter(inning => inning.num <= 5);
  if (five.length === 5 && five.every(inning => Number.isInteger(inning.home) && Number.isInteger(inning.away))) {
    const runs = five.reduce((s, inning) => s + inning.home + inning.away, 0);
    const f25 = a.firstFive.find(r => r.line === 2.5), f45 = a.firstFive.find(r => r.line === 4.5);
    if (f25?.over != null) m.firstFive25.add(pct(f25.over), runs > 2.5);
    if (f45?.over != null) m.firstFive45.add(pct(f45.over), runs > 4.5);
  }
  if (a.extraInnings.yes != null && Number.isInteger(game.lastInning)) m.extraInnings.add(pct(a.extraInnings.yes), game.lastInning > 9);
});
const report = { checkedAt: new Date().toISOString(), games: evaluated.length, withCasinoOdds: Object.keys(odds).length,
  method: 'MLB 2026, mayo a septiembre. Cada pronóstico usa solo partidos anteriores a su hora de inicio (MLB Stats API). Casino: DraftKings guardado por ESPN, sin margen. Totales comparados en la línea exacta publicada por el casino.',
  ...Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.report()])) };
await writeReport('baseball', report);
console.log(JSON.stringify(report, (k, v) => k === 'calibration' ? undefined : v, 1));
