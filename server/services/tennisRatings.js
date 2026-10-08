import { fetchJson, redisConfigured, redisCommand } from './dataCache.js';
import { encodeCache, decodeCache } from './cacheCodec.js';
import { validNumber } from '../../src/utils/probability.js';
import { eloK, eloProbability } from './sportProbabilityModel.js';
import { parseTennisEvents, tennisDateRanges } from './sportsDataService.js';

// Compact per-player Elo for ATP/WTA from real ESPN results of the last two
// years. A season scoreboard is 20-25 MB, so only these few kilobytes are kept
// and shared; members never wait for the history download.
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/tennis';
export const TENNIS_RATINGS_VERSION = 'tennis-elo-rank-h2h-2026-10-07';
const REBUILD_AFTER_MS = 6 * 3600000, KEEP_SECONDS = 48 * 3600, MEMORY_MS = 20 * 60000, RETRY_FAILED_MS = 10 * 60000;
const memory = new Map(), loading = new Map(), refreshing = new Map(), failures = new Map();

const validSet = set => validNumber(set.home) && validNumber(set.away)
  && ((Math.max(set.home, set.away) >= 6 && Math.abs(set.home - set.away) >= 2) || (Math.max(set.home, set.away) === 7 && Math.min(set.home, set.away) === 6));

// Replays finished, completed singles in date order. Each player keeps the Elo
// rating, the matches it rests on and set results of their last 20 matches.
export function buildTennisRatings(tour, games, asOf = Date.now(), ranking = null) {
  const finished = [...new Map(games.map(game => [game.id, game])).values()]
    .filter(game => game.tour === tour && game.status === 'FINISHED' && !game.retired && Date.parse(game.kickoff) < asOf
      && Number.isInteger(game.finalScore?.home) && Number.isInteger(game.finalScore?.away) && game.finalScore.home !== game.finalScore.away)
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.id.localeCompare(b.id));
  const rating = new Map(), count = new Map(), recent = new Map(), h2h = {};
  for (const game of finished) {
    const h = String(game.homeTeam.id), a = String(game.awayTeam.id);
    if (h === a) continue;
    const rh = rating.get(h) ?? 1500, ra = rating.get(a) ?? 1500, expected = eloProbability(rh, ra);
    const actual = game.finalScore.home > game.finalScore.away ? 1 : 0;
    rating.set(h, rh + eloK(count.get(h)) * (actual - expected)); rating.set(a, ra - eloK(count.get(a)) * (actual - expected));
    count.set(h, (count.get(h) || 0) + 1); count.set(a, (count.get(a) || 0) + 1);
    if (tour === 'atp') {
      // Head-to-head wins, keyed by the sorted pair.
      const [first, second] = [h, a].sort(), pair = h2h[`${first}|${second}`] ||= [0, 0];
      pair[(actual === 1 ? h : a) === first ? 0 : 1]++;
    }
    const sets = (game.setScores || []).filter(validSet);
    if (sets.length) for (const [id, side] of [[h, 'home'], [a, 'away']]) {
      const list = recent.get(id) || [];
      list.push([sets.filter(set => set[side] > set[side === 'home' ? 'away' : 'home']).length, sets.length]);
      if (list.length > 20) list.shift();
      recent.set(id, list);
    }
  }
  const players = {};
  for (const [id, value] of rating) {
    const list = recent.get(id) || [];
    players[id] = [Math.round(value * 10) / 10, count.get(id), list.reduce((s, x) => s + x[0], 0), list.reduce((s, x) => s + x[1], 0), list.length];
  }
  return { version: TENNIS_RATINGS_VERSION, tour, asOf, builtAt: asOf, games: finished.length, ...(tour === 'atp' ? { h2h, rankings: ranking } : {}),
    period: finished.length ? [finished[0].kickoff, finished.at(-1).kickoff] : null, players };
}

async function rebuild(tour) {
  const today = new Date().toISOString().slice(0, 10), games = [];
  // One season range at a time keeps a single multi-megabyte response in memory.
  for (const range of tennisDateRanges(today, 730, 0)) {
    const data = await fetchJson(`${BASE}/${tour}/scoreboard?dates=${range}&limit=1000`);
    if (!Array.isArray(data.events)) throw new Error('Historial ESPN no disponible.');
    for (const game of parseTennisEvents(data, tour)) games.push({ id: game.id, tour, kickoff: game.kickoff, status: game.status, retired: game.retired,
      finalScore: game.finalScore, setScores: game.setScores, homeTeam: { id: game.homeTeam.id }, awayTeam: { id: game.awayTeam.id } });
  }
  const ratings = buildTennisRatings(tour, games, Date.now(), tour === 'atp' ? await officialRanking(tour).catch(() => null) : null);
  if (ratings.games < 100) throw new Error('Muestra insuficiente.');
  if (redisConfigured()) {
    try {
      const encoded = await encodeCache({ value: ratings, expires: Date.now() + KEEP_SECONDS * 1000 });
      if (encoded.stored !== null) await redisCommand('SET', storeKey(tour), encoded.stored, 'EX', KEEP_SECONDS);
    } catch { /* Memory still serves this instance. */ }
  }
  return ratings;
}

// Latest official list published by ESPN (top 150 with points). Players outside
// it get 70% of the last listed points, as in the validation.
export async function officialRanking(tour) {
  const data = await fetchJson(`${BASE}/${tour}/rankings`);
  const ranks = data.rankings?.[0]?.ranks || [];
  if (ranks.length < 50) throw new Error('Ranking no disponible.');
  const points = Object.fromEntries(ranks.filter(rank => rank.athlete?.id && rank.points > 0).map(rank => [`${tour}-${rank.athlete.id}`, rank.points]));
  return { points, floor: ranks.at(-1).points * 0.7, updated: data.rankings[0].update || data.rankings[0].lastUpdated || null };
}

const storeKey = tour => `picks:v2:${TENNIS_RATINGS_VERSION}:${tour}`;
async function readStored(tour) {
  if (!redisConfigured()) return null;
  try {
    const stored = await redisCommand('GET', storeKey(tour));
    if (!stored) return null;
    const { envelope } = await decodeCache(stored);
    return envelope.expires > Date.now() && envelope.value?.version === TENNIS_RATINGS_VERSION ? envelope.value : null;
  } catch { return null; }
}
const remember = (tour, ratings) => { memory.set(tour, { ratings, loadedAt: Date.now() }); failures.delete(tour); };

function refreshInBackground(tour) {
  if (refreshing.has(tour)) return;
  const task = rebuild(tour).then(ratings => remember(tour, ratings)).catch(() => {}).finally(() => refreshing.delete(tour));
  refreshing.set(tour, task);
  globalThis[Symbol.for('@vercel/request-context')]?.get?.()?.waitUntil?.(task);
}

export async function loadTennisRatings(tour) {
  if (!['atp', 'wta'].includes(tour)) return null;
  const now = Date.now(), local = memory.get(tour);
  if (local && now - local.loadedAt < MEMORY_MS) {
    if (now - local.ratings.builtAt >= REBUILD_AFTER_MS) refreshInBackground(tour);
    return local.ratings;
  }
  if (!local && failures.get(tour) > now) return null;
  if (loading.has(tour)) return loading.get(tour);
  const task = (async () => {
    let ratings = await readStored(tour) || local?.ratings || null;
    if (ratings && Date.now() - ratings.builtAt >= REBUILD_AFTER_MS) refreshInBackground(tour);
    if (!ratings) { try { ratings = await rebuild(tour); } catch { ratings = null; } }
    if (ratings) remember(tour, ratings); else failures.set(tour, Date.now() + RETRY_FAILED_MS);
    return ratings;
  })();
  loading.set(tour, task);
  try { return await task; } finally { loading.delete(tour); }
}

export async function loadAllTennisRatings() {
  const [atp, wta] = await Promise.all(['atp', 'wta'].map(tour => loadTennisRatings(tour).catch(() => null)));
  return { atp, wta };
}
export function rememberTennisRatings(ratings) { if (ratings) remember(ratings.tour, ratings); }
export function forgetTennisRatings() { memory.clear(); failures.clear(); }
