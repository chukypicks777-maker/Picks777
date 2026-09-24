import { enrichHistoricalStats } from './verifiedStats.js';
import { cachedData, fetchJson } from './dataCache.js';
import { poissonModel, buildPick } from './probabilityModel.js';

export const LEAGUES = [
  ['inglaterra', 'Premier League', '🏴', 'eng.1'],
  ['espana', 'LaLiga', '🇪🇸', 'esp.1'],
  ['mexico', 'Liga MX', '🇲🇽', 'mex.1'],
  ['mls', 'MLS', '🇺🇸', 'usa.1'],
  ['italia', 'Serie A', '🇮🇹', 'ita.1'],
  ['francia', 'Ligue 1', '🇫🇷', 'fra.1'],
  ['champions', 'UEFA Champions League', '🏆', 'uefa.champions'],
  ['leagues_cup', 'Leagues Cup', '🌎', 'concacaf.leagues.cup']
].map(([id, name, flag, espnCode]) => ({ id, name, flag, espnCode }));
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
let lastObservation = null;
export function sportsDiagnostic(now = Date.now()) {
  if (!lastObservation) return { source: 'ESPN', status: 'unknown', checkedAt: null, scope: 'instance', providerUpdatedAt: null };
  return { ...structuredClone(lastObservation), status: now - Date.parse(lastObservation.checkedAt) >= 120000 ? 'stale' : lastObservation.status };
}
export const numberOrNull = value => {
  if (value === null || value === undefined || value === '') return null;
  const raw = typeof value === 'object' ? (value.value != null ? value.value : value.displayValue) : value;
  if (raw === null || raw === undefined || raw === '') return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
};
const stat = (team, name) => numberOrNull((team.stats || team.statistics || []).find(s => s.name === name)?.value);
const form = value => typeof value === 'string' ? [...value].filter(v => ['W', 'D', 'L'].includes(v)).slice(0, 5) : [];
export function americanToDecimal(value) {
  const n = numberOrNull(value);
  return n && Math.abs(n) >= 100 ? (n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n)) : null;
}

function flattenStandings(node, group = '') {
  const rows = (node.standings?.entries || []).map(e => ({
    teamId: String(e.team.id), team: e.team.displayName, teamName: e.team.displayName,
    logo: e.team.logos?.[0]?.href, group, rank: stat(e, 'rank'),
    points: stat(e, 'points'), gamesPlayed: stat(e, 'gamesPlayed'),
    goalsFor: stat(e, 'pointsFor'), goalsAgainst: stat(e, 'pointsAgainst'), form: form(e.form)
  }));
  return rows.concat((node.children || []).flatMap(c => flattenStandings(c, c.name || c.abbreviation || group)));
}

async function standingsFor(league) {
  return cachedData(`standings:${league.id}`, 1800, async () => {
    const url = `https://site.api.espn.com/apis/v2/sports/soccer/${league.espnCode}/standings`;
    const data = await fetchJson(url);
    if (!Array.isArray(data.children) && !data.standings) throw new Error('Clasificación no disponible.');
    return { rows: flattenStandings(data), sourceUrl: url, fetchedAt: new Date().toISOString(), seasonYear: data.season?.year ?? null, season: data.season?.displayName || data.season?.year || null };
  });
}

export function parseEspnEvent(event, league, standings = [], fetchedAt = new Date().toISOString(), season = null) {
  const comp = event.competitions?.[0];
  const hc = comp?.competitors?.find(c => c.homeAway === 'home');
  const ac = comp?.competitors?.find(c => c.homeAway === 'away');
  if (!hc?.team?.id || !ac?.team?.id || !event.id || !Number.isFinite(Date.parse(event.date))) return null;
  const s = comp.status || event.status || {};
  const statusName = s.type?.name || '';
  const exceptional = { STATUS_POSTPONED: 'POSTPONED', STATUS_CANCELED: 'CANCELLED', STATUS_CANCELLED: 'CANCELLED', STATUS_SUSPENDED: 'SUSPENDED', STATUS_ABANDONED: 'ABANDONED', STATUS_DELAYED: 'DELAYED' };
  const status = exceptional[statusName] || (s.type?.completed ? 'FINISHED' : s.type?.state === 'in' ? 'LIVE' : s.type?.state === 'pre' ? 'SCHEDULED' : 'UNKNOWN');
  const team = c => {
    const candidates = standings.filter(row => row.teamId === String(c.team.id));
    // Grouped competitions can repeat a team: do not silently use the wrong phase.
    const row = candidates.length === 1 ? candidates[0] : {};
    return {
      id: String(c.team.id), name: c.team.displayName || c.team.name,
      shortName: c.team.abbreviation || c.team.shortDisplayName || c.team.name,
      logo: c.team.logo || c.team.logos?.[0]?.href,
      position: row.rank ?? null, points: row.points ?? null,
      goalsFor: row.goalsFor ?? null, goalsAgainst: row.goalsAgainst ?? null,
      gamesPlayed: row.gamesPlayed ?? null, form: form(c.form),
      avgCorners: null, avgCornersConceded: null,
      avgFouls: null, avgYellowCards: null,
      bttsRate: null, over25Rate: null, cleanSheetRate: null,
      keyPlayers: [...new Set((c.leaders || []).flatMap(g => (g.leaders || []).map(l => l.athlete?.displayName).filter(Boolean)))]
    };
  };
  const oddsData = comp.odds?.[0];
  const odds = { homeWin: null, draw: null, awayWin: null, over25: null, under25: null, bttsYes: null, bttsNo: null, over95Corners: null };
  for (const [key, side] of [['homeWin', 'home'], ['draw', 'draw'], ['awayWin', 'away']]) {
    odds[key] = americanToDecimal(oddsData?.moneyline?.[side]?.close?.odds ?? oddsData?.[`${side}TeamOdds`]?.moneyLine ?? (side === 'draw' ? oddsData?.drawOdds?.moneyLine : null));
  }
  for (const side of ['over', 'under']) {
    const total = oddsData?.total?.[side]?.close;
    if (total?.line === `${side === 'over' ? 'o' : 'u'}2.5`) odds[`${side}25`] = americanToDecimal(total.odds);
  }
  const match = {
    id: `espn-${event.id}`, espnEventId: String(event.id), espnCode: league.espnCode,
    homeTeamId: String(hc.team.id), awayTeamId: String(ac.team.id),
    leagueId: league.id, leagueName: league.name, leagueFlag: league.flag, season,
    status, statusDetail: s.type?.description || status, liveMinute: status === 'LIVE' ? s.displayClock || null : null,
    kickoff: event.date, venue: comp.venue?.fullName || null, referee: comp.officials?.[0]?.displayName || null,
    liveScore: { home: status === 'SCHEDULED' ? null : numberOrNull(hc.score), away: status === 'SCHEDULED' ? null : numberOrNull(ac.score) },
    finalScore: { home: status === 'FINISHED' ? numberOrNull(hc.score) : null, away: status === 'FINISHED' ? numberOrNull(ac.score) : null },
    homeTeam: team(hc), awayTeam: team(ac), odds,
    oddsProvider: oddsData?.provider?.name || null, oddsFetchedAt: oddsData ? fetchedAt : null,
    source: 'ESPN', sourceUrl: `https://www.espn.com/soccer/match/_/gameId/${event.id}`,
    fetchedAt, providerUpdatedAt: null, h2h: [], recentMatches: [], realBoxscore: null
  };
  match.model = (status !== 'POSTPONED' && status !== 'CANCELLED') ? poissonModel(match.homeTeam, match.awayTeam) : null;
  if (match.model) {
    match.probabilities = match.model.probabilities;
    match.probabilities.predictedScore = match.model.predictedScore;
  } else if (status === 'SCHEDULED' && odds.homeWin && odds.draw && odds.awayWin) {
    const invH = 1 / odds.homeWin, invD = 1 / odds.draw, invA = 1 / odds.awayWin;
    const tot = invH + invD + invA;
    const over25P = odds.over25 && odds.under25 ? ((1 / odds.over25) / (1 / odds.over25 + 1 / odds.under25)) * 100 : null;
    match.probabilities = {
      homeWin: (invH / tot) * 100,
      draw: (invD / tot) * 100,
      awayWin: (invA / tot) * 100,
      over25: over25P,
      under25: over25P != null ? 100 - over25P : null,
      bttsYes: null,
      bttsNo: null
    };
  } else {
    match.probabilities = {};
  }
  match.aiPick = buildPick(match);
  return match;
}

function getScoreboardDates() {
  const now = Date.now();
  const fmt = value => new Date(value).toISOString().slice(0, 10).replaceAll('-', '');
  return [-2, -1, 0, 1, 2, 3, 4, 5, 6].map(offset => fmt(now + offset * 86400000));
}
export async function getFootballFeed() {
  const dates = getScoreboardDates();
  const rangeKey = `${dates[0]}-${dates[dates.length - 1]}`;
  const results = await Promise.all(LEAGUES.map(async league => {
    try {
      const [scoreboard, standings] = await Promise.all([
        cachedData(`scoreboard:${league.id}:${rangeKey}`, 60, async () => {
          const urls = [
            `${BASE}/${league.espnCode}/scoreboard?limit=100`,
            ...dates.map(d => `${BASE}/${league.espnCode}/scoreboard?dates=${d}&limit=100`)
          ];
          const responses = await Promise.all(urls.map(u => fetchJson(u).catch(() => null)));
          const valid = responses.filter(r => r && Array.isArray(r.events));
          if (valid.length === 0) throw new Error('Formato del proveedor no reconocido.');

          const eventsMap = new Map();
          let baseLeague = valid[0].leagues;

          for (const resp of valid) {
            if (resp.leagues && !baseLeague) baseLeague = resp.leagues;
            for (const ev of (resp.events || [])) {
              if (ev?.id && !eventsMap.has(ev.id)) {
                eventsMap.set(ev.id, ev);
              }
            }
          }

          return {
            data: {
              events: Array.from(eventsMap.values()),
              leagues: baseLeague
            },
            fetchedAt: new Date().toISOString()
          };
        }),
        standingsFor(league).catch(() => null)
      ]);
      const matches = scoreboard.data.events.map(e => {
        const season = scoreboard.data.leagues?.[0]?.season;
        const sameSeason = standings?.seasonYear != null && (e.season?.year ?? season?.year) === standings.seasonYear;
        const parsed = parseEspnEvent(e, league, sameSeason ? standings.rows : [], scoreboard.fetchedAt, season?.displayName);
        return parsed ? { ...parsed, standingsFetchedAt: sameSeason ? standings.fetchedAt : null } : null;
      }).filter(Boolean).filter(m => {
        // Exclude ancient finished or cancelled matches older than 72 hours from the active feed
        if ((m.status === 'FINISHED' || m.status === 'CANCELLED') && (Date.now() - Date.parse(m.kickoff) > 72 * 3600 * 1000)) {
          return false;
        }
        return true;
      });
      return { matches, coverage: { leagueId: league.id, name: league.name, status: 'available', count: matches.length, fetchedAt: scoreboard.fetchedAt, standingsAvailable: Boolean(standings) } };
    } catch {
      return { matches: [], coverage: { leagueId: league.id, name: league.name, status: 'unavailable', count: 0, fetchedAt: null } };
    }
  }));
  const coverage = results.map(r => r.coverage);
  lastObservation = { source: 'ESPN', scope: 'instance', checkedAt: new Date().toISOString(), providerUpdatedAt: null,
    status: coverage.every(c => c.status === 'unavailable') ? 'unavailable' : coverage.some(c => c.status === 'unavailable' || !c.standingsAvailable) ? 'degraded' : 'available', coverage };
  const order = { LIVE: 0, SCHEDULED: 1, FINISHED: 2 };
  return {
    matches: results.flatMap(r => r.matches).sort((a, b) => ((order[a.status] ?? 3) - (order[b.status] ?? 3)) || Date.parse(a.kickoff) - Date.parse(b.kickoff)),
    coverage: results.map(r => r.coverage), source: 'ESPN', refreshIntervalSeconds: 60,
    notice: 'Feed público de ESPN sin SLA ni cobertura garantizada. Consulta no equivale a actualización del proveedor. Cuotas informativas, confirma su vigencia en la casa de apuestas.'
  };
}
export async function generateMatches() { return (await getFootballFeed()).matches; }
export async function getLeagueStandings(leagueId) {
  const league = LEAGUES.find(l => l.id === leagueId);
  if (!league) throw new Error('Selecciona una liga válida.');
  return standingsFor(league);
}

export function parseSummaryDetails(data, match) {
  const pairs = new Set([match.homeTeamId, match.awayTeamId]);
  const seen = new Set();
  const realH2H = (data.seasonseries || []).filter(s => s.type === 'head-to-head').flatMap(s => s.events || []).flatMap(ev => {
    const competitors = ev.competitors || ev.competitions?.[0]?.competitors || [];
    const home = competitors.find(c => c.homeAway === 'home');
    const away = competitors.find(c => c.homeAway === 'away');
    const h = numberOrNull(home?.score), a = numberOrNull(away?.score);
    const date = ev.date;
    const key = ev.id || `${date}:${home?.id}:${away?.id}`;
    if (!home || !away || !pairs.has(String(home.team?.id || home.id)) || !pairs.has(String(away.team?.id || away.id)) || String(home.team?.id || home.id) === String(away.team?.id || away.id) || h === null || a === null || !Number.isFinite(Date.parse(date)) || Date.parse(date) >= Math.min(Date.parse(match.kickoff), Date.now()) || seen.has(key)) return [];
    // Only completed fixtures belong in historical statistics.
    if (!(ev.statusType?.completed || ev.status?.type?.completed || ev.competitions?.[0]?.status?.type?.completed)) return [];
    seen.add(key);
    const homeName = home.team?.displayName || home.team?.name;
    const awayName = away.team?.displayName || away.team?.name;
    const winner = h > a ? homeName : a > h ? awayName : 'Draw';
    return [{
      id: key,
      date,
      competition: ev.competitionName || ev.leagueName || match.leagueName || 'Oficial',
      home: homeName,
      away: awayName,
      score: `${h} - ${a}`,
      winner,
      btts: h > 0 && a > 0,
      totalGoals: h + a,
      totalCorners: null,
      yellowCards: null,
      totalFouls: null,
      isDirectH2H: true
    }];
  }).sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 10);
  const fields = { fouls: 'foulsCommitted', corners: 'wonCorners', yellowCards: 'yellowCards', redCards: 'redCards', shots: 'totalShots', shotsOnTarget: 'shotsOnTarget', possession: 'possessionPct' };
  const side = id => {
    const box = ['LIVE', 'FINISHED'].includes(match.status)
      ? data.boxscore?.teams?.find(t => String(t.team?.id) === id)
      : null;
    return Object.fromEntries(Object.entries(fields).map(([key, name]) => {
      const s = box?.statistics?.find(v => v.name === name);
      return [key, numberOrNull(s?.value ?? s?.displayValue?.replace('%', ''))];
    }));
  };
  const recentMatches = (data.lastFiveGames || []).map(group => ({
    team: group.team?.displayName || group.team?.name,
    teamId: String(group.team?.id),
    events: (group.events || []).filter(e => Date.parse(e.gameDate || e.date) < Math.min(Date.parse(match.kickoff), Date.now())).map(e => ({
      id: e.id,
      date: e.gameDate || e.date,
      opponent: e.opponent?.displayName || e.opponent?.name,
      opponentLogo: e.opponentLogo || e.opponent?.logo || e.opponent?.logos?.[0]?.href,
      score: e.score ?? (e.homeTeamScore != null && e.awayTeamScore != null ? `${e.homeTeamScore} - ${e.awayTeamScore}` : null),
      result: e.gameResult ?? null,
      atVs: e.atVs || (e.homeAway === 'home' ? 'vs' : '@'),
      competition: e.competitionName || e.leagueName || 'Oficial'
    }))
  }));
  return { realH2H, recentMatches, boxscore: { home: side(match.homeTeamId), away: side(match.awayTeamId) } };
}
export async function enrichMatchWithRealData(match) {
  match = await enrichHistoricalStats(match);
  if (!match.model && match.status !== 'POSTPONED' && match.status !== 'CANCELLED') {
    const computed = poissonModel(match.homeTeam, match.awayTeam);
    if (computed) {
      match.model = computed;
      match.probabilities = computed.probabilities;
      match.probabilities.predictedScore = computed.predictedScore;
    }
  }
  try {
    const details = await cachedData(`summary:${match.id}:${match.status}`, match.status === 'LIVE' ? 60 : 600, async () => {
      const url = `${BASE}/${match.espnCode}/summary?event=${match.espnEventId}`;
      const data = await fetchJson(url);
      return { ...parseSummaryDetails(data, match), rawHeader: data.header, fetchedAt: new Date().toISOString(), sourceUrl: url };
    });

    let updatedLiveScore = match.liveScore;
    let updatedFinalScore = match.finalScore;
    let updatedStatus = match.status;
    let updatedMinute = match.liveMinute;

    const headerComp = details.rawHeader?.competitions?.[0];
    if (headerComp) {
      const s = headerComp.status || {};
      const statusType = s.type || {};
      const statusName = statusType.name || '';
      const exceptional = { STATUS_POSTPONED: 'POSTPONED', STATUS_CANCELED: 'CANCELLED', STATUS_CANCELLED: 'CANCELLED', STATUS_SUSPENDED: 'SUSPENDED', STATUS_ABANDONED: 'ABANDONED', STATUS_DELAYED: 'DELAYED' };
      if (exceptional[statusName]) {
        updatedStatus = exceptional[statusName];
      } else if (statusType.completed) {
        updatedStatus = 'FINISHED';
      } else if (statusType.state === 'in') {
        updatedStatus = 'LIVE';
        updatedMinute = s.displayClock || updatedMinute;
      }
      const hc = headerComp.competitors?.find(c => c.homeAway === 'home' || String(c.id) === match.homeTeamId);
      const ac = headerComp.competitors?.find(c => c.homeAway === 'away' || String(c.id) === match.awayTeamId);
      const hs = numberOrNull(hc?.score);
      const as = numberOrNull(ac?.score);
      if (hs !== null && as !== null) {
        if (updatedStatus === 'LIVE') {
          updatedLiveScore = { home: hs, away: as };
        } else if (updatedStatus === 'FINISHED') {
          updatedFinalScore = { home: hs, away: as };
          updatedLiveScore = { home: hs, away: as };
        }
      }
    }

    const deriveClean = events => {
      if (!Array.isArray(events) || events.length === 0) return null;
      let clean = 0, count = 0;
      for (const e of events) {
        if (!e.score) continue;
        const parts = e.score.split('-').map(s => Number(s.trim()));
        if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
          count++;
          const rivalScore = e.atVs === '@' ? parts[0] : parts[1];
          if (rivalScore === 0) clean++;
        }
      }
      return count > 0 ? Number(((clean / count) * 100).toFixed(1)) : null;
    };

    const homeRecent = details.recentMatches?.find(g => g.teamId === match.homeTeamId || g.team === match.homeTeam?.name);
    const awayRecent = details.recentMatches?.find(g => g.teamId === match.awayTeamId || g.team === match.awayTeam?.name);
    const homeClean = match.homeTeam?.cleanSheetRate ?? deriveClean(homeRecent?.events);
    const awayClean = match.awayTeam?.cleanSheetRate ?? deriveClean(awayRecent?.events);

    return {
      ...match,
      homeTeam: { ...match.homeTeam, cleanSheetRate: homeClean },
      awayTeam: { ...match.awayTeam, cleanSheetRate: awayClean },
      status: updatedStatus,
      liveMinute: updatedMinute,
      liveScore: updatedLiveScore,
      finalScore: updatedFinalScore,
      h2h: details.realH2H,
      recentMatches: details.recentMatches,
      realBoxscore: details.boxscore,
      detailsFetchedAt: details.fetchedAt,
      detailsSourceUrl: details.sourceUrl,
      detailsAvailable: true
    };
  } catch {
    return { ...match, detailsAvailable: false, detailsError: 'El proveedor no entrega detalles en este momento.' };
  }
}
