const feeds = new Map();
const details = new Map();
const TTL = 60000;

export function sportMatchVersion(match) {
  return JSON.stringify([match.id, match.kickoff, match.status, match.liveScore, match.finalScore, match.odds]);
}

export function readSportsCache(sessionKey, sport) {
  const entry = feeds.get(`${sessionKey}:${sport}`);
  return entry && Date.now() - entry.savedAt < TTL ? entry.feed : null;
}

export function saveSportsCache(sessionKey, sport, feed) {
  if (feeds.size > 12) feeds.delete(feeds.keys().next().value);
  feeds.set(`${sessionKey}:${sport}`, { feed, savedAt: Date.now() });
}

export function readSportDetail(sessionKey, sport, match) {
  const entry = details.get(`${sessionKey}:${sport}:${match.id}`);
  return entry && Date.now() - entry.savedAt < TTL && [entry.version, entry.resultVersion].includes(sportMatchVersion(match)) ? { ...entry.match, detailLoadedAt: entry.savedAt } : null;
}

export function saveSportDetail(sessionKey, sport, original, match) {
  if (details.size > 100) details.delete(details.keys().next().value);
  const key = `${sessionKey}:${sport}:${match.id}`, previous = details.get(key);
  const savedMatch = previous && sportMatchVersion(previous.match) === sportMatchVersion(match)
    ? mergeSportDetail(previous.match, previous.match, match) : match;
  const entry = { match: savedMatch, version: sportMatchVersion(original), savedAt: Date.now() };
  details.set(key, entry);
  // A published quote may be added by the detail endpoint.
  entry.resultVersion = sportMatchVersion(match);
}

export function mergeSportDetail(current, original, detail) {
  if (!current || (sportMatchVersion(current) !== sportMatchVersion(original)
    && sportMatchVersion(current) !== sportMatchVersion(detail))) return current;
  const merged = { ...current, ...detail };
  // A calendar/detail request started before an AI retry can finish afterward.
  // Keep the newer report only while its exact inputs and cache life still match.
  const report = current.aiReport;
  const generated = Date.parse(report?.generatedAt);
  const reportTtl = report?.aiAvailable === false ? 60000 : current.status === 'SCHEDULED' && Date.parse(current.kickoff) > Date.now() ? 300000 : 30000;
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
