import { marketQuote } from './oddsFormatter.js';

export function sportWinnerPick(match) {
  const winner = match?.analysis?.winner;
  const sides = ['home', 'away'].filter(side => typeof winner?.[side] === 'number' && Number.isFinite(winner[side]) && winner[side] > 0 && winner[side] <= 100);
  if (sides.length !== 2) return null;
  const side = winner.home >= winner.away ? 'home' : 'away';
  const team = match[`${side}Team`];
  if (!team?.id || !team.name) return null;
  const quote = marketQuote(match.odds?.[`${side}Win`], winner[side]);
  return { side, teamId: team.id, teamName: team.name, selection: `${team.name} gana`, market: 'Ganador', probability: winner[side], odds: quote.odds, oddsKind: quote.kind, oddsLabel: quote.label };
}

export function rankSportWinners(matches, now = Date.now(), limit = 10) {
  return [...new Map(matches.map(match => [match.id, match])).values()]
    .filter(match => match.status === 'SCHEDULED' && Date.parse(match.kickoff) > now && !match.retired)
    .map(match => ({ ...match, bankerPick: sportWinnerPick(match) })).filter(match => match.bankerPick)
    .sort((a, b) => b.bankerPick.probability - a.bankerPick.probability || Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.id.localeCompare(b.id))
    .slice(0, limit).map((match, index) => ({ ...match, bankerRank: index + 1 }));
}

export function sportCardMarkets(match) {
  const a = match.analysis || {}, pick = sportWinnerPick(match), side = pick?.side || 'home';
  const label = match[`${side}Team`]?.shortName || match[`${side}Team`]?.name || 'Equipo';
  if (match.sport === 'tenis') return [
    { label: `1er set · ${label}`, value: a.firstSet?.[side] },
    { label: `2º set · ${label}`, value: a.secondSet?.[side] },
    { label: `Gana un set · ${label}`, value: a.winsSet?.[side]?.yes }
  ];
  if (match.sport === 'beisbol') return [
    { label: `1er inning · ${label}`, value: a.firstInning?.[side] },
    { label: 'Innings 1–5 · Over 2.5', value: a.firstFive?.find(row => row.line === 2.5)?.over },
    { label: 'Extra innings · Sí', value: a.extraInnings?.yes }
  ];
  return [1.5, -1.5, 5.5].map(line => ({ label: `${line > 0 ? '+' : ''}${line} · ${label}`, value: a.handicaps?.[side]?.find(row => row.line === line)?.probability }));
}
