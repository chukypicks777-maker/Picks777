// NBA 2025-26 and WNBA 2026 blind test: winner and handicaps against results
// and DraftKings prices kept by ESPN. Forecasts use only earlier games.
import { basketballAnalysis, normalCdf } from '../../server/services/sportProbabilityModel.js';
import { Binary, VersusCasino, americanToProbability, noVig, cachedJson, espnEventOdds, writeReport } from './common.mjs';

const pct = v => Number.isFinite(v) ? v / 100 : NaN;
// Mean margin and spread of the model's normal distribution, from two handicap lines.
function distribution(analysis) {
  const row = line => analysis.handicaps.home.find(r => r.line === line)?.probability;
  const p1 = row(1.5), p2 = row(-1.5);
  if (!Number.isFinite(p1) || !Number.isFinite(p2)) return null;
  const inverse = p => { let lo = -8, hi = 8; for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (normalCdf(mid) < p) lo = mid; else hi = mid; } return (lo + hi) / 2; };
  const z1 = inverse(Math.min(0.9999, Math.max(0.0001, p1 / 100))), z2 = inverse(Math.min(0.9999, Math.max(0.0001, p2 / 100)));
  const sd = 3 / (z1 - z2);
  return Number.isFinite(sd) && sd > 0 ? { mean: z1 * sd - 1.5, sd } : null;
}

async function events(league, months, seasonType) {
  const events = await cachedJson(`espn-${league}-${months[0]}-${months.at(-1)}`, async () => {
    const lists = await Promise.all(months.map(async m => (await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/${league}/scoreboard?dates=${m}&limit=1000`)).json()).events || []));
    return lists.flat().filter(e => e.status?.type?.completed && e.season?.type === seasonType).map(e => {
      const c = e.competitions[0], h = c.competitors.find(t => t.homeAway === 'home'), a = c.competitors.find(t => t.homeAway === 'away');
      return { id: e.id, kickoff: e.date, home: h.team.id, away: a.team.id, hs: Number(h.score), as: Number(a.score) };
    });
  });
  return [...new Map(events.map(e => [e.id, e])).values()].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
}

async function season(league, previousMonths, months, seasonType) {
  // Production keeps 13 months of results: the previous season plus the current one.
  const previous = await events(league, previousMonths, seasonType), current = await events(league, months, seasonType);
  const history = { leagueId: league, builtAt: 0, rows: [...previous, ...current].map(e => [e.id, Math.round(Date.parse(e.kickoff) / 1000), e.home, e.away, e.hs, e.as]) };
  const games = current.map(e => ({ id: e.id, sport: 'basquetbol', leagueId: league, status: 'FINISHED', kickoff: e.kickoff, homeTeam: { id: e.home }, awayTeam: { id: e.away }, finalScore: { home: e.hs, away: e.as } }));
  const evaluated = games.slice(Math.floor(games.length * 0.15)); // first weeks only warm the ratings
  const odds = await espnEventOdds('basketball', league, evaluated.map(g => g.id));
  const m = { winnerModel: new Binary(), winnerPreviousModel: new Binary(), winnerCasino: new Binary(), winnerVsCasino: new VersusCasino(), spreadAtCasinoLine: new VersusCasino(),
    homePlus55: new Binary(), homeMinus55: new Binary(), awayPlus55: new Binary() };
  for (const game of evaluated) {
    // The stored rows include later games; the ratings only use those that began 3 h before this one.
    const t = Date.parse(game.kickoff), a = basketballAnalysis({ ...game, status: 'SCHEDULED', odds: {} }, [], t, history);
    if (a.winner.home == null) continue;
    const previousModel = basketballAnalysis({ ...game, status: 'SCHEDULED', odds: {} }, games, t);
    const margin = game.finalScore.home - game.finalScore.away, homeWon = margin > 0;
    m.winnerModel.add(pct(a.winner.home), homeWon);
    if (previousModel.winner.home != null) m.winnerPreviousModel.add(pct(previousModel.winner.home), homeWon);
    const quote = odds[game.id], casino = quote ? noVig(americanToProbability(quote.home), americanToProbability(quote.away)) : null;
    if (casino !== null) { m.winnerCasino.add(casino, homeWon); m.winnerVsCasino.add(pct(a.winner.home), casino, homeWon); }
    const d = distribution(a);
    // Casino spread is quoted for the home side (negative = home gives points).
    if (d && Number.isFinite(quote?.spread) && quote.spread % 1 !== 0) {
      const casinoCover = noVig(americanToProbability(quote.homeSpreadOdds), americanToProbability(quote.awaySpreadOdds));
      if (casinoCover !== null) m.spreadAtCasinoLine.add(normalCdf((d.mean + quote.spread) / d.sd), casinoCover, margin + quote.spread > 0);
    }
    const line = value => a.handicaps.home.find(r => r.line === value)?.probability;
    m.homePlus55.add(pct(line(5.5)), margin + 5.5 > 0); m.homeMinus55.add(pct(line(-5.5)), margin - 5.5 > 0);
    m.awayPlus55.add(pct(a.handicaps.away.find(r => r.line === 5.5)?.probability), -margin + 5.5 > 0);
  }
  return { games: evaluated.length, withCasinoOdds: Object.keys(odds).length, ...Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.report()])) };
}

const report = { checkedAt: new Date().toISOString(),
  method: 'Cada pronóstico usa solo partidos anteriores de la misma competición (temporada anterior incluida, como en producción); se evalúa desde el 15% de la temporada para comparar con la versión anterior (winnerPreviousModel). Casino: DraftKings guardado por ESPN, sin margen. El hándicap se compara en la línea exacta del casino.',
  nba: await season('nba', ['202410', '202411', '202412', '202501', '202502', '202503', '202504'], ['202510', '202511', '202512', '202601', '202602', '202603', '202604'], 2),
  wnba: await season('wnba', ['202505', '202506', '202507', '202508', '202509'], ['202605', '202606', '202607', '202608', '202609'], 2) };
await writeReport('basketball', report);
console.log(JSON.stringify(report, (k, v) => k === 'calibration' ? undefined : v, 1));
