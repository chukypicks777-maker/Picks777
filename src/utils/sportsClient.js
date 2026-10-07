import { SPORT_MODEL_VERSION } from './sportModelVersion.js';

const feeds = new Map();
const details = new Map();
const TTL = 60000;
const RETENTION = 86400000;
let database;
const pendingWrites = new Map();
let flushScheduled = false;

// Structured-clone storage avoids synchronous JSON writes for large calendars.
// Partition by account; credentials and AI settings never enter this database.
function openDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!database) database = new Promise(resolve => {
    const request = indexedDB.open('picks777-sport-details-v1', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('details', { keyPath: 'key' });
      store.createIndex('scope', 'scope');
      store.createIndex('savedAt', 'savedAt');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  return database;
}

function persist(entry) {
  pendingWrites.set(entry.key, entry);
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(async () => {
    const db = await openDatabase();
    const entries = [...pendingWrites.values()];
    pendingWrites.clear();
    flushScheduled = false;
    if (!db) return;
    try {
      // A whole API batch uses one disk transaction, rather than one per card.
      const store = db.transaction('details', 'readwrite').objectStore('details');
      entries.forEach(value => store.put(value));
      const request = store.index('savedAt').openCursor(IDBKeyRange.upperBound(Date.now() - RETENTION));
      request.onsuccess = () => { const cursor = request.result; if (cursor) { cursor.delete(); cursor.continue(); } };
    } catch { /* Memory preserves work when browser storage is unavailable. */ }
  });
}

export async function restoreSportDetails(sessionKey, sport) {
  const db = await openDatabase();
  if (!db) return;
  const scope = `${sessionKey}:${sport}:${SPORT_MODEL_VERSION}`;
  return new Promise(resolve => {
    try {
      const request = db.transaction('details').objectStore('details').index('scope').getAll(scope);
      request.onsuccess = () => {
        for (const entry of request.result) {
          if (Date.now() - entry.savedAt < RETENTION && (!details.has(entry.key) || details.get(entry.key).savedAt < entry.savedAt)) details.set(entry.key, entry);
        }
        resolve();
      };
      request.onerror = () => resolve();
    } catch { resolve(); }
  });
}

export function sportDetailFresh(match) {
  return Number.isFinite(match?.detailLoadedAt) && Date.now() - match.detailLoadedAt < TTL;
}

export function sportMatchVersion(match) {
  return JSON.stringify([match.id, match.kickoff, match.status, match.homeTeam?.id, match.homeTeam?.name, match.awayTeam?.id, match.awayTeam?.name,
    match.liveScore, match.finalScore, match.odds, match.oddsProvider]);
}

export function readSportsCache(sessionKey, sport) {
  const entry = feeds.get(`${sessionKey}:${sport}`);
  return entry && Date.now() - entry.savedAt < RETENTION ? entry.feed : null;
}

export function saveSportsCache(sessionKey, sport, feed) {
  if (feeds.size > 12) feeds.delete(feeds.keys().next().value);
  feeds.set(`${sessionKey}:${sport}`, { feed, savedAt: Date.now() });
}

export function readSportDetail(sessionKey, sport, match, { allowStale = false } = {}) {
  const entry = details.get(`${sessionKey}:${sport}:${SPORT_MODEL_VERSION}:${match.id}`);
  const limit = allowStale && match.status !== 'LIVE' && !(match.status === 'SCHEDULED' && Date.parse(match.kickoff) <= Date.now()) ? RETENTION : TTL;
  return entry && Date.now() - entry.savedAt < limit && [entry.version, entry.resultVersion].includes(sportMatchVersion(match)) ? { ...entry.match, detailLoadedAt: entry.savedAt } : null;
}

export function saveSportDetail(sessionKey, sport, original, match) {
  const scope = `${sessionKey}:${sport}:${SPORT_MODEL_VERSION}`, key = `${scope}:${match.id}`, previous = details.get(key);
  const savedMatch = previous && sportMatchVersion(previous.match) === sportMatchVersion(match)
    ? mergeSportDetail(previous.match, previous.match, match) : match;
  const entry = { key, scope, match: savedMatch, version: sportMatchVersion(original), savedAt: Date.now() };
  details.delete(key);
  details.set(key, entry);
  // A published quote may be added by the detail endpoint.
  entry.resultVersion = sportMatchVersion(match);
  if (details.size > 2000) details.delete(details.keys().next().value);
  void persist(entry);
  return { ...savedMatch, detailLoadedAt: entry.savedAt };
}

export function mergeSportDetail(current, original, detail) {
  if (!current || (sportMatchVersion(current) !== sportMatchVersion(original)
    && sportMatchVersion(current) !== sportMatchVersion(detail))) return current;
  const merged = { ...current, ...detail };
  // A calendar/detail request started before an AI retry can finish afterward.
  // Keep the newer report only while its exact inputs and cache life still match.
  const report = current.aiReport;
  const generated = Date.parse(report?.generatedAt);
  const reportTtl = report?.aiAvailable === false ? TTL : current.status === 'LIVE' || current.status === 'SCHEDULED' && Date.parse(current.kickoff) <= Date.now() ? 30000 : RETENTION;
  if (report && generated <= Date.now() && Date.now() - generated < reportTtl
    && sportMatchVersion(current) === sportMatchVersion(merged)
    && JSON.stringify(current.analysis) === JSON.stringify(merged.analysis)
    && (!detail.aiReport || Date.parse(detail.aiReport.generatedAt) < generated)) {
    merged.aiReport = report;
    merged.isAiAnalyzed = Boolean(report.aiAvailable);
  }
  return merged;
}

export async function requestSports(url, { signal, timeoutMs = 45000, method = 'GET', body } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(url, { method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    return { response, result };
  } catch (error) {
    if (timedOut && !signal?.aborted) throw new Error('La consulta demoró demasiado. Reintenta para actualizar los datos.');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
