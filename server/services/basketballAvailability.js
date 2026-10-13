// NBA availability: who plays tonight against who earned the team rating.
// A team rating mixes the games of the last months; each player is part of it
// in proportion to the (recency-weighted) games he played for that team. So a
// player who is out costs his production times that share, and a player who
// plays but was not part of the rating (new signing, return from a long injury)
// adds his production times the missing share. Production = game score per game
// minus a replacement player's output in the same minutes, from ESPN averages.
// Parameters fitted on real box scores of 2023-24 and 2024-25 (preseasons 2023
// and 2024) and scored blind on the next season
// (scripts/backtest/experiment-basketball-availability.mjs):
// NBA 2025-26: accuracy 68.6% -> 70.4%, log loss 0.5947 -> 0.5777, mean gap to
// the DraftKings close 7.8 -> 5.1 points, same favourite 86.5% -> 90.7%.
// Preseason 2025: log loss 0.681 -> 0.663, gap 11.4 -> 8.7 points, same
// favourite 76.5% -> 81.6%. No bookmaker price enters the formula.
import { fetchJson } from './dataCache.js';

export const AVAILABILITY = Object.freeze({
  minMinutes: 8, priorGames: 10, seasonGames: 82, fullSeasonGames: 20,
  // Stars weigh more than the sum of role players (value squared, 10 = 10).
  regular: Object.freeze({ alpha: 0.1, replacement: 0, power: 2, shrinkGames: 10, minMinutes: 8 }),
  // Fitted together with the preseason scale of last season's ratings.
  preseason: Object.freeze({ alpha: 0.2, replacement: 0, power: 1, shrinkGames: 10, minMinutes: 8, scale: 0.6 })
});

const HOUR = 3600000, DAY = 24 * HOUR;
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const STATS = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete';
// Injury report every 20 minutes, rosters every 6 hours, season averages every
// 12 hours; all kept in instance memory only (no Redis bandwidth).
const REPORT_MS = 20 * 60000, ROSTER_MS = 6 * HOUR, STATS_MS = 12 * HOUR, RETRY_MS = 5 * 60000, WAIT_MS = 6000;
const KEYS = ['minutes', 'points', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers', 'fgm', 'fga', 'ftm', 'fta'];
const SOURCE_NAMES = { minutes: 'avgMinutes', points: 'avgPoints', rebounds: 'avgRebounds', assists: 'avgAssists', steals: 'avgSteals', blocks: 'avgBlocks',
  turnovers: 'avgTurnovers', fgm: 'avgFieldGoalsMade', fga: 'avgFieldGoalsAttempted', ftm: 'avgFreeThrowsMade', fta: 'avgFreeThrowsAttempted' };

export const gameScoreOf = stats => stats.points + 0.4 * stats.fgm - 0.7 * stats.fga - 0.4 * (stats.fta - stats.ftm)
  + 0.5 * stats.rebounds + stats.steals + 0.7 * stats.assists + 0.7 * stats.blocks - stats.turnovers;
// Game score per game (Hollinger, without the offensive/defensive rebound split
// and fouls, which ESPN averages do not separate) above a replacement player.
// power > 1 lets stars weigh more than the sum of role players; short samples
// shrink towards zero.
export function availabilityValue(stats, { replacement, minMinutes = AVAILABILITY.minMinutes, power = 1, shrinkGames = 0 }) {
  if (!stats || !(stats.minutes >= minMinutes)) return 0;
  let value = Math.max(0, (stats.gameScore ?? gameScoreOf(stats)) - replacement * stats.minutes);
  if (power !== 1) value = 10 * (value / 10) ** power;
  if (shrinkGames > 0 && Number.isFinite(stats.gp)) value *= stats.gp / (stats.gp + shrinkGames);
  return value;
}

// Points added to a team's rated margin: sum of value x (chance of playing -
// share of the rating earned with him).
export function lineupAdjustment(players, params) {
  return params.alpha * players.reduce((sum, p) => sum + availabilityValue(p.stats, params) * ((p.plays ?? 0) - (p.share ?? 0)), 0);
}

// Chance that a player on the ESPN injury report plays a given game. Rest and
// coach's decisions are announced for one game only.
export function playChance(entry, kickoff) {
  if (!entry) return 1;
  const t = Date.parse(kickoff), listed = Date.parse(entry.date), status = String(entry.status || '').toLowerCase();
  const type = String(entry.type || '').toLowerCase(), fantasy = String(entry.fantasy || '').toUpperCase();
  if (type === 'rest' || type === "coach's decision") return Number.isFinite(listed) && t >= listed - 12 * HOUR && t - listed <= 36 * HOUR ? 0 : 1;
  if (entry.returnDate && Number.isFinite(Date.parse(entry.returnDate)) && t >= Date.parse(entry.returnDate)) return 0.75;
  if (status === 'out' || fantasy === 'OUT') return 0;
  if (status === 'doubtful') return 0.25;
  if (status === 'probable') return 0.9;
  return 0.5; // Day-to-day, questionable, game-time decision.
}

// Season the game belongs to, as ESPN numbers it (2025-26 -> 2026).
export const nbaSeasonOf = time => { const d = new Date(time); return d.getUTCMonth() >= 7 ? d.getUTCFullYear() + 1 : d.getUTCFullYear(); };

// Two seasons merged by games played (per-game averages).
export function mergeSeasons(a, b) {
  const ga = a?.gp || 0, gb = b?.gp || 0;
  if (ga + gb === 0) return null;
  return { gp: ga + gb, ...Object.fromEntries(KEYS.map(k => [k, ((a?.[k] || 0) * ga + (b?.[k] || 0) * gb) / (ga + gb)])) };
}
// Last season, completed with the one before when he barely played (a long
// injury); the current season takes over after a few games.
export function blendedStats(current, previous, older) {
  const prior = (previous?.gp || 0) >= AVAILABILITY.fullSeasonGames ? previous : mergeSeasons(previous, older);
  const wc = current?.gp || 0, wp = prior ? Math.max(0, AVAILABILITY.priorGames - wc) : 0;
  if (wc + wp === 0) return null;
  return { gp: wc + (prior?.gp || 0), ...Object.fromEntries(KEYS.map(k => [k, ((current?.[k] || 0) * wc + (prior?.[k] || 0) * wp) / (wc + wp)])) };
}

// Team adjustment for one side. rows: rated games [{ time, home, away }] before
// the forecast; availability: loaded report, rosters and season averages.
export function teamAvailability(teamId, kickoff, rows, availability, { preseason = false, asOf = Date.parse(kickoff) } = {}) {
  const team = String(teamId), report = availability?.teams?.[team];
  if (!report || !Array.isArray(report.roster) || !availability.stats) return null;
  const season = nbaSeasonOf(Date.parse(kickoff));
  const seasons = preseason ? [season - 1] : [season - 1, season];
  const half = 60 * DAY, weight = {}, count = {}, times = [];
  for (const row of rows) {
    if (row.time >= asOf || (row.home !== team && row.away !== team)) continue;
    const s = nbaSeasonOf(row.time);
    if (!seasons.includes(s)) continue;
    const w = 0.5 ** ((asOf - row.time) / half);
    weight[s] = (weight[s] || 0) + w; count[s] = (count[s] || 0) + 1; times.push([row.time, w]);
  }
  const total = Object.values(weight).reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;
  const weightBefore = date => times.reduce((sum, [time, w]) => sum + (time < date ? w : 0), 0) / total;
  const statsFor = (id, year) => availability.stats[year]?.[id] || null;
  const onTeam = entry => entry && entry.teams.includes(team) ? entry.gp / entry.teams.length : 0;
  const share = id => seasons.reduce((sum, year) => {
    if (!weight[year]) return sum;
    const games = year === season && !preseason ? count[year] : AVAILABILITY.seasonGames;
    return sum + weight[year] * Math.min(1, onTeam(statsFor(id, year)) / games);
  }, 0) / total;
  const injuries = new Map((report.injuries || []).map(entry => [entry.id, entry]));
  const ids = new Set(report.roster);
  for (const year of seasons) for (const [id, entry] of Object.entries(availability.stats[year] || {})) if (entry.teams.includes(team)) ids.add(id);
  const players = [];
  for (const id of ids) {
    const stats = blendedStats(preseason ? null : statsFor(id, season), statsFor(id, season - 1), statsFor(id, season - 2));
    if (!stats) continue;
    const entry = injuries.get(id), onRoster = report.roster.includes(id);
    const plays = onRoster ? playChance(entry, kickoff) : 0;
    let earned = share(id);
    // Out since a date: the rating games after it were already played without him.
    if (entry && plays < 1 && Number.isFinite(Date.parse(entry.date))) earned *= weightBefore(Date.parse(entry.date));
    players.push({ id, name: entry?.name || availability.names?.[id] || null, stats, plays, share: earned, listed: Boolean(entry), status: entry?.status || null, type: entry?.type || null, onRoster });
  }
  return players;
}

// ---------------- Loading (ESPN, memory only) ----------------
const state = { report: null, rosters: null, stats: null, failedUntil: 0, loading: null };

function parseInjuries(data) {
  const teams = {};
  for (const team of data.injuries || []) teams[String(team.id)] = (team.injuries || []).map(i => ({
    id: String(i.athlete?.id || i.athlete?.links?.[0]?.href?.match(/\/id\/(\d+)/)?.[1] || ''), name: i.athlete?.displayName || null,
    status: i.status || null, type: i.details?.type || null, fantasy: i.details?.fantasyStatus?.abbreviation || null, date: i.date || null, returnDate: i.details?.returnDate || null
  })).filter(entry => entry.id);
  return { teams, season: data.season || null, fetchedAt: data.timestamp || new Date().toISOString() };
}

export function parseSeasonStats(data) {
  const categories = data.categories || [], out = {};
  const position = Object.fromEntries(Object.entries(SOURCE_NAMES).map(([key, name]) => {
    const index = categories.findIndex(c => (c.names || []).includes(name));
    return [key, index < 0 ? null : [index, categories[index].names.indexOf(name)]];
  }));
  const gpAt = (() => { const i = categories.findIndex(c => (c.names || []).includes('gamesPlayed')); return i < 0 ? null : [i, categories[i].names.indexOf('gamesPlayed')]; })();
  for (const a of data.athletes || []) {
    const value = at => { if (!at) return 0; const c = a.categories?.[at[0]]; const v = Number((c?.values ?? c?.totals)?.[at[1]]); return Number.isFinite(v) ? v : 0; };
    const gp = value(gpAt), id = String(a.athlete?.id || '');
    if (!id || !(gp > 0)) continue;
    const teams = [...new Set([...(a.athlete.teams || []).map(t => String(t.id)), a.athlete.teamId ? String(a.athlete.teamId) : null].filter(Boolean))];
    out[id] = { gp, teams, name: a.athlete.displayName || null, ...Object.fromEntries(Object.keys(SOURCE_NAMES).map(key => [key, value(position[key])])) };
  }
  return out;
}

async function loadStats(year, type) {
  const response = await fetch(`${STATS}?region=us&lang=en&contentorigin=espn&isqualified=false&limit=1000&season=${year}&seasontype=${type}`, { signal: AbortSignal.timeout(20000), headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseSeasonStats(await response.json());
}

async function refresh(now) {
  if (!state.report || now - state.report.loadedAt >= REPORT_MS) state.report = { ...parseInjuries(await fetchJson(`${ESPN}/injuries`)), loadedAt: now };
  const year = state.report.season?.year || nbaSeasonOf(now), type = state.report.season?.type || 2;
  if (!state.rosters || now - state.rosters.loadedAt >= ROSTER_MS) {
    const teams = (await fetchJson(`${ESPN}/teams`)).sports?.[0]?.leagues?.[0]?.teams?.map(t => String(t.team?.id)).filter(Boolean) || [];
    if (teams.length < 25) throw new Error('Equipos NBA no disponibles.');
    const rosters = {}, names = {};
    await Promise.all(teams.map(async id => {
      const data = await fetchJson(`${ESPN}/teams/${id}/roster`);
      rosters[id] = (data.athletes || []).map(a => { names[String(a.id)] = a.displayName; return String(a.id); });
    }));
    state.rosters = { rosters, names, loadedAt: now };
  }
  if (!state.stats || now - state.stats.loadedAt >= STATS_MS || state.stats.year !== year) {
    // The two previous regular seasons always; the current one once it has started.
    const [previous, older, current] = await Promise.all([loadStats(year - 1, 2), loadStats(year - 2, 2).catch(() => ({})), type >= 2 ? loadStats(year, 2).catch(() => ({})) : {}]);
    if (Object.keys(previous).length < 300) throw new Error('Promedios NBA no disponibles.');
    state.stats = { year, seasons: { [year - 2]: older, [year - 1]: previous, [year]: current }, loadedAt: now };
  }
}

// Report, rosters and averages for every NBA team, or null if ESPN fails (the
// forecast then keeps the ratings alone, as before).
export async function loadNbaAvailability(now = Date.now()) {
  if (process.env.NBA_AVAILABILITY === 'off') return null;
  const fresh = state.report && state.rosters && state.stats && now - state.report.loadedAt < REPORT_MS && now - state.rosters.loadedAt < ROSTER_MS && now - state.stats.loadedAt < STATS_MS;
  if (!fresh && now >= state.failedUntil) {
    if (!state.loading) {
      state.loading = refresh(now).catch(() => { state.failedUntil = Date.now() + RETRY_MS; }).finally(() => { state.loading = null; });
      globalThis[Symbol.for('@vercel/request-context')]?.get?.()?.waitUntil?.(state.loading);
    }
    // A slow ESPN never holds the calendar: wait a few seconds, then answer
    // with the previous data (or the ratings alone) while the load finishes.
    await Promise.race([state.loading, new Promise(resolve => setTimeout(resolve, WAIT_MS).unref?.())]);
  }
  if (!state.report || !state.rosters || !state.stats) return null;
  const teams = {};
  for (const [id, roster] of Object.entries(state.rosters.rosters)) teams[id] = { roster, injuries: state.report.teams[id] || [] };
  return { teams, names: state.rosters.names, stats: state.stats.seasons, fetchedAt: state.report.fetchedAt };
}
export function forgetNbaAvailability() { state.report = state.rosters = state.stats = null; state.failedUntil = 0; }
