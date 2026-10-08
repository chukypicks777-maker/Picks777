import { fitStrengths, expectedPair } from '../../src/utils/footballModel.js';

// Opponent- and venue-adjusted points ratings for NBA and WNBA. Shared
// parameters chosen on NBA 2024-25 and WNBA 2025 (previous season as history)
// and measured blind on NBA 2025-26 and WNBA 2026 against DraftKings closing
// prices (scripts/backtest/experiment-basketball-ratings.mjs).
export const BASKETBALL_RATINGS = Object.freeze({
  version: 'basketball-points-2026-10-07',
  halfLifeDays: 60, priorGames: 1, minGames: 5,
  // Standard deviation of the final margin around the rated expectation.
  deviation: Object.freeze({ nba: 14.1, wnba: 13.8 })
});

const HOUR = 3600000;
const fits = new WeakMap();

// History rows are [id, kickoffSeconds, homeId, awayId, homePoints, awayPoints];
// finished games of the current calendar complete the most recent days.
function leagueFit(history, games, leagueId, asOf) {
  let byKey = fits.get(games);
  if (!byKey) { byKey = new Map(); fits.set(games, byKey); }
  const key = `${leagueId}:${history.builtAt}:${asOf}`;
  if (!byKey.has(key)) {
    const rows = new Map(history.rows.map(([id, time, home, away, hv, av]) => [id, { time: time * 1000, home, away, hv, av }]));
    for (const game of games) {
      if (game.leagueId !== leagueId || game.status !== 'FINISHED' || !Number.isInteger(game.finalScore?.home) || !Number.isInteger(game.finalScore?.away)) continue;
      rows.set(game.id, { time: Date.parse(game.kickoff), home: String(game.homeTeam?.id), away: String(game.awayTeam?.id), hv: game.finalScore.home, av: game.finalScore.away });
    }
    if (byKey.size > 24) byKey.delete(byKey.keys().next().value);
    byKey.set(key, fitStrengths([...rows.values()], { asOf, halfLifeDays: BASKETBALL_RATINGS.halfLifeDays, priorGames: BASKETBALL_RATINGS.priorGames }));
  }
  return byKey.get(key);
}

// Expected points and margin for a fixture, or null outside NBA/WNBA or without
// five earlier games per team.
export function ratedMargin(match, games = [], history = null, now = Date.now()) {
  const deviation = BASKETBALL_RATINGS.deviation[match.leagueId];
  if (!deviation || history?.leagueId !== match.leagueId || !Array.isArray(history.rows)) return null;
  const start = Math.min(Date.parse(match.kickoff), now);
  if (!Number.isFinite(start)) return null;
  // Only games that began at least three hours earlier are certainly finished.
  const asOf = Math.floor((start - 3 * HOUR) / HOUR) * HOUR;
  const fit = leagueFit(history, games, match.leagueId, asOf);
  const pair = expectedPair(fit, String(match.homeTeam?.id), String(match.awayTeam?.id), { minGames: BASKETBALL_RATINGS.minGames });
  if (!pair) return null;
  return { margin: pair.home - pair.away, points: { home: pair.home, away: pair.away }, deviation, sample: pair.sample, homeEdge: fit.baseHome - fit.baseAway };
}
