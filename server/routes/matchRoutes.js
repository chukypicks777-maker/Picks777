import express from 'express';
import { getFootballFeed, LEAGUES, getLeagueStandings, enrichMatchWithRealData, listView } from '../services/footballDataService.js';
import { enrichHistoricalStats } from '../services/verifiedStats.js';
import { generateAiMatchReport, readAiMatchReport, isAiConfigured } from '../services/aiService.js';
import { consumeAiLimit, sendLimited } from '../rateLimit.js';
import { requireAdmin } from '../session.js';
const router = express.Router();
const MATCH_ID = /^espn-(?:femenil-)?\d{1,15}$/;
router.get('/leagues', async (req, res) => {
  const sport = req.query.sport === 'femenil' ? 'femenil' : 'futbol';
  const feed = await getFootballFeed({ sport });
  res.json({ success: true, leagues: sport === 'femenil' ? LEAGUES.filter(league => league.sport === sport) : LEAGUES, coverage: feed.coverage });
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
  const coverage = feed.coverage.filter(league => !req.query.league || req.query.league === 'all' || league.leagueId === req.query.league);
  if (coverage.length && coverage.every(c => c.status === 'unavailable')) {
    return res.status(503).json({ ...feed, matches: [], success: false, message: 'No se puede consultar el proveedor. No se muestran datos de demostración.' });
  }
  try {
    const matches = filterMatches(feed.matches, req.query).map(listView);
    const liveMatches = feed.matches.filter(m => m.status === 'LIVE').map(listView);
    res.json({ ...feed, success: true, matches, liveMatches, count: matches.length });
  } catch {
    res.status(400).json({ success: false, message: 'Filtros o zona horaria no válidos.' });
  }
}
router.get('/live-sync', feedHandler);
router.get('/', feedHandler);
router.post('/sync', feedHandler);

async function rankedFeed(req, res, select) {
  const feed = await getFootballFeed();
  if (feed.coverage.every(c => c.status === 'unavailable')) {
    return res.status(503).json({ ...feed, matches: [], success: false, message: 'No se puede consultar el proveedor.' });
  }
  let list = feed.matches;
  try {
    if (Object.keys(req.query || {}).length > 0) list = filterMatches(list, req.query);
  } catch {
    return res.status(400).json({ success: false, message: 'Filtros o zona horaria no válidos.' });
  }
  const matches = select(list).map(listView);
  res.json({ success: true, count: matches.length, matches, coverage: feed.coverage });
}
const probs = m => m.model?.probabilities || m.probabilities || {};
router.get('/boost', (req, res) => rankedFeed(req, res, list => list.filter(m => m.status !== 'FINISHED')
  .sort((a, b) => (probs(b).confidence ?? Math.max(probs(b).homeWin ?? 0, probs(b).awayWin ?? 0, probs(b).over15 ?? 0))
    - (probs(a).confidence ?? Math.max(probs(a).homeWin ?? 0, probs(a).awayWin ?? 0, probs(a).over15 ?? 0))).slice(0, 10)));
router.get('/goal', (req, res) => rankedFeed(req, res, list => list
  .filter(m => m.status !== 'FINISHED' && (probs(m).over25 != null || probs(m).over15 != null || probs(m).bttsYes != null))
  .sort((a, b) => ((probs(b).over15 ?? 0) + (probs(b).over25 ?? 0) + (probs(b).bttsYes ?? 0)) - ((probs(a).over15 ?? 0) + (probs(a).over25 ?? 0) + (probs(a).bttsYes ?? 0)))));
router.get('/btts', (req, res) => rankedFeed(req, res, list => list
  .filter(m => m.status !== 'FINISHED' && probs(m).bttsYes != null).sort((a, b) => (probs(b).bttsYes ?? 0) - (probs(a).bttsYes ?? 0))));

// A fixture missing from this instance's calendar may be newer than its copy.
// One forced refresh per interval: unknown IDs cannot multiply provider calls.
let lastForcedRefresh = 0;
async function findMatch(id, { allowRefresh = true } = {}) {
  const sport = id.startsWith('espn-femenil-') ? 'femenil' : 'futbol';
  let feed;
  try { feed = await getFootballFeed({ sport }); } catch { feed = { matches: [] }; }
  let match = feed.matches?.find(m => m.id === id);
  if (!match && allowRefresh && Date.now() - lastForcedRefresh > 30000) {
    lastForcedRefresh = Date.now();
    try {
      feed = await getFootballFeed({ forceRefresh: true, sport });
      match = feed.matches?.find(m => m.id === id);
    } catch (err) {
      console.warn('[matchRoutes] Error refreshing feed for match by id:', err?.message || err);
    }
  }
  return match || null;
}

// Stored AI selections for many cards in one request. Never calls a provider and
// never consumes the AI quota; missing reports are simply absent.
router.post('/ai-reports', async (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => typeof id !== 'string' || !MATCH_ID.test(id)) || new Set(ids).size !== ids.length) {
    return res.status(400).json({ success: false, message: 'Selecciona entre 1 y 100 partidos válidos.' });
  }
  if (!await isAiConfigured()) return res.json({ success: true, reports: {} });
  const feeds = await Promise.all(['futbol', 'femenil'].map(sport => getFootballFeed({ sport }).catch(() => ({ matches: [] }))));
  const byId = new Map(feeds.flatMap(feed => feed.matches).map(match => [match.id, match]));
  const reports = {};
  for (const id of ids) {
    const match = byId.get(id);
    if (!match || match.status !== 'SCHEDULED') continue;
    // League records are local; the per-match provider summary is not fetched here.
    const enriched = await enrichHistoricalStats(match, { localOnly: true }).catch(() => match);
    const report = await readAiMatchReport(enriched).catch(() => null);
    if (report?.aiAvailable) reports[id] = report;
  }
  res.json({ success: true, reports });
});

router.get('/:id', async (req, res) => {
  if (!MATCH_ID.test(req.params.id)) return res.status(400).json({ success: false, message: 'Identificador de partido inválido.' });
  try {
    const match = await findMatch(req.params.id);
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
router.post('/:id/ai-analysis', (req, res, next) => {
  if (req.query.force === '1' || req.body?.forceRefresh || req.query.model || req.body?.model || req.body?.aiConfig) return requireAdmin(req, res, next);
  next();
}, async (req, res) => {
  if (!MATCH_ID.test(req.params.id)) return res.status(400).json({ success: false, message: 'Identificador de partido inválido.' });
  const deadline = Date.now() + 50000;
  try {
    const forceRefresh = Boolean(req.query.force === '1' || req.body?.forceRefresh);
    // Fixture facts must come from the server's provider feed, never the browser.
    const match = await findMatch(req.params.id, { allowRefresh: forceRefresh });
    if (!match) return res.status(404).json({ success: false, message: 'Partido no disponible en el feed actual.' });

    let enriched = match;
    try {
      enriched = await enrichMatchWithRealData(match, { forceRefresh: false });
    } catch (err) {
      console.warn('[matchRoutes] Error enriching match data:', err?.message || err);
    }
    const model = req.body?.model || req.query?.model || undefined;
    const aiConfig = req.body?.aiConfig;
    let report = forceRefresh || model || aiConfig ? null : await readAiMatchReport(enriched).catch(() => null);
    if (!report) {
      // The AI quota is charged only when a provider request may follow.
      if (await isAiConfigured() || aiConfig) {
        let limit;
        try { limit = await consumeAiLimit(req); }
        catch { return res.set('Retry-After', '30').status(503).json({ success: false, message: 'Limitador no disponible temporalmente.' }); }
        if (!limit.allowed) return sendLimited(res, limit.retryAfter);
      }
      report = await generateAiMatchReport(enriched, { forceRefresh, model, aiConfig, deadline });
    }
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
