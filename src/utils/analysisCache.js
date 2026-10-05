/**
 * analysisCache.js
 * Sistema inteligente de caché en cliente para análisis tácticos y reportes de IA.
 * Conserva informes brevemente y los invalida al cambiar hechos o estadísticas.
 * Invalida automáticamente solo cuando cambian los hechos deportivos reales (marcador en vivo,
 * estado, minuto o modelo) o si el usuario solicita regeneración manual vía "Reintentar / Regenerar con IA".
 */

const memoryCache = new Map();
const STORAGE_PREFIX = 'picks777_ai_cache_v8';
const SESSION_STORAGE_KEY = 'picks777_analysis_cache_v5';

function getStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {}
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage;
    }
  } catch {}
  return null;
}

export function getMatchCacheTtlMs(matchOrStatus, aiReport) {
  // Si el reporte es baseline no-IA (falló o no había clave), expirar en 1 minuto para reintentar
  if (aiReport && aiReport.aiAvailable === false) {
    return 60 * 1000;
  }
  const match = typeof matchOrStatus === 'object' ? matchOrStatus : null;
  const status = typeof matchOrStatus === 'string' ? matchOrStatus : matchOrStatus?.status;
  if (status === 'FINISHED') {
    return 3600 * 1000;
  }
  if (status === 'LIVE') {
    return 30 * 1000;
  }
  // Una hora de inicio pasada exige la misma caducidad que un partido en vivo.
  if (status === 'SCHEDULED' && match?.kickoff) {
    const kTime = new Date(match.kickoff).getTime();
    if (Number.isFinite(kTime) && Date.now() > kTime) {
      return 30 * 1000;
    }
  }
  return 5 * 60 * 1000;
}

/**
 * Genera una huella digital (fingerprint) del partido basada en hechos deportivos reales:
 * ID, estado (SCHEDULED, LIVE, FINISHED), goles en vivo/finales y probabilidades principales.
 * No incluye marcas de tiempo de sondeo (como fetchedAt o lastUpdated) para evitar que el
 * sondeo pasivo en segundo plano invalide la caché del análisis del usuario.
 */
export function computeMatchFingerprint(m) {
  if (!m) return '';
  const p = m.probabilities || m.model?.probabilities || {};
  return [
    m.id || '',
    m.status || '',
    m.kickoff || '',
    m.liveMinute || m.minute || '',
    m.liveScore?.home ?? '',
    m.liveScore?.away ?? '',
    m.finalScore?.home ?? '',
    m.finalScore?.away ?? '',
    JSON.stringify(Object.entries(p).filter(([, v]) => typeof v === 'number' || v === null).sort(([a], [b]) => a.localeCompare(b))),
    JSON.stringify(Object.entries(m.odds || {}).sort(([a], [b]) => a.localeCompare(b))),
    m.oddsProvider || '',
    m.homeTeam?.id || m.homeTeam?.name || '',
    m.awayTeam?.id || m.awayTeam?.name || '',
    JSON.stringify([m.homeTeam, m.awayTeam].map(team => [team?.position, team?.points, team?.gamesPlayed, team?.goalsFor, team?.goalsAgainst, team?.form]))
  ].join('|');
}

/**
 * Obtiene el análisis en caché si existe y la huella deportiva coincide.
 */
export function getCachedAnalysis(matchId, currentMatch, requestedModel = null, isAiConfigured = false) {
  if (!matchId) return null;
  const currentFingerprint = computeMatchFingerprint(currentMatch);

  // 1. Memoria primero (más rápido)
  let entry = memoryCache.get(matchId);

  // 2. Si no está en memoria, consultar almacenamiento persistente (localStorage / sessionStorage)
  if (!entry) {
    const storage = getStorage();
    if (storage) {
      try {
        const raw = storage.getItem(`${STORAGE_PREFIX}_${matchId}`);
        if (raw) {
          entry = JSON.parse(raw);
          memoryCache.set(matchId, entry);
        }
      } catch {}
    }
  }

  if (!entry) return null;

  // Aplicar caducidad breve según el estado del partido.
  const ttl = getMatchCacheTtlMs(currentMatch || entry.matchStatus, entry.aiReport);
  if (!entry.timestamp || Date.now() - entry.timestamp > ttl) {
    removeCachedAnalysis(matchId);
    return null;
  }

  // Verificar si el partido cambió deportivamente (cambio de estado o cambio en marcador de partido en vivo)
  if (currentFingerprint && entry.fingerprint !== currentFingerprint) {
    removeCachedAnalysis(matchId);
    return null;
  }

  // Si se solicita un modelo específico y el análisis en caché fue generado con otro modelo, invalidar
  if (requestedModel && entry.model && entry.model !== requestedModel) {
    removeCachedAnalysis(matchId);
    return null;
  }

  // Si la IA está activa pero el reporte en caché es un baseline no-IA, invalidar para consultar la IA
  if (isAiConfigured && entry.aiReport && entry.aiReport.aiAvailable === false) {
    removeCachedAnalysis(matchId);
    return null;
  }

  return entry;
}

// The current provider response always owns scores, odds, model and timestamps.
export function mergeFreshMatch(currentMatch) {
  const cached = getCachedAnalysis(currentMatch?.id, currentMatch);
  if (!cached?.aiReport?.aiAvailable) return { ...currentMatch, isAiAnalyzed: false, aiReport: null };
  const historicalFields = ['avgCorners', 'avgCornersConceded', 'avgYellowCards', 'avgFouls', 'cleanSheetRate', 'bttsRate', 'sampleSizes', 'statsSource', 'statsFetchedAt', 'statsRecords'];
  const mergeTeam = side => {
    const old = cached.enrichedMatch?.[side] || {};
    return { ...currentMatch[side], ...Object.fromEntries(historicalFields.filter(key => old[key] !== undefined).map(key => [key, old[key]])) };
  };
  return { ...cached.enrichedMatch, ...currentMatch, homeTeam: mergeTeam('homeTeam'), awayTeam: mergeTeam('awayTeam'),
    h2h: cached.enrichedMatch?.h2h || currentMatch.h2h, recentMatches: cached.enrichedMatch?.recentMatches || currentMatch.recentMatches,
    isAiAnalyzed: true, aiReport: cached.aiReport };
}

/**
 * Guarda en caché el reporte y los datos enriquecidos del partido.
 * Si se actualiza solo uno de los dos campos, fusiona con el valor existente para evitar borrar datos.
 */
export function setCachedAnalysis(matchId, currentMatch, { aiReport, enrichedMatch, model = null }) {
  if (!matchId) return;
  const existing = getCachedAnalysis(matchId, currentMatch);
  const fingerprint = computeMatchFingerprint(currentMatch);
  const curLiveScore = currentMatch?.liveScore || enrichedMatch?.liveScore || existing?.liveScore || null;
  const curFinalScore = currentMatch?.finalScore || enrichedMatch?.finalScore || existing?.finalScore || null;
  const entry = {
    matchId,
    matchStatus: currentMatch?.status || existing?.matchStatus || 'SCHEDULED',
    liveScore: curLiveScore ? { home: curLiveScore.home ?? null, away: curLiveScore.away ?? null } : null,
    finalScore: curFinalScore ? { home: curFinalScore.home ?? null, away: curFinalScore.away ?? null } : null,
    fingerprint,
    aiReport: aiReport !== undefined ? aiReport : (existing?.aiReport || null),
    enrichedMatch: enrichedMatch !== undefined ? enrichedMatch : (existing?.enrichedMatch || null),
    model: model || aiReport?.modelUsed || existing?.model || null,
    timestamp: Date.now()
  };

  // Evict oldest entries if in-memory cache exceeds 150 items
  if (memoryCache.size > 150) {
    const oldestKey = memoryCache.keys().next().value;
    memoryCache.delete(oldestKey);
  }

  memoryCache.set(matchId, entry);

  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(`${STORAGE_PREFIX}_${matchId}`, JSON.stringify(entry));
    } catch {
      // Si la cuota está llena, purgar entradas antiguas y reintentar
      try {
        const keys = Object.keys(storage);
        let purged = 0;
        for (const k of keys) {
          if (k.startsWith(STORAGE_PREFIX) || k.startsWith(SESSION_STORAGE_KEY)) {
            storage.removeItem(k);
            purged++;
            if (purged >= 20) break;
          }
        }
        storage.setItem(`${STORAGE_PREFIX}_${matchId}`, JSON.stringify(entry));
      } catch {}
    }
  }
}

/**
 * Elimina la caché de un partido específico.
 */
export function removeCachedAnalysis(matchId) {
  if (!matchId) return;
  memoryCache.delete(matchId);
  try {
    if (typeof window !== 'undefined') {
      window.localStorage?.removeItem(`${STORAGE_PREFIX}_${matchId}`);
      window.localStorage?.removeItem(`${SESSION_STORAGE_KEY}_${matchId}`);
      window.sessionStorage?.removeItem(`${STORAGE_PREFIX}_${matchId}`);
      window.sessionStorage?.removeItem(`${SESSION_STORAGE_KEY}_${matchId}`);
    }
  } catch {}
}

/**
 * Limpia toda la caché de análisis (por ejemplo, si se cambia de modelo en el Admin).
 */
export function clearAllAnalysisCache() {
  memoryCache.clear();
  try {
    if (typeof window !== 'undefined') {
      for (const storage of [window.localStorage, window.sessionStorage]) {
        if (!storage) continue;
        const keys = Object.keys(storage);
        for (const k of keys) {
          if (k.startsWith(STORAGE_PREFIX) || k.startsWith(SESSION_STORAGE_KEY)) {
            storage.removeItem(k);
          }
        }
      }
    }
  } catch {}
}

/**
 * Comprueba de forma sincrónica y rápida si un partido ya cuenta con análisis IA completo en caché.
 */
export function isMatchAnalyzed(matchId, currentMatch) {
  if (!matchId) return false;
  if (currentMatch?.isAiAnalyzed === true && currentMatch?.aiReport?.aiAvailable === true) {
    return true;
  }
  const cached = getCachedAnalysis(matchId, currentMatch);
  return Boolean(cached?.aiReport && cached.aiReport.aiAvailable === true);
}

/**
 * Retorna el nombre del modelo de IA con el que se generó el análisis en caché.
 */
export function getAnalyzedModelName(matchId, currentMatch) {
  if (!matchId) return null;
  if (currentMatch?.aiReport?.modelUsed) {
    return currentMatch.aiReport.modelUsed;
  }
  const cached = getCachedAnalysis(matchId, currentMatch);
  return cached?.aiReport?.modelUsed || cached?.model || null;
}

/**
 * Procesa una lista de partidos y resume el estado del análisis autónomo.
 */
export function getBatchAnalyzedStatus(matches = []) {
  if (!Array.isArray(matches) || matches.length === 0) {
    return { analyzedCount: 0, totalCount: 0, pendingCount: 0, isAllAnalyzed: false, analyzedMap: {} };
  }
  const analyzedMap = {};
  let analyzedCount = 0;
  for (const m of matches) {
    if (!m?.id) continue;
    const isAnalyzed = isMatchAnalyzed(m.id, m);
    analyzedMap[m.id] = {
      isAnalyzed,
      modelUsed: isAnalyzed ? getAnalyzedModelName(m.id, m) : null
    };
    if (isAnalyzed) analyzedCount++;
  }
  return {
    analyzedCount,
    totalCount: matches.length,
    pendingCount: matches.length - analyzedCount,
    isAllAnalyzed: matches.length > 0 && analyzedCount === matches.length,
    analyzedMap
  };
}
