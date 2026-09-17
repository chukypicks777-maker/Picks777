/**
 * analysisCache.js
 * Sistema inteligente de caché en cliente para análisis tácticos y reportes de IA.
 * Evita recargas innecesarias cuando el usuario abre y cierra partidos,
 * invalidando automáticamente solo si el partido cambia (marcador, estado, minuto)
 * o si el usuario solicita regeneración manual vía "Reintentar / Regenerar con IA".
 */

const memoryCache = new Map();
const SESSION_STORAGE_KEY = 'picks777_analysis_cache_v1';

function getStorage() {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage;
    }
  } catch {}
  return null;
}

/**
 * Genera una huella digital (fingerprint) del partido basada en hechos deportivos reales:
 * ID, estado (SCHEDULED, LIVE, FINISHED), goles en vivo/finales y probabilidades principales.
 * No incluye marcas de tiempo de sondeo (como fetchedAt o lastUpdated) para evitar que el
 * sondeo pasivo en segundo plano invalide la caché del análisis del usuario.
 */
export function computeMatchFingerprint(m) {
  if (!m) return '';
  return [
    m.id || '',
    m.status || '',
    m.liveScore?.home ?? '',
    m.liveScore?.away ?? '',
    m.finalScore?.home ?? '',
    m.finalScore?.away ?? '',
    m.probabilities?.homeWin != null ? Math.round(Number(m.probabilities.homeWin)) : '',
    m.probabilities?.awayWin != null ? Math.round(Number(m.probabilities.awayWin)) : ''
  ].join('|');
}

/**
 * Obtiene el análisis en caché si existe y la huella deportiva coincide.
 */
export function getCachedAnalysis(matchId, currentMatch) {
  if (!matchId) return null;
  const currentFingerprint = computeMatchFingerprint(currentMatch);

  // 1. Memoria primero (más rápido)
  let entry = memoryCache.get(matchId);

  // 2. Si no está en memoria, consultar sessionStorage
  if (!entry) {
    const storage = getStorage();
    if (storage) {
      try {
        const raw = storage.getItem(`${SESSION_STORAGE_KEY}_${matchId}`);
        if (raw) {
          entry = JSON.parse(raw);
          memoryCache.set(matchId, entry);
        }
      } catch {}
    }
  }

  if (!entry) return null;

  // Verificar si el partido cambió (estado, goles o probabilidades principales)
  if (currentFingerprint && entry.fingerprint && entry.fingerprint !== currentFingerprint) {
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
    fingerprint,
    aiReport: aiReport !== undefined ? aiReport : (existing?.aiReport || null),
    enrichedMatch: enrichedMatch !== undefined ? enrichedMatch : (existing?.enrichedMatch || null),
    model: model || aiReport?.modelUsed || existing?.model || null,
    timestamp: Date.now()
  };

  // Evict oldest entries if in-memory cache exceeds 100 items
  if (memoryCache.size > 100) {
    const oldestKey = memoryCache.keys().next().value;
    memoryCache.delete(oldestKey);
  }

  memoryCache.set(matchId, entry);

  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(`${SESSION_STORAGE_KEY}_${matchId}`, JSON.stringify(entry));
    } catch {}
  }
}

/**
 * Elimina la caché de un partido específico.
 */
export function removeCachedAnalysis(matchId) {
  if (!matchId) return;
  memoryCache.delete(matchId);
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(`${SESSION_STORAGE_KEY}_${matchId}`);
    } catch {}
  }
}

/**
 * Limpia toda la caché de análisis (por ejemplo, si se cambia de modelo en el Admin).
 */
export function clearAllAnalysisCache() {
  memoryCache.clear();
  const storage = getStorage();
  if (storage) {
    try {
      const keys = Object.keys(storage);
      for (const k of keys) {
        if (k.startsWith(SESSION_STORAGE_KEY)) {
          storage.removeItem(k);
        }
      }
    } catch {}
  }
}

