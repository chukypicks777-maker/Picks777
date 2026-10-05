import { SPORT_LEAGUES } from '../../src/constants/leagues.js';
import { cachedData, fetchJson } from './dataCache.js';
import { americanToDecimal, numberOrNull } from './footballDataService.js';
import { getMlbLeague, getNpbLeague, getKboLeague, enrichNpbInnings } from './baseballDataService.js';
import { analyzeSportMatch } from './sportProbabilityModel.js';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const shift = (day, amount) => new Date(Date.parse(day) + amount * 86400000).toISOString().slice(0, 10).replaceAll('-', '');
const exceptional = { STATUS_POSTPONED: 'POSTPONED', STATUS_CANCELED: 'CANCELLED', STATUS_CANCELLED: 'CANCELLED', STATUS_SUSPENDED: 'SUSPENDED', STATUS_ABANDONED: 'ABANDONED', STATUS_DELAYED: 'DELAYED' };
export function espnSportStatus(status) {
  return exceptional[status?.type?.name] || (status?.type?.completed ? 'FINISHED' : status?.type?.state === 'in' ? 'LIVE' : status?.type?.state === 'pre' ? 'SCHEDULED' : 'UNKNOWN');
}
function oddsFor(comp) {
  const data = comp.odds?.[0];
  return {
    odds: Object.fromEntries(['home', 'away'].map(side => [`${side}Win`, americanToDecimal(data?.moneyline?.[side]?.close?.odds ?? data?.[`${side}TeamOdds`]?.moneyLine)])),
    oddsProvider: data?.provider?.name || null
  };
}

export function parseBasketballEvent(event, leagues = SPORT_LEAGUES.basquetbol, fetchedAt = new Date().toISOString()) {
  const comp = event.competitions?.[0];
  const home = comp?.competitors?.find(team => team.homeAway === 'home'), away = comp?.competitors?.find(team => team.homeAway === 'away');
  if (!home?.team?.id || !away?.team?.id || !event.id || !Number.isFinite(Date.parse(event.date))) return null;
  const league = leagues.find(item => item.espnCode !== 'nba' || Boolean(item.preseason) === (event.season?.type === 1 || event.seasonType?.type === 1 || event.season?.slug === 'preseason'));
  if (!league) return null;
  const status = espnSportStatus(comp.status || event.status);
  const team = entry => ({ id: String(entry.team.id), name: entry.team.displayName || entry.team.name,
    shortName: entry.team.abbreviation || entry.team.shortDisplayName || entry.team.name, logo: entry.team.logo || entry.team.logos?.[0]?.href });
  const score = { home: status === 'SCHEDULED' ? null : numberOrNull(home.score), away: status === 'SCHEDULED' ? null : numberOrNull(away.score) };
  return {
    id: `espn-${league.id}-${event.id}`, providerEventId: String(event.id), sport: 'basquetbol',
    leagueId: league.id, leagueName: league.name, leagueFlag: league.flag,
    homeTeam: team(home), awayTeam: team(away), kickoff: event.date, timeTBD: comp.timeValid === false,
    status, statusDetail: (comp.status || event.status)?.type?.shortDetail || status,
    liveScore: score, finalScore: status === 'FINISHED' ? score : { home: null, away: null },
    venue: comp.venue?.fullName || null, season: event.season?.year, ...oddsFor(comp), source: 'ESPN', fetchedAt,
    sourceUrl: `https://www.espn.com/${league.espnCode === 'womens-college-basketball' ? 'womens-college-basketball' : league.espnCode}/game/_/gameId/${event.id}`
  };
}

export function tennisLeague(tournamentName, tour) {
  if (/wimbledon/i.test(tournamentName)) return 'wimbledon';
  if (/australian open/i.test(tournamentName)) return 'australian_open';
  if (/roland garros|french open/i.test(tournamentName)) return 'roland_garros';
  if (/^(the )?(us|u\.s\.) open$/i.test(tournamentName.trim())) return 'us_open';
  return tour;
}

export function parseTennisEvents(data, tour, fetchedAt = new Date().toISOString()) {
  const fixtures = [];
  for (const event of data.events || []) for (const group of event.groupings || []) {
    if (group.grouping?.slug !== (tour === 'atp' ? 'mens-singles' : 'womens-singles')) continue;
    const leagueId = tennisLeague(event.name || '', tour);
    const league = SPORT_LEAGUES.tenis.find(item => item.id === leagueId);
    for (const comp of group.competitions || []) {
      const home = comp.competitors?.find(player => player.homeAway === 'home') || comp.competitors?.[0];
      const away = comp.competitors?.find(player => player.homeAway === 'away') || comp.competitors?.[1];
      if (comp.competitors?.length !== 2 || !home?.athlete?.displayName || !away?.athlete?.displayName || !home.id || !away.id || !comp.id || !Number.isFinite(Date.parse(comp.date))) continue;
      const status = espnSportStatus(comp.status);
      const player = entry => ({ id: `${tour}-${entry.id}`, name: entry.athlete.displayName,
        shortName: entry.athlete.shortName || entry.athlete.displayName, logo: entry.athlete.headshot?.href || null });
      const setScores = Array.from({ length: Math.max(home.linescores?.length || 0, away.linescores?.length || 0) }, (_, i) => ({ home: numberOrNull(home.linescores?.[i]?.value), away: numberOrNull(away.linescores?.[i]?.value) }));
      const wonSets = side => setScores.filter(set => set.home !== null && set.away !== null && set[side] > set[side === 'home' ? 'away' : 'home']
        && ((Math.max(set.home, set.away) >= 6 && Math.abs(set.home - set.away) >= 2) || (Math.max(set.home, set.away) === 7 && Math.min(set.home, set.away) === 6))).length;
      const retired = /retir|walkover|default|aband/i.test([comp.status?.type?.name, comp.status?.type?.description, ...(comp.notes || []).map(note => note.text)].join(' '));
      const qualifying = /qualif/i.test(comp.round?.displayName || '');
      const wimbledonQualifyingFinal = leagueId === 'wimbledon' && qualifying && /final|3rd|third/i.test(comp.round?.displayName || '');
      const maxSets = tour === 'atp' && (wimbledonQualifyingFinal || ['wimbledon', 'australian_open', 'roland_garros', 'us_open'].includes(leagueId) && !qualifying) ? 5 : 3;
      const score = status === 'SCHEDULED' || !setScores.length ? { home: null, away: null } : { home: wonSets('home'), away: wonSets('away') };
      fixtures.push({
        id: `espn-tennis-${tour}-${comp.id}`, providerEventId: String(comp.id), sport: 'tenis', tour,
        leagueId, leagueName: league.name, leagueFlag: league.flag, tournamentName: event.name, round: comp.round?.displayName,
        homeTeam: player(home), awayTeam: player(away), kickoff: comp.date, timeTBD: comp.timeValid === false,
        status, statusDetail: comp.status?.type?.shortDetail || status, liveScore: score, finalScore: status === 'FINISHED' ? score : { home: null, away: null },
        setScores, maxSets, retired, venue: comp.venue?.fullName || null, ...oddsFor(comp),
        source: 'ESPN', sourceUrl: `https://www.espn.com/tennis/scoreboard/_/date/${comp.date.slice(0, 10).replaceAll('-', '')}`, fetchedAt
      });
    }
  }
  return fixtures;
}

async function espnScoreboard(path, query) {
  const url = `${ESPN_BASE}/${path}/scoreboard${query ? `?${query}` : ''}`;
  return cachedData(`sports:espn:${path}:${query}`, 60, async () => {
    const data = await fetchJson(url);
    if (!Array.isArray(data.events)) throw new Error('Formato ESPN no reconocido.');
    return { data, fetchedAt: new Date().toISOString() };
  });
}

async function basketballTeamHistory(entry, today) {
  const code = entry.league.espnCode;
  const fallbackSeason = Number(today.slice(0, 4)) + (code === 'wnba' || Number(today.slice(5, 7)) < 7 ? 0 : 1);
  const season = entry.season || fallbackSeason;
  const years = entry.league.preseason ? [season, season - 1, season - 2] : [season, season - 1];
  const schedules = await Promise.allSettled(years.map(year => cachedData(`sports:team-schedule:${code}:${entry.teamId}:${year}:${entry.league.id}`, 1800, async () => {
    const data = await fetchJson(`${ESPN_BASE}/basketball/${code}/teams/${entry.teamId}/schedule?season=${year}${entry.league.preseason ? '&seasontype=1' : ''}`);
    if (!Array.isArray(data.events)) throw new Error('Historial no disponible.');
    return { data, fetchedAt: new Date().toISOString() };
  })));
  return schedules.filter(result => result.status === 'fulfilled').flatMap(result => result.value.data.events.map(event => parseBasketballEvent(event, [entry.league], result.value.fetchedAt))).filter(Boolean);
}

async function getBasketball(today) {
  return Promise.all(['nba', 'wnba', 'womens-college-basketball'].map(async code => {
    const leagues = SPORT_LEAGUES.basquetbol.filter(league => league.espnCode === code);
    try {
      // Basketball scoreboards accept individual dates, unlike tennis's ranges.
      const responses = await Promise.allSettled([
        ...Array.from({ length: 10 }, (_, i) => espnScoreboard(`basketball/${code}`, `dates=${shift(today, i - 2)}&limit=100`)),
        espnScoreboard(`basketball/${code}`, '')
      ]);
      const valid = responses.filter(result => result.status === 'fulfilled').map(result => result.value);
      if (!valid.length) throw new Error('ESPN no disponible.');
      const current = valid.flatMap(result => result.data.events.map(event => parseBasketballEvent(event, leagues, result.fetchedAt))).filter(Boolean);
      const teams = [...new Map(current.flatMap(match => [match.homeTeam, match.awayTeam].map(team => [
        `${match.leagueId}:${team.id}:${match.season}`,
        { teamId: team.id, league: leagues.find(league => league.id === match.leagueId), season: match.season }
      ]))).values()];
      const history = [];
      // Bound cold feed work, especially NCAA's hundreds of teams. Every other
      // fixture gets its own two-team history when its report is opened.
      const preload = teams.slice(0, 12);
      for (let i = 0; i < preload.length; i += 6) {
        const batch = await Promise.allSettled(preload.slice(i, i + 6).map(entry => basketballTeamHistory(entry, today)));
        history.push(...batch.filter(result => result.status === 'fulfilled').flatMap(result => result.value));
      }
      return { matches: [...history, ...current], coverage: leagues.map(league => ({ leagueId: league.id, name: league.name, source: 'ESPN', status: responses.some(result => result.status === 'rejected') ? 'degraded' : 'available', fetchedAt: valid[0].fetchedAt })) };
    } catch {
      return { matches: [], coverage: leagues.map(league => ({ leagueId: league.id, name: league.name, source: 'ESPN', status: 'unavailable', fetchedAt: null })) };
    }
  }));
}

export async function getSportsMatch(sport, id) {
  const feed = await getSportsFeed(sport);
  const match = feed.matches.find(match => match.id === id);
  if (!match) return null;
  if (sport === 'beisbol' && match.leagueId === 'npb') {
    const league = SPORT_LEAGUES.beisbol.find(league => league.id === 'npb');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const data = await getNpbLeague(league, today);
    const prior = data.matches.filter(game => game.id !== id && game.status === 'FINISHED' && Date.parse(game.kickoff) < Math.min(Date.now(), Date.parse(match.kickoff)))
      .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff));
    const selected = [...new Map([match.homeTeam, match.awayTeam].flatMap(team => prior.filter(game => [game.homeTeam.id, game.awayTeam.id].includes(team.id)).slice(0, 15)).map(game => [game.id, game])).values()];
    const verified = await enrichNpbInnings(selected);
    // Retain the full scoring sample and attach innings only where verified.
    const enriched = new Map(verified.map(game => [game.id, game]));
    const games = data.matches.map(game => enriched.get(game.id) || game);
    return { ...match, analysis: analyzeSportMatch(match, games) };
  }
  if (sport !== 'basquetbol') return match;
  const league = SPORT_LEAGUES.basquetbol.find(league => league.id === match.leagueId);
  const today = new Date().toISOString().slice(0, 10);
  const history = await Promise.all([match.homeTeam, match.awayTeam].map(team => basketballTeamHistory({ teamId: team.id, season: match.season, league }, today)));
  const games = [...new Map(history.flat().map(game => [game.id, game])).values()];
  return { ...match, analysis: analyzeSportMatch(match, games) };
}

async function getTennis(today) {
  const results = await Promise.all(['atp', 'wta'].map(async tour => {
    try {
      const results = await Promise.allSettled([
        espnScoreboard(`tennis/${tour}`, `dates=${shift(today, -60)}-${shift(today, 7)}&limit=100`),
        espnScoreboard(`tennis/${tour}`, '')
      ]);
      const valid = results.filter(result => result.status === 'fulfilled').map(result => result.value);
      if (!valid.length) throw new Error('ESPN no disponible.');
      return { matches: valid.flatMap(result => parseTennisEvents(result.data, tour, result.fetchedAt)), fetchedAt: valid[0].fetchedAt, available: true };
    } catch { return { matches: [], available: false, fetchedAt: null }; }
  }));
  return [{ matches: results.flatMap(result => result.matches), coverage: SPORT_LEAGUES.tenis.map(league => {
    const relevant = ['atp', 'wta'].includes(league.id) ? [results[league.id === 'atp' ? 0 : 1]] : results;
    return { leagueId: league.id, name: league.name, source: 'ESPN', status: relevant.every(result => !result.available) ? 'unavailable' : relevant.some(result => !result.available) ? 'degraded' : 'available', fetchedAt: relevant.find(result => result.available)?.fetchedAt || null };
  }) }];
}

async function getBaseball(today, now) {
  const asiaDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  return Promise.all(SPORT_LEAGUES.beisbol.map(async league => {
    try {
      const loader = league.provider === 'npb' ? getNpbLeague : league.provider === 'kbo' ? getKboLeague : getMlbLeague;
      const result = await loader(league, ['npb', 'kbo'].includes(league.id) ? asiaDay : today);
      return { matches: result.matches, coverage: [{ leagueId: league.id, name: league.name, source: result.source, status: result.degraded ? 'degraded' : 'available', fetchedAt: result.fetchedAt }] };
    } catch { return { matches: [], coverage: [{ leagueId: league.id, name: league.name, source: league.provider === 'npb' ? 'NPB oficial' : league.provider === 'kbo' ? 'KBO oficial' : 'MLB Stats API', status: 'unavailable', fetchedAt: null }] }; }
  }));
}

export async function getSportsHistory(sport, now = Date.now()) {
  if (!Object.hasOwn(SPORT_LEAGUES, sport)) throw new Error('Deporte no válido.');
  const today = new Date(now).toISOString().slice(0, 10);
  const results = await (sport === 'tenis' ? getTennis(today) : sport === 'basquetbol' ? getBasketball(today) : getBaseball(today, now));
  return { games: [...new Map(results.flatMap(result => result.matches).map(match => [match.id, match])).values()], coverage: results.flatMap(result => result.coverage) };
}

export async function getSportsFeed(sport, options = {}) {
  if (!Object.hasOwn(SPORT_LEAGUES, sport)) throw new Error('Deporte no válido.');
  const now = options.now ?? Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  return cachedData(`sports:feed:v3:${sport}:${today}`, 15, async () => {
    const { games, coverage: sourceCoverage } = await getSportsHistory(sport, now);
    const order = { LIVE: 0, SCHEDULED: 1, FINISHED: 2 };
    const matches = games.filter(match => {
      const date = Date.parse(match.kickoff);
      return date >= now - 72 * 3600000 && date <= now + 8 * 86400000;
    }).map(match => ({ ...match, analysis: analyzeSportMatch(match, games, now) }))
      .sort((a, b) => ((order[a.status] ?? 3) - (order[b.status] ?? 3)) || Date.parse(a.kickoff) - Date.parse(b.kickoff));
    const coverage = sourceCoverage.map(league => ({ ...league, count: matches.filter(match => match.leagueId === league.leagueId).length }));
    return { sport, matches, coverage, source: sport === 'beisbol' ? 'MLB / NPB / KBO' : 'ESPN', refreshIntervalSeconds: 60,
      notice: 'Calendarios del proveedor y estimaciones estadísticas previas al partido. N/D indica falta de datos suficientes.' };
  }, { forceRefresh: Boolean(options.forceRefresh) });
}
