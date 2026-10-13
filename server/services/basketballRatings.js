import { fitStrengths, expectedPair } from '../../src/utils/footballModel.js';
import { createHash } from 'node:crypto';
import { AVAILABILITY, teamAvailability, lineupAdjustment, availabilityValue } from './basketballAvailability.js';

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
const sharedFits = new Map();
const MAX_SHARED_FITS = 48;

// History rows are [id, kickoffSeconds, homeId, awayId, homePoints, awayPoints];
// finished games of the current calendar complete the most recent days.
function ratingRows(history, games, leagueId, asOf) {
  const rows = new Map(history.rows.map(([id, time, home, away, hv, av]) => [id, { time: time * 1000, home, away, hv, av }]));
  for (const game of games) {
    if (game.leagueId !== leagueId || game.status !== 'FINISHED' || !Number.isInteger(game.finalScore?.home) || !Number.isInteger(game.finalScore?.away)) continue;
    rows.set(game.id, { time: Date.parse(game.kickoff), home: String(game.homeTeam?.id), away: String(game.awayTeam?.id), hv: game.finalScore.home, av: game.finalScore.away });
  }
  return [...rows.values()].filter(row => row.time < asOf);
}
function leagueFit(history, games, leagueId, asOf) {
  let byKey = fits.get(games);
  if (!byKey) { byKey = new Map(); fits.set(games, byKey); }
  const key = `${leagueId}:${history.builtAt}:${asOf}`;
  if (!byKey.has(key)) {
    if (byKey.size > 24) byKey.delete(byKey.keys().next().value);
    const earlier = ratingRows(history, games, leagueId, asOf);
    // Feed/detail caches clone their arrays. Object identity alone caused the
    // same season to be fitted again on each request. Include every earlier
    // timestamp, team and score so changed results never reuse an obsolete fit.
    const signature = createHash('sha256').update(JSON.stringify([leagueId, asOf, earlier])).digest('hex');
    let fit;
    if (sharedFits.has(signature)) {
      fit = sharedFits.get(signature);
      sharedFits.delete(signature);
    } else {
      fit = fitStrengths(earlier, { asOf, halfLifeDays: BASKETBALL_RATINGS.halfLifeDays, priorGames: BASKETBALL_RATINGS.priorGames });
      if (sharedFits.size >= MAX_SHARED_FITS) sharedFits.delete(sharedFits.keys().next().value);
    }
    sharedFits.set(signature, fit);
    byKey.set(key, fit);
  }
  return byKey.get(key);
}

// Expected points and margin for a fixture, or null outside NBA/WNBA or without
// five earlier games per team. With the NBA injury report and rosters, the
// margin also counts who plays against who earned each rating.
export function ratedMargin(match, games = [], history = null, now = Date.now(), availability = null) {
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
  const lineups = base === 'nba' && availability && ['SCHEDULED', 'LIVE'].includes(match.status) ? lineupEffect(match, history, games, asOf, availability, scale !== 1) : null;
  const used = lineups ? (scale !== 1 ? AVAILABILITY.preseason.scale : 1) : scale;
  // A moderated margin keeps the shown points on the same expectation.
  const margin = (pair.home - pair.away) * used + (lineups ? lineups.home.adjustment - lineups.away.adjustment : 0), mid = (pair.home + pair.away) / 2;
  return { margin, points: { home: mid + margin / 2, away: mid - margin / 2 }, deviation, sample: pair.sample, homeEdge: (fit.baseHome - fit.baseAway) * used, preseason: scale !== 1, lineups };
}

// Both sides' availability adjustment, or null when either team lacks data.
function lineupEffect(match, history, games, asOf, availability, preseason) {
  const rows = ratingRows(history, games, 'nba', asOf), params = preseason ? AVAILABILITY.preseason : AVAILABILITY.regular, out = {};
  for (const side of ['home', 'away']) {
    const players = teamAvailability(match[`${side}Team`]?.id, match.kickoff, rows, availability, { preseason, asOf });
    if (!players) return null;
    const adjustment = lineupAdjustment(players, params);
    // Listed players who matter, for the card and the analysis.
    const missing = players.filter(p => p.listed && p.plays < 1).map(p => ({ name: p.name, status: p.status, type: p.type, plays: p.plays,
      points: Number((params.alpha * availabilityValue(p.stats, params) * (1 - p.plays)).toFixed(1)) })).filter(p => p.points >= 0.1).sort((a, b) => b.points - a.points);
    out[side] = { adjustment: Number(adjustment.toFixed(2)), missing };
  }
  return { ...out, fetchedAt: availability.fetchedAt || null };
}
