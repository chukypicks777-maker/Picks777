import { roundDistribution, totalLines, validNumber, poissonProbability } from '../../src/utils/probability.js';
import { countForecast, countLines, combinedCount, countResult } from './baseballCountModel.js';
import { noVigMarket } from '../../src/utils/marketProbability.js';

import { SPORT_MODEL_VERSION } from '../../src/utils/sportModelVersion.js';
export { SPORT_MODEL_VERSION };

export const RUN_LINES = [1.5, 2.5, 3.5, 4.5, 5.5];
export const TOTAL_RUN_LINES = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5];
export const HANDICAP_LINES = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, -1.5, -2.5, -3.5, -4.5, -5.5, -6.5];
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const pair = home => Number.isFinite(home) && home >= 0 && home <= 1
  ? roundDistribution({ home: home * 100, away: (1 - home) * 100 }, 1)
  : { home: null, away: null };
const yesNo = p => { const values = pair(p); return { yes: values.home, no: values.away }; };
const historical = (match, games, now) => [...new Map(games.map(game => [game.id, game])).values()].filter(game => game.id !== match.id && game.status === 'FINISHED'
  && Date.parse(game.kickoff) < Math.min(Date.parse(match.kickoff), now)
  && game.leagueId === match.leagueId);

const indexedHistories = new WeakMap();
function historyScope(match, games) {
  let index = indexedHistories.get(games);
  if (!index) {
    index = new Map();
    indexedHistories.set(games, index);
  }
  const key = `${match.sport}:${match.sport === 'tenis' ? match.tour : match.leagueId}`;
  if (!index.has(key)) {
    const previous = [...new Map(games.map(game => [game.id, game])).values()].filter(game => game.status === 'FINISHED' && !game.retired
      && (match.sport === 'tenis' ? game.tour === match.tour : game.leagueId === match.leagueId)
      && Number.isFinite(Date.parse(game.kickoff))
      && ['home', 'away'].every(side => Number.isInteger(game.finalScore?.[side]) && game.finalScore[side] >= 0))
      .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.id.localeCompare(b.id));
    const teams = new Map();
    for (const game of previous) for (const side of ['home', 'away']) {
      const id = String(game[`${side}Team`]?.id);
      if (!teams.has(id)) teams.set(id, []);
      teams.get(id).push(game);
    }
    index.set(key, { previous, teams, positions: new Map(previous.map((game, i) => [game.id, i])), snapshots: new Map() });
  }
  return index.get(key);
}

// Dynamic K: new players move fast, established ratings settle (FiveThirtyEight
// tennis form). ESPN 2025-26 walk-forward beat the fixed K = 24.
export const eloK = matches => 250 / ((matches || 0) + 5) ** 0.4;
// Logit shrinkage selected on matches before October 2025, checked afterwards:
// raw Elo favourites were too extreme for players with short ESPN histories.
export const TENNIS_CALIBRATION = { atp: 0.7, wta: 0.8 };
export const calibrateTennis = (probability, tour) => {
  if (!Number.isFinite(probability)) return null;
  const p = Math.min(0.99, Math.max(0.01, probability)), c = TENNIS_CALIBRATION[tour] ?? 0.75;
  return 1 / (1 + Math.exp(-c * Math.log(p / (1 - p))));
};
export const eloProbability = (home, away) => 1 / (1 + 10 ** ((away - home) / 400));

// Neutral rating is a mathematical prior, not an observed ranking.
export function relativeResultStrength(match, games = [], now = Date.now()) {
  const cutoff = Math.min(Date.parse(match.kickoff), now), scope = historyScope(match, games);
  let low = 0, high = scope.previous.length;
  while (low < high) { const mid = (low + high) >>> 1; if (Date.parse(scope.previous[mid].kickoff) < cutoff) low = mid + 1; else high = mid; }
  const excluded = scope.positions.get(match.id);
  const snapshotKey = excluded !== undefined && excluded < low ? `${low}:${match.id}` : low;
  let snapshot = scope.snapshots.get(snapshotKey);
  if (!snapshot) {
    const ratings = new Map(), samples = new Map();
    for (const game of scope.previous.slice(0, low)) {
    if (game.id === match.id) continue;
    const h = game.homeTeam?.id, a = game.awayTeam?.id;
    if (!h || !a || h === a) continue;
    const hr = ratings.get(h) || 1500, ar = ratings.get(a) || 1500;
    const expected = 1 / (1 + 10 ** ((ar - hr) / 400));
    const actual = game.finalScore.home > game.finalScore.away ? 1 : game.finalScore.home < game.finalScore.away ? 0 : 0.5;
    ratings.set(h, hr + eloK(samples.get(h)) * (actual - expected)); ratings.set(a, ar - eloK(samples.get(a)) * (actual - expected));
    samples.set(h, (samples.get(h) || 0) + 1); samples.set(a, (samples.get(a) || 0) + 1);
    }
    snapshot = { ratings, samples };
    // Upcoming fixtures share one cutoff; bound historical replay snapshots.
    if (scope.snapshots.size >= 32) scope.snapshots.delete(scope.snapshots.keys().next().value);
    scope.snapshots.set(snapshotKey, snapshot);
  }
  const { ratings, samples } = snapshot;
  const home = match.homeTeam?.id, away = match.awayTeam?.id;
  const sampleSize = { home: samples.get(home) || 0, away: samples.get(away) || 0 };
  return { probability: sampleSize.home >= 5 && sampleSize.away >= 5 ? 1 / (1 + 10 ** (((ratings.get(away) || 1500) - (ratings.get(home) || 1500)) / 400)) : null, sampleSize };
}

function teamSample(match, games, side, now) {
  const teamId = String(match[`${side}Team`]?.id);
  return historical(match, games, now).flatMap(game => {
    const ownSide = String(game.homeTeam?.id) === teamId ? 'home' : String(game.awayTeam?.id) === teamId ? 'away' : null;
    if (!ownSide) return [];
    const own = game.finalScore?.[ownSide], against = game.finalScore?.[ownSide === 'home' ? 'away' : 'home'];
    return Number.isInteger(own) && own >= 0 && Number.isInteger(against) && against >= 0
      ? [{ own, against, date: game.kickoff, id: game.id, opponent: game[`${ownSide === 'home' ? 'away' : 'home'}Team`]?.name || null, sourceUrl: game.sourceUrl, inningScores: game.inningScores, scheduledInnings: game.scheduledInnings, lastInning: game.lastInning, finalScore: game.finalScore, status: game.status, ownSide }] : [];
  }).sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 20);
}

const recentForm = sample => sample.slice(0, 5).reverse().map(({ own, against, date, id, opponent, sourceUrl }) => ({
  result: own > against ? 'W' : own < against ? 'L' : 'D', own, against, date, id, opponent, sourceUrl
}));

export function runLadder(lambda, lines = RUN_LINES) {
  const probabilities = totalLines(lambda, lines);
  return lines.map(line => {
    const key = String(line).replace('.', '');
    return { line, over: probabilities[`over${key}`], under: probabilities[`under${key}`] };
  });
}

export function observedExtraInnings(game) {
  const scheduled = game.scheduledInnings, innings = game.inningScores;
  if (game.status !== 'FINISHED' || !Number.isInteger(scheduled) || scheduled < 1 || !Array.isArray(innings) || !innings.length || game.lastInning !== innings.length
    || !['home', 'away'].every(side => Number.isInteger(game.finalScore?.[side]) && game.finalScore[side] >= 0)) return null;
  for (let i = 0; i < innings.length; i++) {
    const inning = innings[i];
    const unplayedHomeHalf = inning.home == null && i === innings.length - 1 && inning.num <= scheduled && game.finalScore.home > game.finalScore.away;
    if (inning.num !== i + 1 || !Number.isInteger(inning.away) || inning.away < 0
      || !(Number.isInteger(inning.home) && inning.home >= 0 || unplayedHomeHalf)) return null;
  }
  if (['home', 'away'].some(side => innings.reduce((sum, inning) => sum + (inning[side] ?? 0), 0) !== game.finalScore[side])) return null;
  if (innings.length > scheduled && innings.slice(0, scheduled).reduce((margin, inning) => margin + inning.home - inning.away, 0) !== 0) return null;
  return innings.at(-1).num > scheduled;
}

export function poissonResult(homeRate, awayRate) {
  if (!validNumber(homeRate) || !validNumber(awayRate) || homeRate > 40 || awayRate > 40) return { home: null, draw: null, away: null };
  let home = 0, draw = 0, away = 0;
  // The truncated mass is normalized; the cap exceeds the supported rates' tails.
  const limit = Math.ceil(Math.max(homeRate, awayRate) + 12 * Math.sqrt(Math.max(homeRate, awayRate) + 1));
  const hp = Array.from({ length: limit + 1 }, (_, i) => poissonProbability(homeRate, i));
  const ap = Array.from({ length: limit + 1 }, (_, i) => poissonProbability(awayRate, i));
  for (let h = 0; h <= limit; h++) for (let a = 0; a <= limit; a++) {
    const p = hp[h] * ap[a];
    if (h > a) home += p; else if (h === a) draw += p; else away += p;
  }
  const total = home + draw + away;
  return total > 0 ? roundDistribution({ home: home / total * 100, draw: draw / total * 100, away: away / total * 100 }, 1)
    : { home: null, draw: null, away: null };
}

export function baseballAnalysis(match, games = [], now = Date.now()) {
  const home = teamSample(match, games, 'home', now), away = teamSample(match, games, 'away', now);
  const ready = home.length >= 5 && away.length >= 5;
  const forecasts = (h, a) => {
    const ids = new Set(h.map(game => game.id)), common = a.filter(game => ids.has(game.id)).length;
    return { home: countForecast(h.map(g => g.own), a.map(g => g.against), common), away: countForecast(a.map(g => g.own), h.map(g => g.against), common) };
  };
  const full = forecasts(home, away);
  const homeRate = full.home?.mean ?? null, awayRate = full.away?.mean ?? null;
  const regulation = countResult(full.home, full.away);
  const decisive = regulation.home != null ? regulation.home + regulation.away : 0;
  const threeWay = match.allowsDraw ? noVigMarket(match.odds, ['homeWin', 'draw', 'awayWin']) : null;
  const oddsWinner = match.allowsDraw ? null : marketWinner(match.odds);
  // A tie in the scoring distribution is not a tie after extra innings.
  const drawGames = [...new Map([...home, ...away].map(game => [game.id, game])).values()];
  const drawCount = drawGames.filter(game => game.own === game.against).length;
  const drawChance = ready && match.allowsDraw ? (drawCount + 0.5) / (drawGames.length + 1) : 0;
  const winner = threeWay ? roundDistribution({ home: threeWay.probabilities.homeWin, draw: threeWay.probabilities.draw, away: threeWay.probabilities.awayWin }, 1)
    : oddsWinner !== null ? pair(oddsWinner) : decisive > 0 ? (match.allowsDraw
    ? roundDistribution({ home: regulation.home / decisive * (1 - drawChance) * 100, draw: drawChance * 100, away: regulation.away / decisive * (1 - drawChance) * 100 }, 1)
    : pair(regulation.home / decisive)) : (match.allowsDraw ? { home: null, draw: null, away: null } : pair(null));
  const periodSample = (sample, count) => sample.flatMap(game => {
    // Corrupt or duplicated period scores must not produce confident picks.
    if (!Array.isArray(game.inningScores) || new Set(game.inningScores.map(inning => inning.num)).size !== game.inningScores.length) return [];
    const innings = Array.from({ length: count }, (_, i) => game.inningScores.find(inning => inning.num === i + 1));
    if (!innings.every(inning => inning && ['home', 'away'].every(side => Number.isInteger(inning[side]) && inning[side] >= 0))) return [];
    if (['home', 'away'].some(side => innings.reduce((sum, inning) => sum + inning[side], 0) > game.finalScore[side])) return [];
    return [{ ...game, own: innings.reduce((sum, inning) => sum + inning[game.ownSide], 0), against: innings.reduce((sum, inning) => sum + inning[game.ownSide === 'home' ? 'away' : 'home'], 0) }];
  });
  const periodRates = count => {
    const h = periodSample(home, count), a = periodSample(away, count);
    return { ...forecasts(h, a), sampleSize: { home: h.length, away: a.length } };
  };
  const first = periodRates(1), five = periodRates(5);
  const extraSample = sample => [...new Map(sample.filter(game => game.scheduledInnings === match.scheduledInnings && observedExtraInnings(game) !== null).map(game => [game.id, game])).values()];
  const extraHome = extraSample(home), extraAway = extraSample(away);
  const extraGames = [...new Map([...extraHome, ...extraAway].map(game => [game.id, game])).values()];
  const extraCount = extraGames.filter(game => observedExtraInnings(game)).length;
  const extraReady = Number.isInteger(match.scheduledInnings) && match.scheduledInnings > 0 && extraHome.length >= 5 && extraAway.length >= 5;
  return {
    kind: 'baseball', available: winner.home !== null, winner, form: { home: recentForm(home), away: recentForm(away) },
    modelVersion: SPORT_MODEL_VERSION,
    probabilitySource: threeWay || oddsWinner !== null ? 'published-odds' : 'experimental-model',
    winnerMarket: match.allowsDraw ? 'three-way' : 'two-way',
    drawSampleSize: match.allowsDraw ? { uniqueGames: drawGames.length, draws: drawCount } : null,
    expectedRuns: { home: homeRate, away: awayRate },
    scoresRun: { home: yesNo(full.home ? 1 - full.home.mass[0] : null), away: yesNo(full.away ? 1 - full.away.mass[0] : null) },
    teamRuns: { home: countLines(full.home, RUN_LINES), away: countLines(full.away, RUN_LINES) },
    totalRuns: countLines(combinedCount(full.home, full.away), TOTAL_RUN_LINES),
    extraInnings: yesNo(extraReady ? (extraCount + 0.5) / (extraGames.length + 1) : null),
    extraInningsSampleSize: { home: extraHome.length, away: extraAway.length, uniqueGames: extraGames.length, extraGames: extraCount },
    firstInning: countResult(first.home, first.away),
    firstFive: countLines(combinedCount(five.home, five.away), RUN_LINES),
    countDiagnostics: { full: Object.fromEntries(['home', 'away'].map(side => [side, full[side] ? { mean: full[side].mean, variance: full[side].variance, shape: full[side].shape } : null])),
      five: Object.fromEntries(['home', 'away'].map(side => [side, five[side] ? { mean: five[side].mean, variance: five[side].variance, shape: five[side].shape } : null])) },
    sampleSize: { home: home.length, away: away.length },
    inningSampleSize: { first: first.sampleSize, five: five.sampleSize },
    records: { home: home.map(({ id, date, sourceUrl }) => ({ id, date, sourceUrl })), away: away.map(({ id, date, sourceUrl }) => ({ id, date, sourceUrl })) },
    method: 'Carreras: binomial negativa con medias anotadas y recibidas de los últimos 20 resultados completos, mínimo 5 por equipo. Conserva la variación observada (como mínimo la de Poisson) y añade incertidumbre por estimar medias con muestras finitas. Totales combinados por convolución de ambos equipos bajo independencia; incluye extra innings de los resultados completos. Primer inning y primeros cinco innings usan solo carreras verificadas de esos periodos. Una muestra de ceros indica N/D, no un Under de 100%. Los totales históricos se calculan por separado del ganador de mercado, sin alterar carreras para imitar Elo. ¿Habrá extra innings?: frecuencia de encuentros de la misma duración reglamentaria, mínimo 5 por equipo, sin duplicados, con suavizado de Jeffreys (0.5 añadido al numerador y 1 al denominador). Sin metadata comprobable, N/D. No incorpora lanzadores ni alineaciones.'
      + (threeWay || oddsWinner !== null ? ' Ganador: mercado completo de la misma casa, normalizado para retirar el margen.' : match.allowsDraw ? ' Ganador histórico de tres resultados: distribución de carreras condicionada a resultado decisivo; empate final por frecuencia de partidos únicos, con suavizado de Jeffreys (0.5 añadido al numerador y 1 al denominador). No equivale a moneyline de dos resultados.' : ' Ganador histórico: distribución de carreras condicionada a resultado decisivo; no simula extra innings.'),
    notice: ready ? 'Probabilidades estimadas antes del partido; no se recalculan según el marcador en vivo.' : 'Faltan al menos 5 partidos finalizados por equipo con carreras verificadas.'
  };
}

export function normalCdf(value) {
  if (!Number.isFinite(value)) return value === Infinity ? 1 : value === -Infinity ? 0 : null;
  const x = Math.abs(value) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-x * x);
  return Math.min(1, Math.max(0, (1 + (value < 0 ? -erf : erf)) / 2));
}

export function marketWinner(odds = {}) {
  const h = Number(odds.homeWin), a = Number(odds.awayWin);
  return Number.isFinite(h) && h > 1 && Number.isFinite(a) && a > 1 ? (1 / h) / (1 / h + 1 / a) : null;
}

// League home-court edge from earlier results, shrunk toward zero with 30
// virtual neutral games. NBA 2025-26 walk-forward: winner log loss 0.623 → 0.618.
export function homeCourtEdge(match, games = [], now = Date.now()) {
  const prior = historical(match, games, now).filter(game => Number.isFinite(game.finalScore?.home) && Number.isFinite(game.finalScore?.away));
  return prior.reduce((sum, game) => sum + game.finalScore.home - game.finalScore.away, 0) / (prior.length + 30);
}

export function basketballAnalysis(match, games = [], now = Date.now()) {
  const home = teamSample(match, games, 'home', now), away = teamSample(match, games, 'away', now);
  const hm = home.map(g => g.own - g.against), am = away.map(g => g.own - g.against);
  const ready = hm.length >= 5 && am.length >= 5;
  const edge = ready ? homeCourtEdge(match, games, now) : 0;
  const margin = ready ? (mean(hm) - mean(am)) / 2 + edge : null;
  const variance = values => mean(values.map(v => (v - mean(values)) ** 2)) * values.length / (values.length - 1);
  const deviation = ready ? Math.sqrt((variance(hm) + variance(am)) / 2) : null;
  const hasDistribution = ready && deviation > 0;
  const oddsWinner = marketWinner(match.odds);
  const winner = pair(oddsWinner ?? (hasDistribution ? normalCdf(margin / deviation) : null));
  let distributionMargin = margin;
  if (hasDistribution && oddsWinner !== null) {
    // Keep every handicap on the same distribution as the published winner.
    let low = -10, high = 10;
    for (let i = 0; i < 60; i++) { const mid = (low + high) / 2; if (normalCdf(mid) < oddsWinner) low = mid; else high = mid; }
    distributionMargin = (low + high) / 2 * deviation;
  }
  const handicaps = Object.fromEntries(['home', 'away'].map(side => [side, HANDICAP_LINES.map(line => ({
    line, probability: hasDistribution ? pair(normalCdf(((side === 'home' ? distributionMargin : -distributionMargin) + line) / deviation)).home : null
  }))]));
  return {
    kind: 'basketball', available: winner.home !== null, winner, handicaps, form: { home: recentForm(home), away: recentForm(away) },
    modelVersion: SPORT_MODEL_VERSION,
    probabilitySource: oddsWinner !== null ? 'published-odds' : 'experimental-model',
    sampleSize: { home: home.length, away: away.length },
    records: { home: home.map(({ id, date, sourceUrl }) => ({ id, date, sourceUrl })), away: away.map(({ id, date, sourceUrl }) => ({ id, date, sourceUrl })) },
    homeCourtEdge: ready ? Number(edge.toFixed(2)) : null,
    method: 'Hándicaps estimados con una distribución normal del margen, calculada sobre los últimos 20 resultados disponibles de la misma competición (mínimo 5 por equipo), más la ventaja de local observada en la competición. Incluyen prórroga cuando está incluida en el resultado oficial.'
      + (oddsWinner !== null ? ' Ganador: probabilidad implícita en las dos cuotas publicadas, sin margen de la casa. La distribución de hándicaps se centra en ese ganador y conserva la dispersión histórica.' : ' Ganador: distribución del margen histórico.'),
    notice: hasDistribution ? 'El hándicap suma o resta puntos al equipo elegido. Proyección previa al partido.' : 'Falta muestra suficiente o variación de marcadores para estimar los hándicaps.'
  };
}

export function seriesWinProbability(setProbability, maxSets = 3) {
  if (!Number.isFinite(setProbability) || setProbability < 0 || setProbability > 1 || ![3, 5].includes(maxSets)) return null;
  const needed = (maxSets + 1) / 2;
  let total = 0;
  for (let losses = 0; losses < needed; losses++) {
    let combinations = 1;
    for (let i = 1; i <= losses; i++) combinations *= (needed + i - 1) / i;
    total += combinations * setProbability ** needed * (1 - setProbability) ** losses;
  }
  return total;
}

function setSample(match, games, side, now) {
  const id = String(match[`${side}Team`]?.id);
  // ATP/WTA history also includes Grand Slams, but never the other tour or doubles.
  const previous = (historyScope(match, games).teams.get(id) || []).filter(game => game.id !== match.id
    && Date.parse(game.kickoff) < Math.min(Date.parse(match.kickoff), now)).slice().reverse();
  let won = 0, played = 0, matches = 0;
  for (const game of previous) {
    const own = String(game.homeTeam?.id) === id ? 'home' : String(game.awayTeam?.id) === id ? 'away' : null;
    if (!own) continue;
    const sets = game.setScores || [];
    const valid = sets.filter(set => validNumber(set.home) && validNumber(set.away)
      && ((Math.max(set.home, set.away) >= 6 && Math.abs(set.home - set.away) >= 2) || (Math.max(set.home, set.away) === 7 && Math.min(set.home, set.away) === 6)));
    if (!valid.length) continue;
    matches++;
    for (const set of valid) { played++; if (set[own] > set[own === 'home' ? 'away' : 'home']) won++; }
    if (matches >= 20) break;
  }
  return { won, played, matches };
}

// Stored ratings only describe fixtures that started after they were built;
// older results would otherwise be forecast with their own outcome included.
function ratingSample(match, ratings, side) {
  const entry = ratings.players[String(match[`${side}Team`]?.id)];
  return entry ? { rating: entry[0], count: entry[1], won: entry[2], played: entry[3], matches: entry[4] } : { rating: 1500, count: 0, won: 0, played: 0, matches: 0 };
}

// ATP: Elo, official ranking points (last list before the match; they include
// Challenger results that ESPN does not publish) and the shrunk head-to-head
// record. Weights fitted before October 2025; ESPN walk-forward afterwards:
// accuracy 63.9% -> 65.0%, log loss 0.632 -> 0.624. WTA has no historical
// ranking source to validate and head-to-head did not help, so it keeps Elo.
export const TENNIS_ATP_WEIGHTS = Object.freeze({ elo: 0.37, rank: 0.43, h2h: 0.42 });
function atpRankedProbability(match, ratings, eloChance) {
  const points = ratings.rankings?.points;
  if (match.tour !== 'atp' || !points || !Number.isFinite(ratings.rankings.floor)) return null;
  const pts = side => points[String(match[`${side}Team`]?.id)] ?? ratings.rankings.floor;
  const [first, second] = [String(match.homeTeam?.id), String(match.awayTeam?.id)].sort();
  const record = ratings.h2h?.[`${first}|${second}`] || [0, 0];
  const homeWins = first === String(match.homeTeam?.id) ? record[0] : record[1], awayWins = record[0] + record[1] - homeWins;
  const p = Math.min(0.99, Math.max(0.01, eloChance)), w = TENNIS_ATP_WEIGHTS;
  const x = w.elo * Math.log(p / (1 - p)) + w.rank * Math.log(pts('home') / pts('away')) + w.h2h * (homeWins - awayWins) / (homeWins + awayWins + 2);
  return { probability: 1 / (1 + Math.exp(-x)), headToHead: { home: homeWins, away: awayWins }, rankingPoints: { home: pts('home'), away: pts('away') } };
}

export function tennisAnalysis(match, games = [], now = Date.now(), ratings = null) {
  const stored = ratings?.tour === match.tour && Date.parse(match.kickoff) >= ratings.asOf ? ratings : null;
  let home, away, strength;
  if (stored) {
    const h = ratingSample(match, stored, 'home'), a = ratingSample(match, stored, 'away');
    home = h; away = a;
    strength = { probability: h.count >= 5 && a.count >= 5 ? eloProbability(h.rating, a.rating) : null, sampleSize: { home: h.count, away: a.count } };
  } else {
    home = setSample(match, games, 'home', now); away = setSample(match, games, 'away', now);
    strength = relativeResultStrength(match, games, now);
  }
  const oddsWinner = marketWinner(match.odds);
  const ready = strength.probability !== null && home.matches >= 5 && away.matches >= 5 && home.played >= 5 && away.played >= 5;
  let setChance = null;
  const maxSets = match.maxSets === 5 ? 5 : 3;
  const ranked = ready && stored ? atpRankedProbability(match, stored, strength.probability) : null;
  const matchChance = oddsWinner ?? (ranked?.probability ?? (ready ? calibrateTennis(strength.probability, match.tour) : null));
  if (matchChance !== null) {
    let low = 0, high = 1;
    for (let i = 0; i < 60; i++) { const mid = (low + high) / 2; if (seriesWinProbability(mid, maxSets) < matchChance) low = mid; else high = mid; }
    setChance = (low + high) / 2;
  }
  const needed = (maxSets + 1) / 2;
  return {
    kind: 'tennis', available: setChance !== null, winner: pair(oddsWinner ?? (setChance === null ? null : seriesWinProbability(setChance, maxSets))),
    modelVersion: SPORT_MODEL_VERSION,
    firstSet: pair(setChance), secondSet: pair(setChance),
    winsSet: { home: yesNo(setChance === null ? null : 1 - (1 - setChance) ** needed), away: yesNo(setChance === null ? null : 1 - setChance ** needed) },
    maxSets, sampleSize: { home: home.matches, away: away.matches }, setSampleSize: { home: home.played, away: away.played },
    probabilitySource: oddsWinner !== null ? 'published-odds' : 'experimental-model',
    headToHead: oddsWinner === null ? ranked?.headToHead ?? null : null, rankingPoints: oddsWinner === null ? ranked?.rankingPoints ?? null : null,
    method: (oddsWinner !== null ? 'Ganador implícito en las dos cuotas publicadas, sin margen; probabilidad por set inferida de ese ganador.'
      : ranked ? 'Ganador combinando tres señales reales de ESPN: fuerza tipo Elo con resultados de los últimos dos años (mínimo 5 partidos y 5 sets por jugador), puntos del ranking ATP oficial publicado (incluye Challengers) y el cara a cara previo. Pesos elegidos con partidos anteriores a octubre de 2025 y comprobados después. Probabilidad por set inferida del ganador.'
      : 'Ganador por fuerza relativa tipo Elo con resultados reales previos del mismo circuito en ESPN (hasta dos años; mínimo 5 partidos y 5 sets verificados por jugador). Actualización dinámica según partidos jugados y calibración que modera los favoritos; parámetros elegidos con resultados anteriores a octubre de 2025 y comprobados después. Probabilidad por set inferida del ganador.')
      + ` Partido al mejor de ${maxSets} sets. Los sets se suponen independientes y con la misma probabilidad: primer y segundo set comparten estimación. Gana un set significa al menos uno; se supone que el partido se completa.`,
    notice: setChance !== null ? 'Estimaciones previas al partido; no incorporan cambios durante el encuentro. Precisión predictiva sin validación prospectiva.' : 'Faltan cuotas completas o al menos 5 partidos y 5 sets verificados por jugador.'
  };
}

export function analyzeSportMatch(match, games = [], now = Date.now(), { tennisRatings = null } = {}) {
  const model = match.sport === 'beisbol' ? baseballAnalysis : match.sport === 'tenis' ? tennisAnalysis : basketballAnalysis;
  const analysis = model(match, games, now, match.sport === 'tenis' ? tennisRatings?.[match.tour] : undefined);
  if (!['SCHEDULED', 'LIVE', 'FINISHED'].includes(match.status)) return model({ ...match, odds: {}, kickoff: 'invalid' }, [], now);
  return analysis;
}
