import { SPORT_LEAGUES } from '../../src/constants/leagues.js';
import { cachedData, fetchJson } from './dataCache.js';
import { americanToDecimal, numberOrNull } from './footballDataService.js';
import { getMlbLeague, getNpbLeague, getKboLeague, enrichNpbInnings } from './baseballDataService.js';
import { analyzeSportMatch, SPORT_MODEL_VERSION } from './sportProbabilityModel.js';
import { readSportsAiReport } from './sportsAiService.js';
import { rankSportWinners } from '../../src/utils/sportPicks.js';
import { isKnownFixture } from '../../src/utils/fixtureEligibility.js';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const shift = (day, amount) => new Date(Date.parse(day) + amount * 86400000).toISOString().slice(0, 10).replaceAll('-', '');
const exceptional = { STATUS_POSTPONED: 'POSTPONED', STATUS_CANCELED: 'CANCELLED', STATUS_CANCELLED: 'CANCELLED', STATUS_SUSPENDED: 'SUSPENDED', STATUS_ABANDONED: 'ABANDONED', STATUS_DELAYED: 'DELAYED' };
export function espnSportStatus(status) {
  return exceptional[status?.type?.name] || (status?.type?.completed ? 'FINISHED' : status?.type?.state === 'in' ? 'LIVE' : status?.type?.state === 'pre' ? 'SCHEDULED' : 'UNKNOWN');
}
export function oddsFor(comp) {
  const data = comp.odds?.[0];
  // Both prices must come from the same snapshot. Mixing one modern quote
  // with the other team's legacy quote can manufacture a false favourite.
  const hasClose = ['home', 'away'].some(side => data?.moneyline?.[side]?.close?.odds != null);
  return {
    odds: Object.fromEntries(['home', 'away'].map(side => [`${side}Win`, americanToDecimal(hasClose ? data?.moneyline?.[side]?.close?.odds : data?.[`${side}TeamOdds`]?.moneyLine)])),
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
        shortName: entry.athlete.shortName || entry.athlete.displayName,
        logo: entry.athlete.headshot?.href || entry.athlete.flag?.href || null,
        flag: entry.athlete.flag?.href || null, country: entry.athlete.flag?.alt || null,
        imageKind: entry.athlete.headshot?.href ? 'portrait' : entry.athlete.flag?.href ? 'country' : null });
      const setScores = Array.from({ length: Math.max(home.linescores?.length || 0, away.linescores?.length || 0) }, (_, i) => ({ home: numberOrNull(home.linescores?.[i]?.value), away: numberOrNull(away.linescores?.[i]?.value) }));
      const wonSets = side => setScores.filter(set => set.home !== null && set.away !== null && set[side] > set[side === 'home' ? 'away' : 'home']
        && ((Math.max(set.home, set.away) >= 6 && Math.abs(set.home - set.away) >= 2) || (Math.max(set.home, set.away) === 7 && Math.min(set.home, set.away) === 6))).length;
      const retired = /retir|walkover|default|aband/i.test([comp.status?.type?.name, comp.status?.type?.description, ...(comp.notes || []).map(note => note.text)].join(' '));
      const qualifying = /qualif/i.test(comp.round?.displayName || '');
      const wimbledonQualifyingFinal = leagueId === 'wimbledon' && qualifying && /final|3rd|third/i.test(comp.round?.displayName || '');
      const maxSets = tour === 'atp' && (wimbledonQualifyingFinal || ['wimbledon', 'australian_open', 'roland_garros', 'us_open'].includes(leagueId) && !qualifying) ? 5 : 3;
      const score = status === 'SCHEDULED' || !setScores.length ? { home: null, away: null } : { home: wonSets('home'), away: wonSets('away') };
      const fixture = {
        id: `espn-tennis-${tour}-${comp.id}`, providerEventId: String(comp.id), sport: 'tenis', tour,
        leagueId, leagueName: league.name, leagueFlag: league.flag, tournamentName: event.name, round: comp.round?.displayName,
        homeTeam: player(home), awayTeam: player(away), kickoff: comp.date, timeTBD: comp.timeValid === false,
        status, statusDetail: comp.status?.type?.shortDetail || status, liveScore: score, finalScore: status === 'FINISHED' ? score : { home: null, away: null },
        setScores, maxSets, retired, venue: comp.venue?.fullName || null, ...oddsFor(comp),
        source: 'ESPN', sourceUrl: `https://www.espn.com/tennis/scoreboard/_/date/${comp.date.slice(0, 10).replaceAll('-', '')}`, fetchedAt
      };
      if (isKnownFixture(fixture)) fixtures.push(fixture);
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

async function getBasketball(today, options = {}) {
  const selectedLeagues = SPORT_LEAGUES.basquetbol.filter(league => !options.leagueId || league.id === options.leagueId);
  return Promise.all([...new Set(selectedLeagues.map(league => league.espnCode))].map(async code => {
    const leagues = selectedLeagues.filter(league => league.espnCode === code);
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
      const preload = options.calendarOnly ? [] : teams.slice(0, 12);
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

export async function getSportsMatch(sport, id, options = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const feed = await getSportsFeed(sport, { leagueId: options.leagueId, calendarOnly: true });
  const match = feed.matches.find(match => match.id === id);
  if (!match) return null;
  return hydrateSportsMatch(sport, match, today, options);
}

async function hydrateSportsMatch(sport, match, today, options = {}, history = null) {
  const version = JSON.stringify([match.status, match.kickoff, match.homeTeam, match.awayTeam, match.liveScore, match.odds]);
  const detail = await cachedData(`sports:detail:v5:${SPORT_MODEL_VERSION}:${sport}:${match.leagueId}:${match.id}:${today}:${version}`, 60,
    async () => loadSportsMatch(sport, match.id, match, history), { forceRefresh: Boolean(options.forceRefresh) });
  const report = await readSportsAiReport(detail);
  return { ...detail, aiReport: report, isAiAnalyzed: Boolean(report?.aiAvailable) };
}

// Batches share the calendar and tennis history instead of reparsing it for every card.
// IDs always resolve against the provider calendar; the browser cannot supply results.
export async function getSportsDetails(sport, ids, options = {}) {
  const feed = await getSportsFeed(sport, { ...options, calendarOnly: true });
  const byId = new Map(feed.matches.map(match => [match.id, match]));
  const selected = ids.map(id => byId.get(id)).filter(Boolean);
  const tours = [...new Set(selected.map(match => match.tour))];
  const history = sport === 'tenis' && selected.length ? (await getSportsHistory(sport, Date.now(), tours.length === 1 ? { leagueId: tours[0] } : {})).games : null;
  const matches = [], errors = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, selected.length) }, async () => {
    while (cursor < selected.length) {
      const match = selected[cursor++];
      try { matches.push(await hydrateSportsMatch(sport, match, new Date().toISOString().slice(0, 10), {}, history)); }
      catch { errors.push({ id: match.id, message: 'No se pudo consultar el historial. Reintenta.' }); }
    }
  }));
  return { matches, errors, unavailableIds: ids.filter(id => !byId.has(id)) };
}

async function loadSportsMatch(sport, id, match, sharedHistory = null) {
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
  if (sport === 'beisbol' && match.leagueId === 'mlb') {
    try {
      // ESPN's MLB calendar uses the Eastern day, rather than the UTC start date.
      const espnDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(match.kickoff));
      const result = await espnScoreboard('baseball/mlb', `dates=${espnDay.replaceAll('-', '')}&limit=100`);
      const quoted = { ...match, ...publishedMlbOdds(match, result.data, result.fetchedAt) };
      const { games } = await getSportsHistory(sport, Date.now(), { leagueId: 'mlb' });
      return { ...quoted, analysis: analyzeSportMatch(quoted, games) };
    } catch { return match; }
  }
  if (sport === 'tenis') {
    const games = sharedHistory || (await getSportsHistory(sport, Date.now(), { leagueId: match.tour })).games;
    return { ...match, analysis: analyzeSportMatch(match, games) };
  }
  if (sport !== 'basquetbol') return match;
  const league = SPORT_LEAGUES.basquetbol.find(league => league.id === match.leagueId);
  const today = new Date().toISOString().slice(0, 10);
  const history = await Promise.all([match.homeTeam, match.awayTeam].map(team => basketballTeamHistory({ teamId: team.id, season: match.season, league }, today)));
  const games = [...new Map(history.flat().map(game => [game.id, game])).values()];
  return { ...match, analysis: analyzeSportMatch(match, games) };
}

export function publishedMlbOdds(match, data, fetchedAt) {
  const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!['home', 'away'].every(side => normalize(match[`${side}Team`]?.name))) return {};
  // Exact home/away names and start time protect doubleheaders and rescheduled games.
  const matching = (data.events || []).filter(event => Math.abs(Date.parse(event.date) - Date.parse(match.kickoff)) <= 60000
    && ['home', 'away'].every(side => normalize(event.competitions?.[0]?.competitors?.find(team => team.homeAway === side)?.team?.displayName) === normalize(match[`${side}Team`]?.name)));
  if (matching.length !== 1) return {};
  const quote = oddsFor(matching[0].competitions[0]);
  if (!Object.values(quote.odds).some(value => value > 1)) return {};
  return { ...quote, oddsSource: 'ESPN', oddsFetchedAt: fetchedAt, oddsSourceUrl: `https://www.espn.com/mlb/game/_/gameId/${matching[0].id}` };
}

export function tennisDateRanges(today, pastDays, futureDays) {
  const start = shift(today, -pastDays), end = shift(today, futureDays), ranges = [];
  for (let year = Number(start.slice(0, 4)); year <= Number(end.slice(0, 4)); year++) {
    ranges.push(`${start > `${year}0101` ? start : `${year}0101`}-${end < `${year}1231` ? end : `${year}1231`}`);
  }
  return ranges;
}

async function tennisCalendar(tour, today) {
  const ranges = tennisDateRanges(today, 3, 7);
  const responses = await Promise.allSettled(ranges.map(range => espnScoreboard(`tennis/${tour}`, `dates=${range}&limit=1000`)));
  const valid = responses.filter(result => result.status === 'fulfilled').map(result => result.value);
  if (!valid.length) throw new Error('Calendario ESPN no disponible.');
  return { matches: valid.flatMap(result => parseTennisEvents(result.data, tour, result.fetchedAt)), fetchedAt: valid[0].fetchedAt, degraded: valid.length < ranges.length };
}

async function getTennis(today, options = {}) {
  const tours = ['atp', 'wta'].filter(tour => !['atp', 'wta'].includes(options.leagueId) || options.leagueId === tour);
  const results = await Promise.all(tours.map(async tour => {
    try {
      const results = await Promise.allSettled([
        options.calendarOnly
          ? tennisCalendar(tour, today)
          : cachedData(`sports:tennis-history:v2:${tour}:${today}`, 1800, async () => {
            // ESPN tennis ranges must stay within a season. A range spanning
            // two years silently returns only the current tournament.
            const ranges = tennisDateRanges(today, 365, 7);
            const responses = await Promise.allSettled(ranges.map(async range => {
              const data = await fetchJson(`${ESPN_BASE}/tennis/${tour}/scoreboard?dates=${range}&limit=1000`);
              if (!Array.isArray(data.events)) throw new Error('Historial ESPN no disponible.');
              return data;
            }));
            const valid = responses.filter(result => result.status === 'fulfilled');
            if (!valid.length) throw new Error('Historial ESPN no disponible.');
            const fetchedAt = new Date().toISOString();
            return { matches: valid.flatMap(result => parseTennisEvents(result.value, tour, fetchedAt)), fetchedAt, degraded: valid.length < ranges.length };
          }),
        espnScoreboard(`tennis/${tour}`, '')
      ]);
      const valid = results.filter(result => result.status === 'fulfilled').map(result => result.value);
      if (!valid.length) throw new Error('ESPN no disponible.');
      return { tour, matches: valid.flatMap(result => result.matches || parseTennisEvents(result.data, tour, result.fetchedAt)), fetchedAt: valid[0].fetchedAt, available: true,
        degraded: valid.length < results.length || valid.some(result => result.degraded) };
    } catch { return { tour, matches: [], available: false, fetchedAt: null }; }
  }));
  return [{ matches: results.flatMap(result => result.matches), coverage: SPORT_LEAGUES.tenis.filter(league => !options.leagueId || options.leagueId === league.id).map(league => {
    const relevant = ['atp', 'wta'].includes(league.id) ? results.filter(result => result.tour === league.id) : results;
    return { leagueId: league.id, name: league.name, source: 'ESPN', status: relevant.every(result => !result.available) ? 'unavailable' : relevant.some(result => !result.available || result.degraded) ? 'degraded' : 'available', fetchedAt: relevant.find(result => result.available)?.fetchedAt || null };
  }) }];
}

async function getBaseball(today, now, options = {}) {
  const asiaDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  return Promise.all(SPORT_LEAGUES.beisbol.filter(league => !options.leagueId || options.leagueId === league.id).map(async league => {
    try {
      const loader = league.provider === 'npb' ? getNpbLeague : league.provider === 'kbo' ? getKboLeague : getMlbLeague;
      const result = await loader(league, ['npb', 'kbo'].includes(league.id) ? asiaDay : today);
      if (league.id === 'mlb') {
        const dateFor = match => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(match.kickoff)).replaceAll('-', '');
        const visible = result.matches.filter(match => ['SCHEDULED', 'LIVE'].includes(match.status) && Date.parse(match.kickoff) >= now - 72 * 3600000 && Date.parse(match.kickoff) <= now + 8 * 86400000);
        const dates = [...new Set(visible.map(dateFor))];
        const snapshots = new Map();
        // Calendar, ranking and detail must all use the same published winner.
        const responses = await Promise.allSettled(dates.map(async date => {
          const quotes = await espnScoreboard('baseball/mlb', `dates=${date}&limit=100`);
          return { date, quotes };
        }));
        for (const response of responses) if (response.status === 'fulfilled') snapshots.set(response.value.date, response.value.quotes);
        const ids = new Set(visible.map(match => match.id));
        result.matches = result.matches.map(match => {
          const snapshot = ids.has(match.id) ? snapshots.get(dateFor(match)) : null;
          return snapshot ? { ...match, ...publishedMlbOdds(match, snapshot.data, snapshot.fetchedAt) } : match;
        });
      }
      return { matches: result.matches, coverage: [{ leagueId: league.id, name: league.name, source: result.source, status: result.degraded ? 'degraded' : 'available', fetchedAt: result.fetchedAt }] };
    } catch { return { matches: [], coverage: [{ leagueId: league.id, name: league.name, source: league.provider === 'npb' ? 'NPB oficial' : league.provider === 'kbo' ? 'KBO oficial' : 'MLB Stats API', status: 'unavailable', fetchedAt: null }] }; }
  }));
}

export async function getSportsHistory(sport, now = Date.now(), options = {}) {
  if (!Object.hasOwn(SPORT_LEAGUES, sport)) throw new Error('Deporte no válido.');
  const today = new Date(now).toISOString().slice(0, 10);
  if (options.leagueId && !SPORT_LEAGUES[sport].some(league => league.id === options.leagueId)) throw new Error('Liga no válida.');
  const results = await (sport === 'tenis' ? getTennis(today, options) : sport === 'basquetbol' ? getBasketball(today, options) : getBaseball(today, now, options));
  return { games: [...new Map(results.flatMap(result => result.matches).map(match => [match.id, match])).values()], coverage: results.flatMap(result => result.coverage) };
}

// Rank every eligible upcoming fixture, independently of cards opened by the user.
export async function getSportsBankerCandidates(sport, options = {}) {
  if (!Object.hasOwn(SPORT_LEAGUES, sport)) throw new Error('Deporte no válido.');
  const now = Date.now(), today = new Date(now).toISOString().slice(0, 10);
  return cachedData(`sports:banker-pool:v2:${SPORT_MODEL_VERSION}:${sport}:${options.leagueId || 'all'}:${today}`, 60, async () => {
    const { games, coverage } = await getSportsHistory(sport, now, { ...options, calendarOnly: sport !== 'tenis' });
    if (coverage.every(league => league.status === 'unavailable')) throw new Error('Calendarios no disponibles para calcular Banqueros.');
    const candidates = games.filter(match => match.status === 'SCHEDULED' && Date.parse(match.kickoff) > now && Date.parse(match.kickoff) <= now + 8 * 86400000
      && (!options.leagueId || match.leagueId === options.leagueId));
    const matches = candidates.map(match => ({ ...match, analysis: analyzeSportMatch(match, games, now) }));
    if (sport === 'basquetbol') {
      const missing = matches.filter(match => !Number.isFinite(match.analysis.winner.home));
      let cursor = 0;
      const deadline = Date.now() + 40000;
      await Promise.all(Array.from({ length: Math.min(3, missing.length) }, async () => {
        while (cursor < missing.length) {
          if (Date.now() > deadline) throw new Error('El ranking todavía no pudo completar los historiales. Reintenta para continuar la consulta.');
          const original = missing[cursor++];
          const detail = await getSportsMatch(sport, original.id, { leagueId: original.leagueId });
          if (detail) matches[matches.findIndex(match => match.id === original.id)] = detail;
        }
      }));
    }
    return { sport, matches, coverage, ranking: { examined: candidates.length, available: rankSportWinners(matches, now, Infinity).length } };
  });
}

export async function getSportsFeed(sport, options = {}) {
  if (!Object.hasOwn(SPORT_LEAGUES, sport)) throw new Error('Deporte no válido.');
  if (options.leagueId && !SPORT_LEAGUES[sport].some(league => league.id === options.leagueId)) throw new Error('Liga no válida.');
  const now = options.now ?? Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  return cachedData(`sports:feed:v5:${SPORT_MODEL_VERSION}:${sport}:${today}:${options.leagueId || 'all'}:${options.calendarOnly ? 'calendar' : 'full'}`, 15, async () => {
    const { games, coverage: sourceCoverage } = await getSportsHistory(sport, now, options);
    const order = { LIVE: 0, SCHEDULED: 1, FINISHED: 2 };
    const matches = games.filter(match => {
      const date = Date.parse(match.kickoff);
      return (!options.leagueId || match.leagueId === options.leagueId) && date >= now - 72 * 3600000 && date <= now + 8 * 86400000;
    }).map(match => ({ ...match, analysis: analyzeSportMatch(match, options.calendarOnly && sport === 'tenis' ? [] : games, now) }))
      .sort((a, b) => ((order[a.status] ?? 3) - (order[b.status] ?? 3)) || Date.parse(a.kickoff) - Date.parse(b.kickoff));
    const coverage = sourceCoverage.map(league => ({ ...league, count: matches.filter(match => match.leagueId === league.leagueId).length }));
    return { sport, matches, coverage, source: sport === 'beisbol' ? 'MLB / NPB / KBO' : 'ESPN', refreshIntervalSeconds: 60,
      notice: 'Calendarios del proveedor y estimaciones estadísticas previas al partido. N/D indica falta de datos suficientes.' };
  }, { forceRefresh: Boolean(options.forceRefresh) });
}
