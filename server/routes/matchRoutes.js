import express from 'express';
import { getFootballFeed, LEAGUES, getLeagueStandings, enrichMatchWithRealData } from '../services/footballDataService.js';
import { generateAiMatchReport } from '../services/aiService.js';
import { rateLimit } from '../rateLimit.js';
const router = express.Router();
router.get('/leagues', async (req, res) => {
  const feed = await getFootballFeed();
  res.json({ success: true, leagues: LEAGUES, coverage: feed.coverage });
});
router.get('/standings', async (req, res) => {
  try {
    const result = await getLeagueStandings(req.query.league);
    res.json({ success: true, standings: result.rows, ...result, source: 'ESPN' });
  } catch {
    res.status(503).json({ success: false, message: 'Clasificación no disponible para esta liga.' });
  }
});
function dayInZone(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function filterMatches(matches, query, now = new Date()) {
  const { league, timeframe, status, search, timezone = 'UTC' } = query;
  if (Object.values(query).some(value => typeof value !== 'string')) throw new Error('Filtros inválidos.');
  if (timeframe && !['all', 'today', 'tomorrow'].includes(timeframe)) throw new Error('Fecha inválida.');
  // Validate the IANA zone even when no date filter is set.
  const today = dayInZone(now, timezone);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(now);
  const value = key => Number(parts.find(p => p.type === key).value);
  const tomorrow = dayInZone(new Date(Date.UTC(value('year'), value('month') - 1, value('day') + 1, 12)), 'UTC');
  return matches.filter(m => (!league || league === 'all' || m.leagueId === league) &&
    (!status || status === 'all' || m.status === status) &&
    (!timeframe || timeframe === 'all' || dayInZone(new Date(m.kickoff), timezone) === (timeframe === 'today' ? today : tomorrow)) &&
    (!search || `${m.homeTeam.name} ${m.awayTeam.name} ${m.leagueName} ${m.venue || ''}`.toLowerCase().includes(String(search).trim().toLowerCase())));
}
async function feedHandler(req, res) {
  const feed = await getFootballFeed();
  if (feed.coverage.every(c => c.status === 'unavailable')) {
    return res.status(503).json({ ...feed, success: false, message: 'No se puede consultar el proveedor. No se muestran datos de demostración.' });
  }
  try {
    const matches = filterMatches(feed.matches, req.query);
    const liveMatches = feed.matches.filter(m => m.status === 'LIVE');
    res.json({ ...feed, success: true, matches, liveMatches, count: matches.length });
  } catch {
    res.status(400).json({ success: false, message: 'Filtros o zona horaria no válidos.' });
  }
}
router.get('/live-sync', feedHandler);
router.get('/', feedHandler);
router.post('/sync', feedHandler);
router.get('/:id', async (req, res) => {
  const feed = await getFootballFeed();
  const match = feed.matches.find(m => m.id === req.params.id);
  if (!match) return res.status(404).json({ success: false, message: 'Partido no disponible en el feed actual.' });
  res.json({ success: true, match: await enrichMatchWithRealData(match) });
});
router.post('/:id/ai-analysis', rateLimit('ai'), async (req, res) => {
  const feed = await getFootballFeed();
  const match = feed.matches.find(m => m.id === req.params.id);
  if (!match) return res.status(404).json({ success: false, message: 'Partido no disponible en el feed actual.' });
  const enriched = await enrichMatchWithRealData(match);
  const forceRefresh = Boolean(req.query.force === '1' || req.body?.forceRefresh);
  res.json({ success: true, report: await generateAiMatchReport(enriched, { forceRefresh }) });
});
export default router;
