import { cachedData, fetchJson } from './dataCache.js';

const MLB_BASE = 'https://statsapi.mlb.com/api/v1';
const KBO_URL = 'https://eng.koreabaseball.com/Schedule/dailyschedule.aspx';
const number = value => value != null && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const text = html => html.replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'))?.[1] || '';
const dateString = date => new Date(date).toISOString().slice(0, 10);
const shiftDay = (date, offset) => dateString(Date.parse(date) + offset * 86400000);

async function fetchHtml(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Calendario oficial no disponible.');
  return response.text();
}

function fixture(league, data, fetchedAt) {
  return {
    ...data, sport: 'beisbol', leagueId: league.id, leagueName: league.name, leagueFlag: league.flag,
    allowsDraw: Boolean(league.allowsDraw), fetchedAt, odds: {},
    finalScore: data.status === 'FINISHED' ? data.liveScore : { home: null, away: null }
  };
}

export function parseMlbGame(game, league, fetchedAt = new Date().toISOString()) {
  if (!game.gamePk || !game.teams?.home?.team?.id || !game.teams?.away?.team?.id || !Number.isFinite(Date.parse(game.gameDate))) return null;
  const detail = game.status?.detailedState || '';
  const status = /postponed/i.test(detail) ? 'POSTPONED' : /cancel/i.test(detail) ? 'CANCELLED'
    : /suspend/i.test(detail) ? 'SUSPENDED' : /delay/i.test(detail) ? 'DELAYED'
    : game.status?.abstractGameState === 'Final' ? 'FINISHED' : game.status?.abstractGameState === 'Live' ? 'LIVE' : 'SCHEDULED';
  const team = side => ({ id: String(game.teams[side].team.id), name: game.teams[side].team.name,
    shortName: game.teams[side].team.abbreviation || game.teams[side].team.name,
    logo: `https://www.mlbstatic.com/team-logos/${game.teams[side].team.id}.svg` });
  return fixture(league, {
    id: `mlb-${league.id}-${game.gamePk}`, providerEventId: String(game.gamePk), kickoff: game.gameDate,
    timeTBD: Boolean(game.status?.startTimeTBD), status, statusDetail: detail,
    homeTeam: team('home'), awayTeam: team('away'),
    liveScore: { home: status === 'SCHEDULED' ? null : number(game.teams.home.score), away: status === 'SCHEDULED' ? null : number(game.teams.away.score) },
    venue: game.venue?.name || null, season: game.season,
    source: 'MLB Stats API', sourceUrl: league.id === 'lmb' ? `https://www.milb.com/gameday/${game.gamePk}` : `https://www.mlb.com/gameday/${game.gamePk}`,
    scheduledInnings: number(game.scheduledInnings ?? game.linescore?.scheduledInnings),
    lastInning: number(game.linescore?.currentInning),
    inningScores: (game.linescore?.innings || []).map(inning => ({ num: number(inning.num), home: number(inning.home?.runs), away: number(inning.away?.runs) })),
    liveSupported: true
  }, fetchedAt);
}

export async function getMlbLeague(league, today) {
  const url = `${MLB_BASE}/schedule?sportId=${league.sportId}${league.leagueId ? `&leagueId=${league.leagueId}` : ''}&startDate=${shiftDay(today, -45)}&endDate=${shiftDay(today, 7)}&hydrate=linescore`;
  const data = await cachedData(`sports:baseball:v2:${league.id}:${today}`, 60, async () => {
    const schedule = await fetchJson(url);
    if (!Array.isArray(schedule.dates)) throw new Error('Formato de calendario no reconocido.');
    return { schedule, fetchedAt: new Date().toISOString() };
  });
  return { matches: data.schedule.dates.flatMap(day => day.games || []).map(game => parseMlbGame(game, league, data.fetchedAt)).filter(Boolean), fetchedAt: data.fetchedAt, source: 'MLB Stats API' };
}

export function parseNpbSchedule(html, league, day, fetchedAt = new Date().toISOString()) {
  // Some missing dates redirect to the most recent schedule. Do not relabel it.
  const canonicalDay = html.match(/og:url[^>]+gm(\d{8})\.html/)?.[1];
  if (canonicalDay && canonicalDay !== day.replaceAll('-', '')) return [];
  if (!html.includes('the_game_on_day')) throw new Error('Formato NPB no reconocido.');
  return [...html.matchAll(/<(?:a|span)\b([^>]*\bclass="link_box"[^>]*)>([\s\S]*?)<\/(?:a|span)>/gi)].flatMap((block, index) => {
    const names = [...block[2].matchAll(/class="team_name"[^>]*>([^<]*)</g)].map(match => text(match[1]));
    const logos = [...block[2].matchAll(/<img[^>]+src="([^"]*logo_(\w+)_l\.gif)"/g)];
    if (names.length !== 2 || logos.length !== 2) return [];
    const scores = [...block[2].matchAll(/class="score_text score_\w+"[^>]*>([\s\S]*?)<\/div>/g)].map(match => number(text(match[1])));
    const round = text(block[2].match(/class="round"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '');
    const time = round.match(/\b(\d{1,2}):(\d{2})\b/);
    const href = attr(block[1], 'href');
    const cancelled = /cancel|postpon|中止/i.test(round + text(block[2]));
    const kickoff = new Date(`${day}T${time ? `${time[1].padStart(2, '0')}:${time[2]}` : '12:00'}:00+09:00`).toISOString();
    const status = cancelled ? 'CANCELLED' : href && scores.every(score => score !== null) && scores.length === 2 ? 'FINISHED' : Date.parse(kickoff) < Date.parse(fetchedAt) && time ? 'UNKNOWN' : 'SCHEDULED';
    const team = side => ({ id: `npb-${logos[side][2]}`, name: names[side], shortName: names[side], logo: new URL(logos[side][1], 'https://npb.jp').href });
    return [fixture(league, {
      id: `npb-${day}-${logos[0][2]}-${logos[1][2]}-${index}`, kickoff, timeTBD: !time, liveSupported: false,
      homeTeam: team(0), awayTeam: team(1), liveScore: { home: status === 'FINISHED' ? scores[0] : null, away: status === 'FINISHED' ? scores[1] : null },
      status, statusDetail: status === 'FINISHED' ? 'Finalizado' : status === 'CANCELLED' ? 'Cancelado' : status === 'UNKNOWN' ? 'Estado pendiente del proveedor' : 'Programado', venue: round.replace(/\d{1,2}:\d{2}|Game \d+/g, '').trim() || null,
      source: 'NPB oficial', sourceUrl: href ? new URL(href, 'https://npb.jp').href : `https://npb.jp/bis/eng/${day.slice(0, 4)}/games/gm${day.replaceAll('-', '')}.html`
    }, fetchedAt)];
  });
}

export async function getNpbLeague(league, today) {
  const days = [...Array.from({ length: 10 }, (_, i) => shiftDay(today, i - 2)), ...Array.from({ length: 19 }, (_, i) => shiftDay(today, i - 21))];
  const results = [];
  const deadline = Date.now() + 22000;
  // Bound the load on the official HTML service; completed dates get a longer TTL.
  for (let i = 0; i < days.length; i += 5) {
    if (Date.now() >= deadline) break;
    const batch = await Promise.all(days.slice(i, i + 5).map(async day => {
      try {
        return await cachedData(`sports:npb:v2:${day}`, day < today ? 3600 : 60, async () => {
          const html = await fetchHtml(`https://npb.jp/bis/eng/${day.slice(0, 4)}/games/gm${day.replaceAll('-', '')}.html`);
          const fetchedAt = new Date().toISOString();
          return { matches: parseNpbSchedule(html, league, day, fetchedAt), fetchedAt };
        });
      } catch { return null; }
    }));
    results.push(...batch.filter(Boolean));
  }
  if (!results.length) throw new Error('NPB no disponible.');
  return { matches: results.flatMap(result => result.matches), fetchedAt: results.slice(0, 10).map(result => result.fetchedAt).sort()[0], source: 'NPB oficial', degraded: results.length < days.length };
}

export function parseNpbInnings(html, match) {
  const canonical = html.match(/property="og:url"[^>]*content="([^"]+)"/)?.[1];
  if (!canonical || new URL(canonical).pathname !== new URL(match.sourceUrl).pathname) return null;
  const codes = [...html.matchAll(/class="flagdetails"[^>]*src="[^"]*flag\d+_(\w+)_1l\.gif"/g)].map(m => `npb-${m[1]}`);
  // The headline flags are sorted by winner, not consistently by home/away.
  if (codes.length !== 2 || !codes.includes(match.awayTeam.id) || !codes.includes(match.homeTeam.id)) return null;
  const rows = [...html.matchAll(/<tr><td class="gmscoreteam">[\s\S]*?<\/tr>/g)];
  if (rows.length !== 2) return null;
  const normalize = value => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const names = rows.map(row => normalize(text(row[0].match(/class="gmscoreteam">([^<]+)/)?.[1] || '')));
  if (match.awayTeam.name && names[0] !== normalize(match.awayTeam.name) || match.homeTeam.name && names[1] !== normalize(match.homeTeam.name)) return null;
  const read = row => [...row[0].matchAll(/<td\b[^>]*class="gmscore"[^>]*>([\s\S]*?)<\/td>/g)].map(m => {
    const value = text(m[1]); return /^\d+x?$/i.test(value) ? Number(value.replace(/x/i, '')) : null;
  });
  const away = read(rows[0]), home = read(rows[1]);
  if (away.length < 9 || home.length !== away.length || away.at(-3) !== match.finalScore.away || home.at(-3) !== match.finalScore.home) return null;
  const innings = away.slice(0, -4).map((runs, i) => ({ num: i + 1, away: runs, home: home[i] }));
  if (['home', 'away'].some(side => innings.reduce((sum, inning) => sum + (inning[side] ?? 0), 0) !== match.finalScore[side])) return null;
  return innings;
}

export async function enrichNpbInnings(games) {
  const result = [];
  const deadline = Date.now() + 18000;
  for (let i = 0; i < games.length; i += 6) {
    if (Date.now() >= deadline) { result.push(...games.slice(i)); break; }
    const batch = await Promise.all(games.slice(i, i + 6).map(async game => {
      try {
        const observation = await cachedData(`sports:npb-innings:v1:${game.id}`, 21600, async () => {
          const innings = parseNpbInnings(await fetchHtml(game.sourceUrl), game);
          if (!innings) throw new Error('Innings no verificados.');
          return { innings, fetchedAt: new Date().toISOString() };
        });
        return { ...game, inningScores: observation.innings, inningsFetchedAt: observation.fetchedAt };
      } catch { return game; }
    }));
    result.push(...batch);
  }
  return result;
}

export function parseKboSchedule(html, league, fetchedAt = new Date().toISOString()) {
  const month = html.match(/lblGameMonth"[^>]*>\s*(\d{4})\.(\d{2})/);
  const table = html.match(/<table\b[^>]*summary="schdule"[^>]*>([\s\S]*?)<\/table>/i)?.[1];
  if (!month || !table) throw new Error('Formato KBO no reconocido.');
  let day = null;
  return [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].flatMap((row, index) => {
    const dateCell = row[1].match(/<td\b[^>]*title="DATE"[^>]*>([\s\S]*?)<\/td>/i)?.[1];
    if (dateCell) { const date = text(dateCell).match(/(\d{2})\.(\d{2})/); day = date ? `${month[1]}-${date[1]}-${date[2]}` : null; }
    const away = text(row[1].match(/<td\b[^>]*class="loop_r"[^>]*>([\s\S]*?)<\/td>/i)?.[1] || '');
    const home = text(row[1].match(/<td\b[^>]*class="loop_l"[^>]*>([\s\S]*?)<\/td>/i)?.[1] || '');
    if (!day || !home || !away) return [];
    const score = text(row[1].match(/class="score_schedule"[^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
    const values = score.match(/^(\d+)\s*:\s*(\d+)$/);
    const time = text(row[1].match(/class="TIME"[^>]*>([\s\S]*?)<\/td>/i)?.[1] || '').match(/(\d{1,2}):(\d{2})/);
    const kickoff = new Date(`${day}T${time ? `${time[1].padStart(2, '0')}:${time[2]}` : '12:00'}:00+09:00`).toISOString();
    const providerDay = new Date(Date.parse(fetchedAt) + 9 * 3600000).toISOString().slice(0, 10);
    const status = /cancel|postpon|취소/i.test(text(row[1])) ? 'CANCELLED' : values && day < providerDay ? 'FINISHED' : Date.parse(kickoff) < Date.parse(fetchedAt) && time ? 'UNKNOWN' : 'SCHEDULED';
    const team = name => ({ id: `kbo-${name.toLowerCase().replaceAll(' ', '-')}`, name, shortName: name });
    return [fixture(league, {
      id: `kbo-${day}-${home}-${away}-${index}`, kickoff, timeTBD: !time, liveSupported: false,
      homeTeam: team(home), awayTeam: team(away), liveScore: { home: values ? number(values[2]) : null, away: values ? number(values[1]) : null },
      status, statusDetail: status === 'FINISHED' ? 'Finalizado' : status === 'CANCELLED' ? 'Cancelado' : status === 'UNKNOWN' ? 'Estado pendiente del proveedor' : 'Programado',
      venue: text(row[1].match(/class="LOCATION"[^>]*>([\s\S]*?)<\/td>/i)?.[1] || '') || null,
      source: 'KBO oficial', sourceUrl: KBO_URL
    }, fetchedAt)];
  });
}

async function navigateKboMonth(html, direction) {
  const params = new URLSearchParams();
  for (const input of html.matchAll(/<input\b[^>]*>/gi)) {
    if (attr(input[0], 'type') === 'hidden' && attr(input[0], 'name')) params.set(attr(input[0], 'name'), attr(input[0], 'value'));
  }
  const button = html.match(new RegExp(`name="([^"]+\\$${direction === 'previous' ? 'btnBefore' : 'btnNext'})"`))?.[1];
  if (!button) throw new Error('Navegación del calendario KBO no disponible.');
  params.set(`${button}.x`, '10'); params.set(`${button}.y`, '10');
  return fetchHtml(KBO_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
}

export async function getKboLeague(league, today) {
  return cachedData(`sports:kbo:v2:${today}`, 60, async () => {
    const current = await fetchHtml(KBO_URL);
    const month = current.match(/lblGameMonth"[^>]*>\s*(\d{4})\.(\d{2})/);
    if (!month || `${month[1]}-${month[2]}` !== today.slice(0, 7)) throw new Error('Calendario KBO desactualizado.');
    const others = await Promise.allSettled([navigateKboMonth(current, 'previous'), navigateKboMonth(current, 'next')]);
    const fetchedAt = new Date().toISOString();
    const pages = [current, ...others.filter(result => result.status === 'fulfilled').map(result => result.value)];
    return { matches: pages.flatMap(html => parseKboSchedule(html, league, fetchedAt)), fetchedAt, source: 'KBO oficial', degraded: others.some(result => result.status === 'rejected') };
  });
}
