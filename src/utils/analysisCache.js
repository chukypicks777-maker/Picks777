/**
 * analysisCache.js
 * Sistema inteligente de caché en cliente para análisis tácticos y reportes de IA.
 * Almacena en localStorage de forma duradera (48 horas para partidos programados)
 * para evitar que los datos se borren al cerrar pestañas, recargar o si nadie entra.
 * Invalida automáticamente solo cuando cambian los hechos deportivos reales (marcador en vivo,
 * estado, minuto o modelo) o si el usuario solicita regeneración manual vía "Reintentar / Regenerar con IA".
 */

const memoryCache = new Map();
const STORAGE_PREFIX = 'picks777_ai_cache_v3';
const SESSION_STORAGE_KEY = 'picks777_analysis_cache_v2';

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
    return 7 * 24 * 3600 * 1000; // 7 días para partidos finalizados
  }
  if (status === 'LIVE') {
    return 2 * 60 * 1000; // 2 minutos para partidos en juego (marcador cambiante)
  }
  // Si el partido figura como SCHEDULED pero la hora de kickoff ya pasó, no mantener análisis pre-partido por 48h
  if (status === 'SCHEDULED' && match?.kickoff) {
    const kTime = new Date(match.kickoff).getTime();
    if (Number.isFinite(kTime) && Date.now() > kTime) {
      return 2 * 60 * 1000;
    }
  }
  // Partidos programados futuros (SCHEDULED): 48 horas de persistencia duradera
  return 48 * 3600 * 1000;
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
    m.liveScore?.home ?? '',
    m.liveScore?.away ?? '',
    m.finalScore?.home ?? '',
    m.finalScore?.away ?? '',
    p.homeWin != null ? Math.round(Number(p.homeWin)) : '',
    p.draw != null ? Math.round(Number(p.draw)) : '',
    p.awayWin != null ? Math.round(Number(p.awayWin)) : '',
    p.over25 != null ? Math.round(Number(p.over25)) : '',
    p.bttsYes != null ? Math.round(Number(p.bttsYes)) : '',
    m.homeTeam?.id || m.homeTeam?.name || '',
    m.awayTeam?.id || m.awayTeam?.name || ''
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
        let raw = storage.getItem(`${STORAGE_PREFIX}_${matchId}`);
        if (!raw) {
          raw = storage.getItem(`${SESSION_STORAGE_KEY}_${matchId}`);
        }
        if (raw) {
          entry = JSON.parse(raw);
          memoryCache.set(matchId, entry);
        }
      } catch {}
    }
  }

  if (!entry) return null;

  // Comprobar TTL dinámico según el estado del partido (48h para SCHEDULED, 7d para FINISHED)
  const ttl = getMatchCacheTtlMs(currentMatch || entry.matchStatus, entry.aiReport);
  if (!entry.timestamp || Date.now() - entry.timestamp > ttl) {
    removeCachedAnalysis(matchId);
    return null;
  }

  // Verificar si el partido cambió (estado, goles o probabilidades principales)
  if (currentFingerprint && entry.fingerprint && entry.fingerprint !== currentFingerprint) {
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

/**
 * Guarda en caché el reporte y los datos enriquecidos del partido.
 * Si se actualiza solo uno de los dos campos, fusiona con el valor existente para evitar borrar datos.
 */
export function setCachedAnalysis(matchId, currentMatch, { aiReport, enrichedMatch, model = null }) {
  if (!matchId) return;
  const existing = getCachedAnalysis(matchId, currentMatch);
  const fingerprint = computeMatchFingerprint(currentMatch);
  const entry = {
    matchId,
    matchStatus: currentMatch?.status || existing?.matchStatus || 'SCHEDULED',
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

