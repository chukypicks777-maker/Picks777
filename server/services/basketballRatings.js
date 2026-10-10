import { fitStrengths, expectedPair } from '../../src/utils/footballModel.js';

// Opponent- and venue-adjusted points ratings for NBA and WNBA. Shared
// parameters chosen on NBA 2024-25 and WNBA 2025 (previous season as history)
// and measured blind on NBA 2025-26 and WNBA 2026 against DraftKings closing
// prices (scripts/backtest/experiment-basketball-ratings.mjs).
export const BASKETBALL_RATINGS = Object.freeze({
  version: 'basketball-points-2026-10-07',
  halfLifeDays: 60, priorGames: 1, minGames: 5,
  // Standard deviation of the final margin around the rated expectation.
  deviation: Object.freeze({ nba: 14.1, wnba: 13.8 }),
  // NBA preseason: last season's ratings with the expected margin scaled down,
  // because rotations rest. Scale chosen on the 2024 preseason and scored blind
  // on the 2025 preseason (scripts/backtest/experiment-basketball-preseason.mjs):
  // accuracy 56.1% -> 59.6%, log loss 0.682 -> 0.679, no forecast above 75%
  // (the previous last-20-preseason-games method gave 11 of 57).
  preseason: Object.freeze({ nba_preseason: Object.freeze({ league: 'nba', scale: 0.3 }) })
});

// Competition whose stored results rate a fixture (the preseason uses the NBA).
export const ratingLeagueOf = leagueId => BASKETBALL_RATINGS.preseason[leagueId]?.league || leagueId;

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
  const base = ratingLeagueOf(match.leagueId), scale = BASKETBALL_RATINGS.preseason[match.leagueId]?.scale ?? 1;
  const deviation = BASKETBALL_RATINGS.deviation[base];
  if (!deviation || history?.leagueId !== base || !Array.isArray(history.rows)) return null;
  const start = Math.min(Date.parse(match.kickoff), now);
  if (!Number.isFinite(start)) return null;
  // Only games that began at least three hours earlier are certainly finished.
  const asOf = Math.floor((start - 3 * HOUR) / HOUR) * HOUR;
  const fit = leagueFit(history, games, base, asOf);
  const pair = expectedPair(fit, String(match.homeTeam?.id), String(match.awayTeam?.id), { minGames: BASKETBALL_RATINGS.minGames });
  if (!pair) return null;
  // A moderated margin keeps the shown points on the same expectation.
  const margin = (pair.home - pair.away) * scale, mid = (pair.home + pair.away) / 2;
  return { margin, points: { home: mid + margin / 2, away: mid - margin / 2 }, deviation, sample: pair.sample, homeEdge: (fit.baseHome - fit.baseAway) * scale, preseason: scale !== 1 };
}
