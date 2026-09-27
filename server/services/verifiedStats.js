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
  const ownScore = numberOrNull(own.score);
  const rivalScore = numberOrNull(rival.score);
  const cleanSheet = rivalScore !== null ? (rivalScore === 0 ? 1 : 0) : null;
  const btts = (ownScore !== null && rivalScore !== null) ? (ownScore > 0 && rivalScore > 0 ? 1 : 0) : null;
  return { id: comp.id, date: comp.date, corners: stat(own.id, 'wonCorners'), cornersAgainst: stat(rival.id, 'wonCorners'),
    cards: stat(own.id, 'yellowCards'), fouls: stat(own.id, 'foulsCommitted'), cleanSheet, btts,
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
  const cleanSheets = valid.map(r => r.cleanSheet).filter(n => Number.isFinite(n));
  sampleSizes.cleanSheets = cleanSheets.length;
  const cleanSheetRate = cleanSheets.length >= MIN_SAMPLE ? Number(((cleanSheets.reduce((a, b) => a + b, 0) / cleanSheets.length) * 100).toFixed(1)) : null;
  const bttsList = valid.map(r => r.btts).filter(n => Number.isFinite(n));
  sampleSizes.btts = bttsList.length;
  const bttsRate = bttsList.length >= MIN_SAMPLE ? Number(((bttsList.reduce((a, b) => a + b, 0) / bttsList.length) * 100).toFixed(1)) : null;
  const halves = valid.filter(r => r.ownHalves && r.rivalHalves);
  sampleSizes.halves = halves.length;
  return { ...metrics, sampleSizes, cleanSheetRate, bttsRate, firstFor: halves.reduce((n, r) => n + r.ownHalves[0], 0),
    firstAgainst: halves.reduce((n, r) => n + r.rivalHalves[0], 0),
    totalFor: halves.reduce((n, r) => n + r.ownHalves[0] + r.ownHalves[1], 0),
    totalAgainst: halves.reduce((n, r) => n + r.rivalHalves[0] + r.rivalHalves[1], 0),
    records: valid.map(r => ({ id: r.id, date: r.date })), fetchedAt: new Date().toISOString() };
}
async function history(match, teamId, options = {}) {
  const cutoff = Math.min(Date.now(), Date.parse(match.kickoff));
  const forceRefresh = Boolean(options?.forceRefresh);
  return cachedData(`verified-history:v1:${match.espnCode}:${teamId}:${match.kickoff}`, 3600, async () => {
    let leagueCode = match.espnCode;
    let schedule = await fetchJson(`${BASE}/${leagueCode}/teams/${teamId}/schedule`).catch(() => null);
    let events = [...new Map((schedule?.events || []).map(e => [e.id, e])).values()]
      .filter(e => (e.competitions?.[0]?.status?.type?.completed || e.status?.type?.completed) && Date.parse(e.date) < cutoff)
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 10);

    // If tournament/cup schedule has fewer than MIN_SAMPLE completed matches,
    // look up the team in their domestic league to gather full verified stats
    if (events.length < MIN_SAMPLE) {
      let resolvedCode = null;
      try {
        const teamInfo = await fetchJson(`${BASE}/teams/${teamId}`).catch(() => null);
        const defaultLeagueHref = teamInfo?.team?.defaultLeague?.links?.[0]?.href || '';
        resolvedCode = defaultLeagueHref.match(/name\/([a-z0-9.]+)/i)?.[1]?.toLowerCase()
          || teamInfo?.team?.defaultLeague?.midsizeName?.toLowerCase()
          || teamInfo?.team?.defaultLeague?.shortName?.toLowerCase();

        if (resolvedCode && resolvedCode !== match.espnCode) {
          const domSchedule = await fetchJson(`${BASE}/${resolvedCode}/teams/${teamId}/schedule`).catch(() => null);
          const domEvents = [...new Map((domSchedule?.events || []).map(e => [e.id, e])).values()]
            .filter(e => (e.competitions?.[0]?.status?.type?.completed || e.status?.type?.completed) && Date.parse(e.date) < cutoff)
            .sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 10);
          if (domEvents.length >= MIN_SAMPLE || domEvents.length > events.length) {
            leagueCode = resolvedCode;
            events = domEvents;
          }
        }
      } catch {}

      if (events.length < MIN_SAMPLE) {
        const domesticLeagues = ['esp.1', 'ita.1', 'eng.1', 'ger.1', 'fra.1', 'por.1', 'ned.1', 'tur.1', 'bel.1', 'sco.1', 'mex.1', 'usa.1', 'arg.1', 'bra.1'];
        for (const domCode of domesticLeagues) {
          if (domCode === match.espnCode || domCode === resolvedCode) continue;
          const domSchedule = await fetchJson(`${BASE}/${domCode}/teams/${teamId}/schedule`).catch(() => null);
          const domEvents = [...new Map((domSchedule?.events || []).map(e => [e.id, e])).values()]
            .filter(e => (e.competitions?.[0]?.status?.type?.completed || e.status?.type?.completed) && Date.parse(e.date) < cutoff)
            .sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 10);
          if (domEvents.length >= MIN_SAMPLE || domEvents.length > events.length) {
            leagueCode = domCode;
            events = domEvents;
            if (events.length >= MIN_SAMPLE) break;
          }
        }
      }
    }

    const rows = [];
    // Bound upstream concurrency to avoid bursts and rate-limit failures.
    for (let i = 0; i < events.length; i += 4) {
      rows.push(...await Promise.all(events.slice(i, i + 4).map(async e => {
        try {
          const data = await cachedData(`historical-summary:v1:${leagueCode}:${e.id}`, 21600, () => fetchJson(`${BASE}/${leagueCode}/summary?event=${e.id}`), { forceRefresh });
          return readHistoricalSummary(data, teamId, cutoff);
        } catch { return null; }
      })));
    }
    return aggregateHistory(rows);
  }, { forceRefresh });
}
export function halfGoalModel(model, home, away) {
  if (!model || !home || !away || home.sampleSizes?.halves < MIN_SAMPLE || away.sampleSizes?.halves < MIN_SAMPLE) return null;
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
export async function enrichHistoricalStats(match, options = {}) {
  if (!match?.espnCode || !match.homeTeamId || !match.awayTeamId) return match;
  const histories = await Promise.all([match.homeTeamId, match.awayTeamId].map(id => history(match, id, options).catch(() => null)));
  const team = (original, stats) => {
    if (!stats) return original;
    const hasSufficientOriginal = Number.isFinite(original.gamesPlayed) && original.gamesPlayed >= MIN_SAMPLE && Number.isFinite(original.goalsFor) && Number.isFinite(original.goalsAgainst);
    const validSamples = Math.max(stats.sampleSizes?.halves ?? 0, stats.sampleSizes?.corners ?? 0, stats.sampleSizes?.cards ?? 0, stats.records?.length ?? 0);
    const fallbackGF = !hasSufficientOriginal && Number.isFinite(stats.totalFor) && validSamples >= MIN_SAMPLE ? stats.totalFor : original.goalsFor;
    const fallbackGA = !hasSufficientOriginal && Number.isFinite(stats.totalAgainst) && validSamples >= MIN_SAMPLE ? stats.totalAgainst : original.goalsAgainst;
    const fallbackGP = !hasSufficientOriginal && validSamples >= MIN_SAMPLE ? validSamples : original.gamesPlayed;
    return {
      ...original,
      goalsFor: fallbackGF ?? null,
      goalsAgainst: fallbackGA ?? null,
      gamesPlayed: fallbackGP ?? null,
      avgCorners: stats.corners,
      avgCornersConceded: stats.cornersAgainst,
      avgYellowCards: stats.cards,
      avgFouls: stats.fouls,
      cleanSheetRate: stats.cleanSheetRate ?? original.cleanSheetRate ?? null,
      bttsRate: stats.bttsRate ?? original.bttsRate ?? null,
      sampleSizes: stats.sampleSizes,
      statsSource: 'ESPN boxscore',
      statsFetchedAt: stats.fetchedAt,
      statsRecords: stats.records
    };
  };
  return { ...match, homeTeam: team(match.homeTeam, histories[0]), awayTeam: team(match.awayTeam, histories[1]),
    halfGoals: (match.status !== 'POSTPONED' && match.status !== 'CANCELLED') ? halfGoalModel(match.model, ...histories) : null };
}
