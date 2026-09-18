import { cachedData, fetchJson } from './dataCache.js';
import { numberOrNull } from './espnParsing.js';
import { totalLines } from '../../src/utils/probability.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const MIN_SAMPLE = 5;
export function readHistoricalSummary(data, teamId, cutoff) {
  const comp = data.header?.competitions?.[0];
  if (!comp?.status?.type?.completed || !(Date.parse(comp.date) < cutoff)) return null;
  const own = comp.competitors?.find(c => String(c.id) === String(teamId));
  const rival = comp.competitors?.find(c => String(c.id) !== String(teamId));
  if (!own || !rival) return null;
  const box = id => data.boxscore?.teams?.find(t => String(t.team?.id) === String(id));
  const stat = (id, name) => { const s = box(id)?.statistics?.find(v => v.name === name); const n = numberOrNull(s?.value ?? s?.displayValue); return Number.isFinite(n) && n >= 0 ? n : null; };
  const halves = c => {
    if (c.linescores?.length !== 2) return null; // Exclude extra time/shootouts.
    const values = c.linescores.map(s => numberOrNull(s.value ?? s.displayValue));
    if (!values.every(n => Number.isInteger(n) && n >= 0) || values[0] + values[1] !== numberOrNull(c.score)) return null;
    return values;
  };
  const ownHalves = halves(own), rivalHalves = halves(rival);
  return { id: comp.id, date: comp.date, corners: stat(own.id, 'wonCorners'), cornersAgainst: stat(rival.id, 'wonCorners'),
    cards: stat(own.id, 'yellowCards'), fouls: stat(own.id, 'foulsCommitted'),
    ownHalves: ownHalves && rivalHalves ? ownHalves : null, rivalHalves: ownHalves && rivalHalves ? rivalHalves : null };
}
export function aggregateHistory(rows) {
  const valid = rows.filter(Boolean);
  const metrics = {};
  const sampleSizes = {};
  for (const key of ['corners', 'cornersAgainst', 'cards', 'fouls']) {
    const values = valid.map(r => r[key]).filter(n => Number.isFinite(n));
    sampleSizes[key] = values.length;
    metrics[key] = values.length >= MIN_SAMPLE ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }
  const halves = valid.filter(r => r.ownHalves && r.rivalHalves);
  sampleSizes.halves = halves.length;
  return { ...metrics, sampleSizes, firstFor: halves.reduce((n, r) => n + r.ownHalves[0], 0),
    firstAgainst: halves.reduce((n, r) => n + r.rivalHalves[0], 0),
    totalFor: halves.reduce((n, r) => n + r.ownHalves[0] + r.ownHalves[1], 0),
    totalAgainst: halves.reduce((n, r) => n + r.rivalHalves[0] + r.rivalHalves[1], 0),
    records: valid.map(r => ({ id: r.id, date: r.date })), fetchedAt: new Date().toISOString() };
}
async function history(match, teamId) {
  const cutoff = Math.min(Date.now(), Date.parse(match.kickoff));
  return cachedData(`verified-history:v1:${match.espnCode}:${teamId}:${match.kickoff}`, 3600, async () => {
    const schedule = await fetchJson(`${BASE}/${match.espnCode}/teams/${teamId}/schedule`);
    const events = [...new Map((schedule.events || []).map(e => [e.id, e])).values()]
      .filter(e => (e.competitions?.[0]?.status?.type?.completed || e.status?.type?.completed) && Date.parse(e.date) < cutoff)
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 10);
    const rows = [];
    // Bound upstream concurrency to avoid bursts and rate-limit failures.
    for (let i = 0; i < events.length; i += 4) {
      rows.push(...await Promise.all(events.slice(i, i + 4).map(async e => {
        try {
          const data = await cachedData(`historical-summary:v1:${match.espnCode}:${e.id}`, 21600, () => fetchJson(`${BASE}/${match.espnCode}/summary?event=${e.id}`));
          return readHistoricalSummary(data, teamId, cutoff);
        } catch { return null; }
      })));
    }
    return aggregateHistory(rows);
  });
}
export function halfGoalModel(model, home, away) {
  if (!model || !home || !away || home.sampleSizes.halves < MIN_SAMPLE || away.sampleSizes.halves < MIN_SAMPLE) return null;
  const fraction = (a, b, x, y) => {
    const first = a / home.sampleSizes.halves + b / away.sampleSizes.halves;
    const total = x / home.sampleSizes.halves + y / away.sampleSizes.halves;
    return total > 0 ? first / total : null;
  };
  const h = fraction(home.firstFor, away.firstAgainst, home.totalFor, away.totalAgainst);
  const a = fraction(home.firstAgainst, away.firstFor, home.totalAgainst, away.totalFor);
  if (h === null || a === null) return null;
  const first = model.expectedGoals.home * h + model.expectedGoals.away * a;
  const second = model.expectedGoals.home * (1 - h) + model.expectedGoals.away * (1 - a);
  return { first: { expectedGoals: first, ...totalLines(first) }, second: { expectedGoals: second, ...totalLines(second) },
    sampleSize: { home: home.sampleSizes.halves, away: away.sampleSizes.halves },
    method: 'Poisson; reparto por mitades observado en partidos terminados. Incluye descuento; excluye prórroga y penales.' };
}
export async function enrichHistoricalStats(match) {
  if (!match?.espnCode || !match.homeTeamId || !match.awayTeamId) return match;
  const histories = await Promise.all([match.homeTeamId, match.awayTeamId].map(id => history(match, id).catch(() => null)));
  const team = (original, stats) => stats ? { ...original, avgCorners: stats.corners, avgCornersConceded: stats.cornersAgainst,
    avgYellowCards: stats.cards, avgFouls: stats.fouls, sampleSizes: stats.sampleSizes,
    statsSource: 'ESPN boxscore', statsFetchedAt: stats.fetchedAt, statsRecords: stats.records } : original;
  return { ...match, homeTeam: team(match.homeTeam, histories[0]), awayTeam: team(match.awayTeam, histories[1]),
    halfGoals: match.status === 'SCHEDULED' ? halfGoalModel(match.model, ...histories) : null };
}
