import express from 'express';
import { SPORT_LEAGUES } from '../../src/constants/leagues.js';
import { getSportsFeed, getSportsMatch, getSportsBankerCandidates } from '../services/sportsDataService.js';
import { filterMatches } from './matchRoutes.js';
import { generateAiSportsReport } from '../services/sportsAiService.js';
import { rankSportWinners } from '../../src/utils/sportPicks.js';
import { requireAdmin } from '../session.js';
import { rateLimit } from '../rateLimit.js';

const router = express.Router();
function leagueOptions(sport, value) {
  if (!value || value === 'all') return {};
  if (typeof value !== 'string' || !SPORT_LEAGUES[sport].some(league => league.id === value)) throw new Error('Liga no válida.');
  return { leagueId: value };
}
router.post('/:sport/:id/ai-analysis', (req, res, next) => {
  if (req.query.force === '1' || req.body?.forceRefresh === true || req.body?.model || req.body?.aiConfig) return requireAdmin(req, res, next);
  next();
}, rateLimit('ai'), async (req, res) => {
  if (!Object.hasOwn(SPORT_LEAGUES, req.params.sport)) return res.status(400).json({ success: false, message: 'Deporte no válido.' });
  const deadline = Date.now() + 50000;
  let options;
  try { options = leagueOptions(req.params.sport, req.query.league); } catch { return res.status(400).json({ success: false, message: 'Liga no válida.' }); }
  const forceRefresh = req.query.force === '1' || req.body?.forceRefresh === true;
  const match = await getSportsMatch(req.params.sport, req.params.id, { ...options, forceRefresh });
  if (!match) return res.status(404).json({ success: false, message: 'El encuentro no está disponible en el calendario actual.' });
  const report = await generateAiSportsReport(match, { forceRefresh, deadline, model: req.body?.model, aiConfig: req.body?.aiConfig });
  res.json({ success: true, match: { ...match, aiReport: report, isAiAnalyzed: Boolean(report.aiAvailable) }, report });
});
router.get('/:sport/:id', async (req, res) => {
  if (!Object.hasOwn(SPORT_LEAGUES, req.params.sport)) return res.status(400).json({ success: false, message: 'Deporte no válido.' });
  let options;
  try { options = leagueOptions(req.params.sport, req.query.league); } catch { return res.status(400).json({ success: false, message: 'Liga no válida.' }); }
  const match = await getSportsMatch(req.params.sport, req.params.id, options);
  if (!match) return res.status(404).json({ success: false, message: 'El encuentro no está disponible en el calendario actual.' });
  res.json({ success: true, match });
});
router.get('/:sport', async (req, res) => {
  if (!Object.hasOwn(SPORT_LEAGUES, req.params.sport)) return res.status(400).json({ success: false, message: 'Deporte no válido.' });
  let matches;
  try { filterMatches([], req.query); } catch { return res.status(400).json({ success: false, message: 'Filtros o zona horaria no válidos.' }); }
  let options;
  try { options = leagueOptions(req.params.sport, req.query.league); } catch { return res.status(400).json({ success: false, message: 'Liga no válida.' }); }
  if (req.query.category && req.query.category !== 'bankers') return res.status(400).json({ success: false, message: 'Categoría no válida.' });
  if (req.query.category === 'bankers') {
    try {
      const pool = await getSportsBankerCandidates(req.params.sport, options);
      const matches = rankSportWinners(filterMatches(pool.matches, req.query));
      return res.json({ ...pool, success: true, matches, count: matches.length, category: 'bankers' });
    } catch (error) { return res.status(503).json({ success: false, matches: [], message: error.message || 'No se pudo consultar el ranking de Banqueros.' }); }
  }
  const feed = await getSportsFeed(req.params.sport, { ...options, calendarOnly: true });
  if (feed.coverage.every(league => league.status === 'unavailable')) return res.status(503).json({ ...feed, success: false, message: 'No se pudieron consultar los calendarios oficiales. Reintenta en unos minutos.' });
  matches = filterMatches(feed.matches, req.query);
  res.json({ ...feed, success: true, matches, count: matches.length });
});
export default router;
