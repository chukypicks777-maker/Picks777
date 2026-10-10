import { SPORT_LEAGUES } from '../../src/constants/leagues.js';
import { fetchJson, redisConfigured, redisCommand } from './dataCache.js';
import { encodeCache, decodeCache } from './cacheCodec.js';
import { BASKETBALL_RATINGS, ratingLeagueOf } from './basketballRatings.js';

// Finished NBA/WNBA regular-season and playoff results of the last 13 months as
// compact rows (a few kilobytes gzipped). A monthly scoreboard is several
// megabytes, so members never wait for it: until the first build exists the
// last-20-games model answers.
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball';
export const RATED_BASKETBALL_LEAGUES = Object.freeze(Object.keys(BASKETBALL_RATINGS.deviation));
const MONTHS = 13, KEEP_DAYS = 400, INCREMENTAL_MS = 25 * 86400000;
const REBUILD_AFTER_MS = 6 * 3600000, KEEP_SECONDS = 30 * 86400, MEMORY_MS = 60 * 60000, RETRY_FAILED_MS = 10 * 60000;
const memory = new Map(), loading = new Map(), refreshing = new Map(), failures = new Map();

export function historyRows(data, leagueId) {
  return (data?.events || []).flatMap(event => {
    const comp = event.competitions?.[0];
    // Regular season and playoffs; preseason and exhibitions are excluded.
    if (![2, 3].includes(event.season?.type) || !(comp?.status || event.status)?.type?.completed) return [];
    const home = comp.competitors?.find(team => team.homeAway === 'home'), away = comp.competitors?.find(team => team.homeAway === 'away');
    const points = side => Number(side?.score?.value ?? side?.score);
    const hv = points(home), av = points(away), time = Date.parse(event.date);
    if (!home?.team?.id || !away?.team?.id || !Number.isInteger(hv) || !Number.isInteger(av) || !Number.isFinite(time)) return [];
    return [[`espn-${leagueId}-${event.id}`, Math.round(time / 1000), String(home.team.id), String(away.team.id), hv, av]];
  });
}

export function recentMonths(now, count) {
  const date = new Date(now);
  return Array.from({ length: count }, (_, i) => {
    const month = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - i, 1));
    return `${month.getUTCFullYear()}${String(month.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

async function rebuild(leagueId, previous) {
  const league = SPORT_LEAGUES.basquetbol.find(item => item.id === leagueId);
  const now = Date.now(), incremental = previous && now - previous.builtAt < INCREMENTAL_MS;
  const rows = new Map((incremental ? previous.rows : []).map(row => [row[0], row]));
  // One monthly scoreboard in memory at a time; later builds refresh two months.
  for (const month of recentMonths(now, incremental ? 2 : MONTHS)) {
    const data = await fetchJson(`${BASE}/${league.espnCode}/scoreboard?dates=${month}&limit=1000`);
    if (!Array.isArray(data.events)) throw new Error('Historial ESPN no disponible.');
    for (const row of historyRows(data, leagueId)) rows.set(row[0], row);
  }
  const oldest = now / 1000 - KEEP_DAYS * 86400;
  const history = { version: BASKETBALL_RATINGS.version, leagueId, builtAt: now,
    rows: [...rows.values()].filter(row => row[1] >= oldest).sort((a, b) => a[1] - b[1]) };
  if (redisConfigured()) {
    try {
      const encoded = await encodeCache({ value: history, expires: now + KEEP_SECONDS * 1000 });
      if (encoded.stored !== null) await redisCommand('SET', storeKey(leagueId), encoded.stored, 'EX', KEEP_SECONDS);
    } catch { /* Memory still serves this instance. */ }
  }
  return history;
}

const storeKey = leagueId => `picks:v2:${BASKETBALL_RATINGS.version}:${leagueId}`;
async function readStored(leagueId) {
  if (!redisConfigured()) return null;
  try {
    const stored = await redisCommand('GET', storeKey(leagueId));
    if (!stored) return null;
    const { envelope } = await decodeCache(stored);
    return envelope.expires > Date.now() && envelope.value?.version === BASKETBALL_RATINGS.version ? envelope.value : null;
  } catch { return null; }
}
const remember = (leagueId, history) => { memory.set(leagueId, { history, loadedAt: Date.now() }); failures.delete(leagueId); };

function refreshInBackground(leagueId, previous) {
  if (refreshing.has(leagueId) || failures.get(leagueId) > Date.now()) return;
  const task = rebuild(leagueId, previous).then(history => remember(leagueId, history))
    .catch(() => failures.set(leagueId, Date.now() + RETRY_FAILED_MS)).finally(() => refreshing.delete(leagueId));
  refreshing.set(leagueId, task);
  globalThis[Symbol.for('@vercel/request-context')]?.get?.()?.waitUntil?.(task);
}

// Never blocks on the provider: a missing or old history is rebuilt in the
// background while the current one (or the fallback model) keeps answering.
export async function loadBasketballHistory(leagueId) {
  if (!RATED_BASKETBALL_LEAGUES.includes(leagueId)) return null;
  const now = Date.now(), local = memory.get(leagueId);
  if (local && now - local.loadedAt < MEMORY_MS) {
    if (now - local.history.builtAt >= REBUILD_AFTER_MS) refreshInBackground(leagueId, local.history);
    return local.history;
  }
  if (loading.has(leagueId)) return loading.get(leagueId);
  const task = (async () => {
    const history = await readStored(leagueId) || local?.history || null;
    if (history) remember(leagueId, history);
    if (!history || Date.now() - history.builtAt >= REBUILD_AFTER_MS) refreshInBackground(leagueId, history);
    return history;
  })();
  loading.set(leagueId, task);
  try { return await task; } finally { loading.delete(leagueId); }
}

export async function loadAllBasketballHistory(leagueId = null) {
  const leagues = RATED_BASKETBALL_LEAGUES.filter(id => !leagueId || id === ratingLeagueOf(leagueId));
  const loaded = await Promise.all(leagues.map(id => loadBasketballHistory(id).catch(() => null)));
  return Object.fromEntries(leagues.map((id, i) => [id, loaded[i]]));
}
export function rememberBasketballHistory(history) { if (history) remember(history.leagueId, history); }
export function forgetBasketballHistory() { memory.clear(); failures.clear(); }
