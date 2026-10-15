import { marketQuote } from './oddsFormatter.js';
import { isUpcomingFixture } from './fixtureEligibility.js';

// A complete winner quote: both sides (in NPB/KBO a tie refunds the moneyline,
// so it is still a two-way price). Shown as the momio, never as a percentage.
export const hasPublishedWinnerPrice = match => ['homeWin', 'awayWin'].every(key => Number(match?.odds?.[key]) > 1);

// NBA injury report entry, in words.
export function availabilityStatus(player) {
  if (/rest/i.test(player?.type || '')) return 'descanso';
  if (/coach/i.test(player?.type || '')) return 'decisión técnica';
  if (/^out$/i.test(player?.status || '')) return 'fuera';
  if (/doubtful/i.test(player?.status || '')) return 'muy dudoso';
  return 'en duda';
}
const lastName = name => String(name || '').split(' ').filter(part => !/^(jr\.?|sr\.?|ii|iii|iv)$/i.test(part)).at(-1) || name;
// Short card line: the most important absences of each side.
export function availabilitySummary(match, perSide = 3) {
  const lineups = match?.analysis?.availability;
  if (!lineups) return null;
  const parts = ['home', 'away'].map(side => {
    const list = lineups[side]?.missing || [];
    if (!list.length) return null;
    const team = match[`${side}Team`]?.shortName || match[`${side}Team`]?.abbreviation || match[`${side}Team`]?.name;
    return `${team}: ${list.slice(0, perSide).map(p => lastName(p.name)).join(', ')}${list.length > perSide ? ` +${list.length - perSide}` : ''}`;
  }).filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export function sportWinnerPick(match) {
  const winner = match?.analysis?.winner;
  const sides = ['home', 'away'].filter(side => typeof winner?.[side] === 'number' && Number.isFinite(winner[side]) && winner[side] > 0 && winner[side] <= 100);
  if (sides.length !== 2) return null;
  const side = winner.home >= winner.away ? 'home' : 'away';
  const team = match[`${side}Team`];
  if (!team?.id || !team.name) return null;
  // Two-way forecast and two-way price (NPB/KBO: a tie refunds the bet).
  const quote = marketQuote(match.odds?.[`${side}Win`], winner[side]);
  return { side, teamId: team.id, teamName: team.name, selection: `${team.name} gana`, market: 'Ganador', probability: winner[side], odds: quote.odds, oddsKind: quote.kind, oddsLabel: quote.label };
}

// Points between the model's pick and the published price for the same side
// (no-vig), or null without a two-way price. It never changes a percentage: a
// large gap only warns that the casa may know something the model cannot see
// (injuries, line-ups, starting pitchers, signings).
export const MARKET_GAP_WARNING = 12, MARKET_GAP_BANKER = 15;
export function marketGap(match) {
  const pick = sportWinnerPick(match);
  const h = Number(match?.odds?.homeWin), a = Number(match?.odds?.awayWin);
  if (!pick || !(h > 1) || !(a > 1)) return null;
  const home = (1 / h) / (1 / h + 1 / a) * 100;
  return Math.round((pick.probability - (pick.side === 'home' ? home : 100 - home)) * 10) / 10;
}

export function sportParlayLeg(match, now = Date.now()) {
  // A playoff game 'if necessary' may never be played.
  if (!match?.id || !isUpcomingFixture(match, now) || match.retired || match.ifNecessary) return null;
  const pick = sportWinnerPick(match);
  if (!pick || !Number.isFinite(pick.odds) || pick.odds <= 1 || pick.odds > 1000) return null;
  return { ...pick, ...(match.allowsDraw ? { market: 'Ganador · empate devuelve', tieVoid: true } : {}), matchId: match.id, sport: match.sport, league: match.leagueName,
    matchTitle: `${match.homeTeam.name} vs ${match.awayTeam.name}`, kickoff: match.kickoff };
}

export function rankSportWinners(matches, now = Date.now(), limit = 10) {
  // One pick per pairing: the next rankable game of a series (the same two teams
  // play on consecutive days with the same forecast), never a game 'if necessary'.
  // A Banquero is also a pick the casa does not strongly contradict.
  const pairing = match => `${match.sport}|${match.leagueId}|${[String(match.homeTeam?.id), String(match.awayTeam?.id)].sort().join('|')}`;
  const next = new Map();
  for (const match of new Map(matches.map(match => [match.id, match])).values()) {
    if (match.status !== 'SCHEDULED' || !(Date.parse(match.kickoff) > now) || match.retired || match.ifNecessary) continue;
    const bankerPick = sportWinnerPick(match);
    if (!bankerPick || Math.abs(marketGap(match) ?? 0) > MARKET_GAP_BANKER) continue;
    const key = pairing(match), current = next.get(key);
    if (!current || Date.parse(match.kickoff) < Date.parse(current.kickoff) || (match.kickoff === current.kickoff && match.id < current.id)) next.set(key, { ...match, bankerPick });
  }
  return [...next.values()]
    .sort((a, b) => b.bankerPick.probability - a.bankerPick.probability || Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.id.localeCompare(b.id))
    .slice(0, limit).map((match, index) => ({ ...match, bankerRank: index + 1 }));
}

// vip: market reserved for VIP members, as the football Over and first-half
// markets (sets, early innings, extra innings, run Overs and negative handicaps).
export const isVipHandicap = line => line < 0;
export function sportCardMarkets(match) {
  const a = match.analysis || {}, pick = sportWinnerPick(match), side = pick?.side || 'home';
  const label = match[`${side}Team`]?.shortName || match[`${side}Team`]?.name || 'Equipo';
  if (match.sport === 'tenis') return [
    { label: `1er set · ${label}`, value: a.firstSet?.[side], vip: true },
    { label: `2º set · ${label}`, value: a.secondSet?.[side], vip: true },
    { label: `Gana un set · ${label}`, value: a.winsSet?.[side]?.yes, vip: false }
  ];
  if (match.sport === 'beisbol') return [
    { label: `1er inning · ${label}`, value: a.firstInning?.[side], vip: true },
    { label: 'Innings 1–5 · Over 2.5', value: a.firstFive?.find(row => row.line === 2.5)?.over, vip: true },
    { label: 'Extra innings · Sí', value: a.extraInnings?.yes, vip: true }
  ];
  return [1.5, -1.5, 5.5].map(line => ({ label: `${line > 0 ? '+' : ''}${line} · ${label}`, value: a.handicaps?.[side]?.find(row => row.line === line)?.probability, vip: isVipHandicap(line) }));
}
