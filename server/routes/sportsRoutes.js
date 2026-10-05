import express from 'express';
import { SPORT_LEAGUES } from '../../src/constants/leagues.js';
import { getSportsFeed, getSportsMatch } from '../services/sportsDataService.js';
import { filterMatches } from './matchRoutes.js';

const router = express.Router();
router.get('/:sport/:id', async (req, res) => {
  if (!Object.hasOwn(SPORT_LEAGUES, req.params.sport)) return res.status(400).json({ success: false, message: 'Deporte no válido.' });
  const match = await getSportsMatch(req.params.sport, req.params.id);
  if (!match) return res.status(404).json({ success: false, message: 'El encuentro no está disponible en el calendario actual.' });
  res.json({ success: true, match });
});
router.get('/:sport', async (req, res) => {
  if (!Object.hasOwn(SPORT_LEAGUES, req.params.sport)) return res.status(400).json({ success: false, message: 'Deporte no válido.' });
  let matches;
  try { filterMatches([], req.query); } catch { return res.status(400).json({ success: false, message: 'Filtros o zona horaria no válidos.' }); }
  const feed = await getSportsFeed(req.params.sport);
  if (feed.coverage.every(league => league.status === 'unavailable')) return res.status(503).json({ ...feed, success: false, message: 'No se pudieron consultar los calendarios oficiales. Reintenta en unos minutos.' });
  matches = filterMatches(feed.matches, req.query);
  res.json({ ...feed, success: true, matches, count: matches.length });
});
export default router;
