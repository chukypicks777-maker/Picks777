import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, '../server/data/real_matches.json');
const DETAILS_FILE = path.join(__dirname, '../server/data/match_details.json');

const LEAGUES_ESPN_MAP = {
  inglaterra: 'eng.1',
  espana: 'esp.1',
  mexico: 'mex.1',
  mls: 'usa.1',
  italia: 'ita.1',
  francia: 'fra.1',
  champions: 'uefa.champions',
  leagues_cup: 'concacaf.leagues.cup'
};

async function fetchSummary(espnCode, eventId) {
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${espnCode}/summary?event=${eventId}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function parseH2H(data, match) {
  const h2h = [];
  const h2hSeries = data.seasonseries?.find(s => s.type === 'head-to-head');

  if (h2hSeries?.events?.length) {
    h2hSeries.events.forEach(ev => {
      const homeComp = ev.competitors?.find(c => c.homeAway === 'home') || ev.competitors?.[0];
      const awayComp = ev.competitors?.find(c => c.homeAway === 'away') || ev.competitors?.[1];
      const hScore = parseInt(homeComp?.score || '0', 10);
      const aScore = parseInt(awayComp?.score || '0', 10);
      const hName = homeComp?.team?.displayName || homeComp?.team?.name || match.homeTeam.name;
      const aName = awayComp?.team?.displayName || awayComp?.team?.name || match.awayTeam.name;
      const hShort = homeComp?.team?.abbreviation || homeComp?.team?.shortDisplayName || hName.slice(0, 3).toUpperCase();
      const aShort = awayComp?.team?.abbreviation || awayComp?.team?.shortDisplayName || aName.slice(0, 3).toUpperCase();

      h2h.push({
        date: (ev.date || '').slice(0, 10),
        competition: ev.competitionName || match.leagueName,
        home: hName,
        away: aName,
        score: `${hScore} - ${aScore}`,
        winner: hScore > aScore ? hShort : aScore > hScore ? aShort : 'Draw',
        btts: hScore > 0 && aScore > 0,
        totalCorners: null,
        yellowCards: null,
        totalFouls: null,
        isDirectH2H: true
      });
    });
  }

  // Supplement with real recent matches from lastFiveGames if < 10 matches
  if (h2h.length < 10 && data.lastFiveGames?.length) {
    data.lastFiveGames.forEach(group => {
      const teamName = group.team?.displayName || group.team?.name;
      (group.events || []).forEach(ev => {
        if (h2h.length >= 10) return;
        const oppName = ev.opponent?.displayName || ev.opponent?.name || 'Rival';
        const isHome = ev.atVs === 'vs';
        const hTeam = isHome ? teamName : oppName;
        const aTeam = isHome ? oppName : teamName;
        if (!ev.score) return;
        const scoreParts = ev.score.split('-').map(s => parseInt(s.trim(), 10) || 0);
        if (scoreParts.length < 2) return;
        const hScore = isHome ? (scoreParts[0] || 0) : (scoreParts[1] || 0);
        const aScore = isHome ? (scoreParts[1] || 0) : (scoreParts[0] || 0);
        const hShort = hTeam.slice(0, 3).toUpperCase();
        const aShort = aTeam.slice(0, 3).toUpperCase();

        h2h.push({
          date: (ev.gameDate || '').slice(0, 10),
          competition: ev.competitionName || ev.leagueName || match.leagueName,
          home: hTeam,
          away: aTeam,
          score: `${hScore} - ${aScore}`,
          winner: ev.gameResult === 'W' ? (isHome ? hShort : aShort) : (ev.gameResult === 'L' ? (isHome ? aShort : hShort) : 'Draw'),
          btts: hScore > 0 && aScore > 0,
          totalCorners: null,
          yellowCards: null,
          totalFouls: null,
          isDirectH2H: false,
          teamFocus: teamName
        });
      });
    });
  }

  return h2h;
}

function parseBoxscore(data) {
  if (!data.boxscore?.teams?.length) return null;
  const homeB = data.boxscore.teams.find(t => t.homeAway === 'home') || data.boxscore.teams[0];
  const awayB = data.boxscore.teams.find(t => t.homeAway === 'away') || data.boxscore.teams[1];

  const getStat = (t, name) => {
    const s = t.statistics?.find(x => x.name === name);
    return s ? (parseFloat(s.displayValue) || parseFloat(s.value) || 0) : 0;
  };

  return {
    home: {
      fouls: getStat(homeB, 'foulsCommitted'),
      corners: getStat(homeB, 'wonCorners'),
      yellowCards: getStat(homeB, 'yellowCards'),
      redCards: getStat(homeB, 'redCards'),
      shots: getStat(homeB, 'totalShots'),
      shotsOnTarget: getStat(homeB, 'shotsOnTarget'),
      possession: getStat(homeB, 'possessionPct')
    },
    away: {
      fouls: getStat(awayB, 'foulsCommitted'),
      corners: getStat(awayB, 'wonCorners'),
      yellowCards: getStat(awayB, 'yellowCards'),
      redCards: getStat(awayB, 'redCards'),
      shots: getStat(awayB, 'totalShots'),
      shotsOnTarget: getStat(awayB, 'shotsOnTarget'),
      possession: getStat(awayB, 'possessionPct')
    }
  };
}

function parseLeaders(data) {
  const leaders = [];
  (data.leaders || []).forEach(lg => {
    (lg.leaders || []).forEach(ld => {
      if (ld.athlete?.displayName && !leaders.includes(ld.athlete.displayName)) {
        leaders.push(ld.athlete.displayName);
      }
    });
  });
  return leaders;
}

async function run() {
  console.log('--- ENRICHING REAL MATCHES WITH 100% REAL ESPN DATA ---');
  const matches = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  console.log(`Loaded ${matches.length} matches.`);

  let enrichedCount = 0;
  const detailsCache = fs.existsSync(DETAILS_FILE) ? JSON.parse(fs.readFileSync(DETAILS_FILE, 'utf8')) : {};

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const eventId = m.id.replace('espn-', '');
    const espnCode = LEAGUES_ESPN_MAP[m.leagueId] || 'esp.1';

    let details = detailsCache[eventId];
    if (!details) {
      const summary = await fetchSummary(espnCode, eventId);
      if (summary) {
        const realH2H = parseH2H(summary, m);
        const boxscore = parseBoxscore(summary);
        const leaders = parseLeaders(summary);
        details = { realH2H, boxscore, leaders };
        detailsCache[eventId] = details;
      }
      await new Promise(r => setTimeout(r, 60));
    }

    if (details && details.realH2H && details.realH2H.length > 0) {
      m.h2h = details.realH2H;
      m.isEnriched = true;
      if (details.leaders?.length > 0) {
        m.homeTeam.keyPlayers = details.leaders.slice(0, 2);
        if (details.leaders.length > 2) {
          m.awayTeam.keyPlayers = details.leaders.slice(2, 4);
        }
      }
      if (details.boxscore && (m.status === 'LIVE' || m.status === 'FINISHED')) {
        m.realBoxscore = details.boxscore;
        if (details.boxscore.home.corners > 0) m.homeTeam.avgCorners = details.boxscore.home.corners;
        if (details.boxscore.away.corners > 0) m.awayTeam.avgCorners = details.boxscore.away.corners;
        if (details.boxscore.home.fouls > 0) m.homeTeam.avgFouls = details.boxscore.home.fouls;
        if (details.boxscore.away.fouls > 0) m.awayTeam.avgFouls = details.boxscore.away.fouls;
      }
      enrichedCount++;
    }

    if ((i + 1) % 20 === 0 || i === matches.length - 1) {
      console.log(`Processed ${i + 1}/${matches.length} matches... (${enrichedCount} enriched)`);
    }
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(matches, null, 2), 'utf8');
  fs.writeFileSync(DETAILS_FILE, JSON.stringify(detailsCache, null, 2), 'utf8');
  console.log(`✅ Finished! ${enrichedCount} matches successfully enriched with REAL ESPN H2H and stats.`);
}

run();
