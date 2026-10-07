import { fetchJson, redisConfigured, redisCommand } from './dataCache.js';
import { encodeCache, decodeCache } from './cacheCodec.js';
import { numberOrNull, hasReportedStatistics } from './espnParsing.js';
import { fitFootballLeague, FOOTBALL_MODEL } from '../../src/utils/footballModel.js';

// League-wide history for the football model. Two calendar-year scoreboards
// replace dozens of per-match summaries: one request returns every result of a
// league with goals, shots on target, corners, fouls and card events.
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const REBUILD_AFTER_MS = 6 * 3600000;
const KEEP_SECONDS = 48 * 3600;
const MEMORY_MS = 20 * 60000;
const RETRY_FAILED_MS = 10 * 60000;
const models = new Map();
const building = new Map();
const refreshing = new Map();
const failures = new Map();

const minuteOf = clock => {
  const text = String(clock?.displayValue || '');
  if (/^45'\s*\+/.test(text)) return 45;
  const minute = parseInt(text, 10);
  return Number.isFinite(minute) ? minute : null;
};

// A compact row per regulation-time result. Extra time and shoot-outs change the
// scoring process, so those finals are excluded rather than mixed in.
export function parseHistoryEvent(event) {
  const comp = event?.competitions?.[0];
  const status = comp?.status || event?.status;
  if (status?.type?.name !== 'STATUS_FULL_TIME' || !status.type.completed) return null;
  const home = comp.competitors?.find(c => c.homeAway === 'home'), away = comp.competitors?.find(c => c.homeAway === 'away');
  const time = Date.parse(event.date);
  const hg = numberOrNull(home?.score), ag = numberOrNull(away?.score);
  if (!home?.id || !away?.id || !Number.isFinite(time) || !Number.isInteger(hg) || !Number.isInteger(ag) || hg < 0 || ag < 0) return null;
  const stat = (team, name) => {
    if (!hasReportedStatistics(team.statistics)) return null;
    const value = numberOrNull(team.statistics.find(s => s.name === name)?.value ?? team.statistics.find(s => s.name === name)?.displayValue);
    return Number.isInteger(value) && value >= 0 ? value : null;
  };
  const details = comp.details || [];
  const goals = details.filter(d => d.scoringPlay && !d.shootout);
  const byTeam = id => goals.filter(d => String(d.team?.id) === String(id));
  // Half-time goals only when the goal events reproduce the final score.
  const halvesValid = byTeam(home.id).length === hg && byTeam(away.id).length === ag && goals.every(d => minuteOf(d.clock) !== null);
  const firstHalf = id => byTeam(id).filter(d => minuteOf(d.clock) <= 45).length;
  const cards = details.filter(d => d.yellowCard);
  const yellow = id => cards.length ? cards.filter(d => String(d.team?.id) === String(id)).length : null;
  return { id: String(event.id), time, home: String(home.id), away: String(away.id), hg, ag,
    hst: stat(home, 'shotsOnTarget'), ast: stat(away, 'shotsOnTarget'), hc: stat(home, 'wonCorners'), ac: stat(away, 'wonCorners'),
    hf: stat(home, 'foulsCommitted'), af: stat(away, 'foulsCommitted'), hy: yellow(home.id), ay: yellow(away.id),
    hthg: halvesValid ? firstHalf(home.id) : null, htag: halvesValid ? firstHalf(away.id) : null };
}

const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const round = (value, digits = 2) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;

// Recorded averages for the detail view: the last ten league results per team.
export function teamRecords(rows, teamId, asOf, minimum = 5) {
  const own = rows.filter(r => r.time < asOf && (r.home === teamId || r.away === teamId)).sort((a, b) => b.time - a.time).slice(0, 10);
  const side = r => r.home === teamId;
  const values = pick => own.map(pick).filter(Number.isFinite);
  const average = pick => { const list = values(pick); return list.length >= minimum ? round(mean(list)) : null; };
  const rate = test => own.length >= minimum ? round(own.filter(test).length / own.length * 100, 1) : null;
  return {
    avgCorners: average(r => side(r) ? r.hc : r.ac), avgCornersConceded: average(r => side(r) ? r.ac : r.hc),
    avgYellowCards: average(r => side(r) ? r.hy : r.ay), avgFouls: average(r => side(r) ? r.hf : r.af),
    avgShotsOnTarget: average(r => side(r) ? r.hst : r.ast),
    cleanSheetRate: rate(r => (side(r) ? r.ag : r.hg) === 0), bttsRate: rate(r => r.hg > 0 && r.ag > 0),
    sampleSizes: { goals: own.length, corners: values(r => side(r) ? r.hc : r.ac).length, cards: values(r => side(r) ? r.hy : r.ay).length,
      fouls: values(r => side(r) ? r.hf : r.af).length, cleanSheets: own.length, btts: own.length }
  };
}

const packFit = fit => fit ? { bh: round(fit.baseHome, 6), ba: round(fit.baseAway, 6),
  t: Object.fromEntries([...fit.teams].map(([id, t]) => [id, [round(t.attack, 5), round(t.defense, 5), t.games]])) } : null;
export const unpackFit = packed => packed ? { baseHome: packed.bh, baseAway: packed.ba, prior: () => ({ attack: 1, defense: 1 }),
  teams: new Map(Object.entries(packed.t).map(([id, [attack, defense, games]]) => [id, { attack, defense, games }])) } : null;

export function buildLeagueModel(league, responses, now = Date.now()) {
  const rows = [...new Map(responses.flatMap(data => (data?.events || []).map(parseHistoryEvent).filter(Boolean)).map(row => [row.id, row])).values()]
    .filter(row => row.time < now).sort((a, b) => a.time - b.time);
  const seasonStart = Date.parse(responses.at(-1)?.leagues?.[0]?.season?.startDate);
  const fits = fitFootballLeague(rows, { asOf: now, seasonStart: Number.isFinite(seasonStart) ? seasonStart : null });
  if (!fits.supremacy || !fits.total) return null;
  const teams = [...new Set(rows.flatMap(row => [row.home, row.away]))];
  return {
    version: FOOTBALL_MODEL.version, leagueId: league.id, espnCode: league.espnCode, builtAt: now, games: rows.length,
    period: rows.length ? [new Date(rows[0].time).toISOString(), new Date(rows.at(-1).time).toISOString()] : null,
    fits: { supremacy: packFit(fits.supremacy), total: packFit(fits.total), shots: packFit(fits.shots), corners: packFit(fits.corners), cards: packFit(fits.cards) },
    firstHalfShare: round(fits.firstHalfShare, 5), halfSample: fits.halfSample, samples: fits.samples,
    teams: Object.fromEntries(teams.map(id => [id, teamRecords(rows, id, now)]))
  };
}

export function modelFits(model) {
  if (!model?.fits) return null;
  return { supremacy: unpackFit(model.fits.supremacy), total: unpackFit(model.fits.total), shots: unpackFit(model.fits.shots),
    corners: unpackFit(model.fits.corners), cards: unpackFit(model.fits.cards), firstHalfShare: model.firstHalfShare, halfSample: model.halfSample };
}

async function readStored(key) {
  if (!redisConfigured()) return null;
  try {
    const stored = await redisCommand('GET', key);
    if (!stored) return null;
    const { envelope } = await decodeCache(stored);
    return envelope.expires > Date.now() && envelope.value?.version === FOOTBALL_MODEL.version ? envelope.value : null;
  } catch { return null; }
}

async function writeStored(key, model) {
  if (!redisConfigured()) return;
  try {
    const encoded = await encodeCache({ value: model, expires: Date.now() + KEEP_SECONDS * 1000 });
    if (encoded.stored !== null) await redisCommand('SET', key, encoded.stored, 'EX', KEEP_SECONDS);
  } catch { /* The model still serves this instance from memory. */ }
}

// Each calendar-year scoreboard is several megabytes of JSON; parsing many at
// once on a small serverless instance risks its memory limit.
const MAX_PARALLEL_REBUILDS = 3;
let activeRebuilds = 0;
const rebuildQueue = [];
async function withRebuildSlot(work) {
  if (activeRebuilds >= MAX_PARALLEL_REBUILDS) await new Promise(resolve => rebuildQueue.push(resolve));
  activeRebuilds++;
  try { return await work(); }
  finally { activeRebuilds--; rebuildQueue.shift()?.(); }
}

async function rebuild(league, key) {
  return withRebuildSlot(async () => {
    const year = new Date().getUTCFullYear();
    const responses = await Promise.all([year - 1, year].map(y => fetchJson(`${BASE}/${league.espnCode}/scoreboard?dates=${y}&limit=1000`).catch(() => null)));
    if (!responses[1]) throw new Error('Historial de la liga no disponible.');
    const model = buildLeagueModel(league, responses.filter(Boolean));
    if (!model) throw new Error('Muestra insuficiente para el modelo de la liga.');
    await writeStored(key, model);
    return model;
  });
}

const storeKey = league => `picks:v2:football-model:${FOOTBALL_MODEL.version}:${league.id}`;
function remember(league, model) {
  models.set(league.id, { model, loadedAt: Date.now() });
  failures.delete(league.id);
}

// An old model keeps serving while a fresh one is built, so a member never waits
// for the provider. On Vercel the refresh is registered with the request context.
function refreshInBackground(league) {
  if (refreshing.has(league.id)) return;
  const task = rebuild(league, storeKey(league)).then(model => remember(league, model)).catch(() => {})
    .finally(() => refreshing.delete(league.id));
  refreshing.set(league.id, task);
  globalThis[Symbol.for('@vercel/request-context')]?.get?.()?.waitUntil?.(task);
}

// Small fitted parameters are shared through Redis; the multi-megabyte provider
// scoreboards never are. A stale model keeps serving if a rebuild fails.
export async function loadLeagueModel(league) {
  const now = Date.now(), local = models.get(league.id);
  if (local && now - local.loadedAt < MEMORY_MS) {
    if (now - local.model.builtAt >= REBUILD_AFTER_MS) refreshInBackground(league);
    return local.model;
  }
  // A league without enough history (or an outage) is not retried on every request.
  if (!local && failures.get(league.id) > now) return null;
  if (building.has(league.id)) return building.get(league.id);
  const task = (async () => {
    let model = await readStored(storeKey(league)) || local?.model || null;
    if (model && Date.now() - model.builtAt >= REBUILD_AFTER_MS) refreshInBackground(league);
    if (!model) {
      try { model = await rebuild(league, storeKey(league)); }
      catch { model = null; }
    }
    if (model) remember(league, model);
    else failures.set(league.id, Date.now() + RETRY_FAILED_MS);
    return model;
  })();
  building.set(league.id, task);
  try { return await task; } finally { building.delete(league.id); }
}

// Synchronous lookup for the forecast functions; null until a model is loaded.
export function leagueModelFor(espnCode) {
  for (const { model } of models.values()) if (model.espnCode === espnCode) return model;
  return null;
}

export function rememberLeagueModel(model) {
  if (model) models.set(model.leagueId, { model, loadedAt: Date.now() });
}
export function forgetLeagueModels() { models.clear(); failures.clear(); }
