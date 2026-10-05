// Live read-only provider checks. No authentication, fixtures or demo fallbacks.
import fs from 'node:fs/promises';
import { SPORT_LEAGUES } from '../src/constants/leagues.js';
import { getSportsFeed, getSportsMatch, getSportsHistory, parseBasketballEvent } from '../server/services/sportsDataService.js';
import { getFootballFeed } from '../server/services/footballDataService.js';
import { fetchJson } from '../server/services/dataCache.js';
import { formatMatchSchedule } from '../src/utils/matchSchedule.js';
import { marketQuote } from '../src/utils/oddsFormatter.js';

const now = Date.now(), checks = [], samples = [], timings = [];
const check = (name, pass) => checks.push({ name, pass: Boolean(pass) });
const keepAlive = setInterval(() => {}, 1000);
try {
  const groups = [...SPORT_LEAGUES.beisbol.map(league => ['beisbol', league.id]), ['tenis', 'all'], ...SPORT_LEAGUES.basquetbol.map(league => ['basquetbol', league.id])];
  const feeds = await Promise.all(groups.map(async ([sport, id]) => {
    const started = Date.now();
    const feed = await getSportsFeed(sport, { calendarOnly: true, ...(id === 'all' ? {} : { leagueId: id }) });
    timings.push({ sport, league: id, milliseconds: Date.now() - started, count: feed.matches.length, coverage: feed.coverage });
    check(`${sport}:${id}:scope`, id === 'all' || feed.matches.every(match => match.leagueId === id));
    for (const match of feed.matches) {
      check(`${match.id}:schedule`, Number.isFinite(Date.parse(match.kickoff)) && !formatMatchSchedule(match.kickoff, { timeTBD: match.timeTBD }).includes('Invalid'));
      const winner = match.analysis.winner;
      const values = Object.values(winner);
      check(`${match.id}:winner`, values.every(value => value === null) || values.every(value => typeof value === 'number' && value >= 0 && value <= 100) && Math.abs(values.reduce((sum, value) => sum + value, 0) - 100) < 0.11);
      for (const side of ['home', 'away']) {
        const quote = marketQuote(match.odds?.[`${side}Win`], winner[side]);
        check(`${match.id}:${side}:quote-kind`, quote.kind !== 'published' || match.odds?.[`${side}Win`] > 1);
      }
    }
    return feed;
  }));
  for (const [sport, leagueId] of [['beisbol', 'mlb'], ['beisbol', 'npb'], ['beisbol', 'kbo'], ['basquetbol', 'nba_preseason'], ['basquetbol', 'wnba']]) {
    const feed = feeds.find(feed => feed.sport === sport && feed.coverage.some(league => league.leagueId === leagueId));
    const match = feed?.matches.find(match => match.status === 'SCHEDULED' && match.leagueId === leagueId)
      || feed?.matches.find(match => match.status === 'FINISHED' && match.leagueId === leagueId);
    if (!match) { samples.push({ sport, leagueId, note: 'No current match from this provider; none substituted.' }); continue; }
    const started = Date.now();
    // NPB innings enrichment is unrelated to the requested form and schedule check.
    const detail = sport === 'beisbol' && leagueId !== 'mlb' ? match : await getSportsMatch(sport, match.id, { leagueId });
    let games;
    if (sport === 'beisbol') games = (await getSportsHistory(sport, now, { leagueId })).games;
    else {
      const league = SPORT_LEAGUES.basquetbol.find(league => league.id === leagueId), season = detail.season;
      const years = league.preseason ? [season, season - 1, season - 2] : [season, season - 1];
      const schedules = await Promise.all([detail.homeTeam, detail.awayTeam].flatMap(team => years.map(async year => {
        const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/${league.espnCode}/teams/${team.id}/schedule?season=${year}${league.preseason ? '&seasontype=1' : ''}`;
        const raw = await fetchJson(url);
        return (raw.events || []).map(event => parseBasketballEvent(event, [league])).filter(Boolean);
      })));
      games = [...new Map(schedules.flat().map(game => [game.id, game])).values()];
    }
    for (const side of ['home', 'away']) {
      const records = detail.analysis.form?.[side] || [];
      check(`${detail.id}:${side}:five-or-less`, records.length <= 5 && new Set(records.map(game => game.id)).size === records.length);
      for (const record of records) {
        const raw = games.find(game => game.id === record.id);
        const own = raw?.homeTeam.id === detail[`${side}Team`].id ? 'home' : raw?.awayTeam.id === detail[`${side}Team`].id ? 'away' : null;
        const against = own === 'home' ? 'away' : 'home';
        check(`${detail.id}:${side}:${record.id}:real-score-and-result`, raw && own && raw.status === 'FINISHED' && raw.leagueId === detail.leagueId
          && Date.parse(raw.kickoff) < Math.min(now, Date.parse(detail.kickoff)) && raw.id !== detail.id
          && raw.finalScore[own] === record.own && raw.finalScore[against] === record.against
          && record.result === (record.own > record.against ? 'W' : record.own < record.against ? 'L' : 'D'));
      }
    }
    samples.push({ sport, leagueId, id: detail.id, teams: [detail.homeTeam.name, detail.awayTeam.name], kickoff: detail.kickoff,
      sourceUrl: detail.sourceUrl, fetchedAt: detail.fetchedAt, milliseconds: Date.now() - started, form: detail.analysis.form,
      winner: detail.analysis.winner, odds: detail.odds, oddsProvider: detail.oddsProvider, oddsSourceUrl: detail.oddsSourceUrl });
  }
  const football = await getFootballFeed();
  check('football:women-present-in-common-coverage', football.coverage.some(league => league.leagueId === 'mexico_femenil'));
  const women = football.matches.filter(match => match.leagueId === 'mexico_femenil');
  check('football:women-use-own-provider', women.every(match => match.sport === 'femenil' && match.espnCode === 'mex.w.1' && match.id.startsWith('espn-femenil-')));
  samples.push({ sport: 'futbol', womenCount: women.length, coverage: football.coverage.find(league => league.leagueId === 'mexico_femenil') });
  const report = { checkedAt: new Date().toISOString(), pass: checks.every(check => check.pass), checks, timings, samples,
    limitations: ['Consultation time does not guarantee provider update time.', 'Published quotes are informative snapshots, not guaranteed current bookmaker offers.', 'Theoretical odds are computed from unvalidated forecasts, never presented as published.', 'Recent form is from the same competition; NBA preseason history can include previous years.', 'Empty or unavailable provider calendars remain empty.'] };
  await fs.writeFile('artifacts/sports-display-live-verification-2026-10-05.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: report.pass, checks: checks.length, failures: checks.filter(check => !check.pass), timings: timings.map(({ sport, league, milliseconds, count }) => ({ sport, league, milliseconds, count })), samples: samples.map(({ sport, leagueId, id, oddsProvider }) => ({ sport, leagueId, id, oddsProvider })) }, null, 2));
  if (!report.pass) process.exitCode = 1;
} finally { clearInterval(keepAlive); }
