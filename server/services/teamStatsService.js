import { cachedData, fetchJson } from './dataCache.js';
import { numberOrNull } from './espnParsing.js';

// Real per-team aggregates (corners, cards, fouls, BTTS, totals) built from ESPN
// match boxscores. Nothing here is estimated: a metric stays null until the
// provider has actually reported it for at least one completed match.
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const WINDOW_DAYS = 180;
const MAX_MATCHES = 80;
const CONCURRENCY = 6;
const TTL_SECONDS = 6 * 3600;

const compact = ms => new Date(ms).toISOString().slice(0, 10).replaceAll('-', '');

async function pool(items, size, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try { results[index] = await worker(items[index]); } catch { results[index] = null; }
    }
  }));
  return results;
}

const BOX_FIELDS = { corners: 'wonCorners', yellowCards: 'yellowCards', redCards: 'redCards', fouls: 'foulsCommitted', shots: 'totalShots', shotsOnTarget: 'shotsOnTarget', possession: 'possessionPct' };

function readBoxscore(team) {
  const entry = name => {
    const found = (team.statistics || []).find(s => s.name === name);
    return numberOrNull(found?.value ?? found?.displayValue?.replace('%', ''));
  };
  return Object.fromEntries(Object.entries(BOX_FIELDS).map(([key, name]) => [key, entry(name)]));
}

// Every metric tracks its own sample so a missing stat never inflates an average.
function emptyAccumulator() {
  const metric = () => ({ sum: 0, count: 0 });
  return {
    matches: 0,
    goalsFor: metric(), goalsAgainst: metric(),
    cornersFor: metric(), cornersAgainst: metric(),
    yellowCards: metric(), redCards: metric(), fouls: metric(),
    shots: metric(), shotsOnTarget: metric(), possession: metric(),
    btts: metric(), over25: metric(), cleanSheet: metric(), failedToScore: metric()
  };
}

const add = (metric, value) => { if (Number.isFinite(value)) { metric.sum += value; metric.count += 1; } };
const mean = metric => (metric.count ? metric.sum / metric.count : null);
const rate = metric => (metric.count ? (metric.sum / metric.count) * 100 : null);
const round = (value, digits = 2) => (value === null ? null : Number(value.toFixed(digits)));

async function collectLeagueEvents(league) {
  const now = Date.now();
  const events = [];
  // ESPN caps a scoreboard response, so the window is walked in 30-day slices.
  for (let offset = 0; offset < WINDOW_DAYS; offset += 30) {
    const end = now - offset * 86400000;
    const start = end - 30 * 86400000;
    try {
      const data = await fetchJson(`${BASE}/${league.espnCode}/scoreboard?dates=${compact(start)}-${compact(end)}&limit=200`);
      for (const event of data.events || []) {
        if (event.status?.type?.completed || event.competitions?.[0]?.status?.type?.completed) events.push(event);
      }
    } catch {
      // A missing slice only shrinks the sample; it must never fail the aggregate.
    }
    if (events.length >= MAX_MATCHES) break;
  }
  const unique = new Map(events.map(event => [String(event.id), event]));
  return [...unique.values()]
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, MAX_MATCHES);
}

function accumulate(table, teamId, own, rival, ownGoals, rivalGoals) {
  if (!table.has(teamId)) table.set(teamId, emptyAccumulator());
  const acc = table.get(teamId);
  acc.matches += 1;
  add(acc.cornersFor, own.corners);
  add(acc.cornersAgainst, rival.corners);
  add(acc.yellowCards, own.yellowCards);
  add(acc.redCards, own.redCards);
  add(acc.fouls, own.fouls);
  add(acc.shots, own.shots);
  add(acc.shotsOnTarget, own.shotsOnTarget);
  add(acc.possession, own.possession);
  if (Number.isFinite(ownGoals) && Number.isFinite(rivalGoals)) {
    add(acc.goalsFor, ownGoals);
    add(acc.goalsAgainst, rivalGoals);
    add(acc.btts, ownGoals > 0 && rivalGoals > 0 ? 1 : 0);
    add(acc.over25, ownGoals + rivalGoals > 2.5 ? 1 : 0);
    add(acc.cleanSheet, rivalGoals === 0 ? 1 : 0);
    add(acc.failedToScore, ownGoals === 0 ? 1 : 0);
  }
}

function serialize(accumulator) {
  return {
    matchesSampled: accumulator.matches,
    avgGoalsFor: round(mean(accumulator.goalsFor)),
    avgGoalsAgainst: round(mean(accumulator.goalsAgainst)),
    avgCorners: round(mean(accumulator.cornersFor)),
    avgCornersAgainst: round(mean(accumulator.cornersAgainst)),
    avgYellowCards: round(mean(accumulator.yellowCards)),
    avgRedCards: round(mean(accumulator.redCards)),
    avgFouls: round(mean(accumulator.fouls)),
    avgShots: round(mean(accumulator.shots)),
    avgShotsOnTarget: round(mean(accumulator.shotsOnTarget)),
    avgPossession: round(mean(accumulator.possession), 1),
    bttsRate: round(rate(accumulator.btts), 1),
    over25Rate: round(rate(accumulator.over25), 1),
    cleanSheetRate: round(rate(accumulator.cleanSheet), 1),
    failedToScoreRate: round(rate(accumulator.failedToScore), 1),
    sampleSizes: {
      corners: accumulator.cornersFor.count,
      cards: accumulator.yellowCards.count,
      fouls: accumulator.fouls.count,
      goals: accumulator.goalsFor.count
    }
  };
}

async function computeLeagueTeamStats(league) {
  const events = await collectLeagueEvents(league);
  if (!events.length) throw new Error('El proveedor no entrega partidos finalizados para esta liga.');
  const summaries = await pool(events, CONCURRENCY, async event => {
    const data = await fetchJson(`${BASE}/${league.espnCode}/summary?event=${event.id}`);
    return { event, teams: data.boxscore?.teams || [] };
  });

  const table = new Map();
  let analysed = 0;
  for (const summary of summaries) {
    if (!summary || summary.teams.length !== 2) continue;
    const competitors = summary.event.competitions?.[0]?.competitors || [];
    const goalsById = new Map(competitors.map(c => [String(c.team?.id ?? c.id), numberOrNull(c.score)]));
    const [first, second] = summary.teams.map(team => ({ id: String(team.team?.id), box: readBoxscore(team) }));
    if (!first.id || !second.id) continue;
    analysed += 1;
    accumulate(table, first.id, first.box, second.box, goalsById.get(first.id), goalsById.get(second.id));
    accumulate(table, second.id, second.box, first.box, goalsById.get(second.id), goalsById.get(first.id));
  }
  if (!analysed) throw new Error('El proveedor no entrega estadísticas de partido para esta liga.');

  const teams = Object.fromEntries([...table.entries()].map(([id, acc]) => [id, serialize(acc)]));
  const dates = events.map(e => Date.parse(e.date)).filter(Number.isFinite);
  return {
    leagueId: league.id,
    teams,
    matchesAnalysed: analysed,
    sampleFrom: dates.length ? new Date(Math.min(...dates)).toISOString() : null,
    sampleTo: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
    fetchedAt: new Date().toISOString(),
    source: 'ESPN boxscore',
    method: `Promedios reales por equipo sobre ${analysed} partidos finalizados del proveedor.`
  };
}

// Ready aggregates are served instantly; a cold league is computed in the
// background so the feed answers fast and shows "sin dato" instead of a guess.
const ready = new Map();
const running = new Map();

export function peekLeagueTeamStats(leagueId) {
  const entry = ready.get(leagueId);
  return entry && entry.expires > Date.now() ? entry.value : null;
}

export function warmLeagueTeamStats(league) {
  if (peekLeagueTeamStats(league.id) || running.has(league.id)) return;
  const job = cachedData(`teamstats:${league.id}`, TTL_SECONDS, () => computeLeagueTeamStats(league))
    .then(value => { ready.set(league.id, { value, expires: Date.now() + TTL_SECONDS * 1000 }); return value; })
    .catch(() => null)
    .finally(() => running.delete(league.id));
  running.set(league.id, job);
}

export async function getLeagueTeamStats(league) {
  const cached = peekLeagueTeamStats(league.id);
  if (cached) return cached;
  if (!running.has(league.id)) warmLeagueTeamStats(league);
  return running.get(league.id) ?? null;
}

export function teamStatsFor(stats, teamId) {
  return stats?.teams?.[String(teamId)] ?? null;
}
