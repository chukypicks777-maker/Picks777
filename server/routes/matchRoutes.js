import express from 'express';
import { getFootballFeed, LEAGUES, getLeagueStandings, enrichMatchWithRealData } from '../services/footballDataService.js';
import { generateAiMatchReport } from '../services/aiService.js';
import { rateLimit } from '../rateLimit.js';
const router = express.Router();
router.get('/leagues', async (req, res) => {
  const sport = req.query.sport === 'femenil' ? 'femenil' : 'futbol';
  const feed = await getFootballFeed({ sport });
  res.json({ success: true, leagues: LEAGUES.filter(league => league.sport === sport), coverage: feed.coverage });
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
  if (req.query.sport && !['futbol', 'femenil'].includes(req.query.sport)) return res.status(400).json({ success: false, message: 'Deporte inválido.' });
  const feed = await getFootballFeed({ sport: req.query.sport || 'futbol' });
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
router.get('/boost', async (req, res) => {
  const feed = await getFootballFeed();
  if (feed.coverage.every(c => c.status === 'unavailable')) {
    return res.status(503).json({ ...feed, success: false, message: 'No se puede consultar el proveedor.' });
  }
  let list = feed.matches;
  try {
    if (Object.keys(req.query || {}).length > 0) list = filterMatches(list, req.query);
  } catch {
    return res.status(400).json({ success: false, message: 'Filtros o zona horaria no válidos.' });
  }
  const boostMatches = list
    .filter(m => m.status !== 'FINISHED')
    .sort((a, b) => {
      const pA = a.model?.probabilities || a.probabilities || {};
      const pB = b.model?.probabilities || b.probabilities || {};
      const valA = pA.confidence ?? Math.max(pA.homeWin ?? 0, pA.awayWin ?? 0, pA.over15 ?? 0);
      const valB = pB.confidence ?? Math.max(pB.homeWin ?? 0, pB.awayWin ?? 0, pB.over15 ?? 0);
      return valB - valA;
    })
    .slice(0, 10);
  res.json({ success: true, count: boostMatches.length, matches: boostMatches, coverage: feed.coverage });
});
router.get('/goal', async (req, res) => {
  const feed = await getFootballFeed();
  if (feed.coverage.every(c => c.status === 'unavailable')) {
    return res.status(503).json({ ...feed, success: false, message: 'No se puede consultar el proveedor.' });
  }
  let list = feed.matches;
  try {
    if (Object.keys(req.query || {}).length > 0) list = filterMatches(list, req.query);
  } catch {
    return res.status(400).json({ success: false, message: 'Filtros o zona horaria no válidos.' });
  }
  const goalMatches = list
    .filter(m => {
      const p = m.model?.probabilities || m.probabilities;
      return m.status !== 'FINISHED' && p && (p.over25 != null || p.over15 != null || p.bttsYes != null);
    })
    .sort((a, b) => {
      const pA = a.model?.probabilities || a.probabilities || {};
      const pB = b.model?.probabilities || b.probabilities || {};
      return (((pB.over15 ?? 0) + (pB.over25 ?? 0) + (pB.bttsYes ?? 0)) - ((pA.over15 ?? 0) + (pA.over25 ?? 0) + (pA.bttsYes ?? 0)));
    });
  res.json({ success: true, count: goalMatches.length, matches: goalMatches, coverage: feed.coverage });
});
router.get('/btts', async (req, res) => {
  const feed = await getFootballFeed();
  if (feed.coverage.every(c => c.status === 'unavailable')) {
    return res.status(503).json({ ...feed, success: false, message: 'No se puede consultar el proveedor.' });
  }
  let list = feed.matches;
  try {
    if (Object.keys(req.query || {}).length > 0) list = filterMatches(list, req.query);
  } catch {
    return res.status(400).json({ success: false, message: 'Filtros o zona horaria no válidos.' });
  }
  const bttsMatches = list
    .filter(m => {
      const p = m.model?.probabilities || m.probabilities;
      return m.status !== 'FINISHED' && p && p.bttsYes != null;
    })
    .sort((a, b) => {
      const pA = a.model?.probabilities || a.probabilities || {};
      const pB = b.model?.probabilities || b.probabilities || {};
      return (pB.bttsYes ?? 0) - (pA.bttsYes ?? 0);
    });
  res.json({ success: true, count: bttsMatches.length, matches: bttsMatches, coverage: feed.coverage });
});
router.get('/:id', async (req, res) => {
  try {
    const sport = req.params.id.startsWith('espn-femenil-') ? 'femenil' : 'futbol';
    let feed;
    try {
      feed = await getFootballFeed({ sport });
    } catch {
      feed = { matches: [] };
    }
    let match = feed.matches?.find(m => m.id === req.params.id);
    if (!match) {
      try {
        feed = await getFootballFeed({ forceRefresh: true, sport });
        match = feed.matches?.find(m => m.id === req.params.id);
      } catch (err) {
        console.warn('[matchRoutes] Error refreshing feed for match by id:', err?.message || err);
      }
    }
    if (!match) return res.status(404).json({ success: false, message: 'Partido no disponible en el feed actual.' });
    let enriched = match;
    try {
      enriched = await enrichMatchWithRealData(match);
    } catch (err) {
      console.warn('[matchRoutes] Error enriching match in GET /:id:', err?.message || err);
    }
    res.json({ success: true, match: enriched });
  } catch (error) {
    console.error('[matchRoutes] Error in GET /:id:', error.message);
    res.status(500).json({ success: false, message: 'Error consultando detalles del partido.' });
  }
});
router.post('/:id/ai-analysis', rateLimit('ai'), async (req, res) => {
  const deadline = Date.now() + 50000;
  try {
    const sport = req.params.id.startsWith('espn-femenil-') ? 'femenil' : 'futbol';
    const forceRefresh = Boolean(req.query.force === '1' || req.body?.forceRefresh);
    let feed;
    try {
      feed = await getFootballFeed({ sport });
    } catch {
      feed = { matches: [] };
    }
    let match = feed.matches?.find(m => m.id === req.params.id);
    // Fixture facts must come from the server's provider feed, never the browser.
    if (!match && forceRefresh) {
      try {
        feed = await getFootballFeed({ forceRefresh: true, sport });
        match = feed.matches?.find(m => m.id === req.params.id);
      } catch (err) {
        console.warn('[matchRoutes] Error refreshing football feed:', err?.message || err);
      }
    }
    if (!match) return res.status(404).json({ success: false, message: 'Partido no disponible en el feed actual.' });

    let enriched = match;
    try {
      enriched = await enrichMatchWithRealData(match, { forceRefresh: false });
    } catch (err) {
      console.warn('[matchRoutes] Error enriching match data:', err?.message || err);
    }
    const model = req.body?.model || req.query?.model || undefined;
    const aiConfig = req.body?.aiConfig;
    const report = await generateAiMatchReport(enriched, { forceRefresh, model, aiConfig, deadline });
    if (report?.topPick && report.aiAvailable) {
      enriched.aiPick = {
        ...enriched.aiPick,
        selection: report.topPick.selection,
        market: report.topPick.market || enriched.aiPick?.market,
        probability: report.topPick.probability || enriched.aiPick?.probability,
        confidence: `${report.topPick.probability || enriched.aiPick?.probability}%`,
        odds: report.topPick.odds ?? enriched.aiPick?.odds,
        summaryRationale: report.topPick.rationale || report.analysisSections?.verdict || enriched.aiPick?.summaryRationale
      };
    }
    enriched.isAiAnalyzed = Boolean(report?.aiAvailable);
    enriched.aiReport = report;
    res.json({ success: true, match: enriched, report });
  } catch (error) {
    console.error('[matchRoutes] Error in ai-analysis:', error.message);
    res.status(500).json({ success: false, message: 'Error procesando análisis de IA.' });
  }
});
export default router;
