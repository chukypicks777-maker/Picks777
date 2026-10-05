import { roundDistribution, totalLines, validNumber, poissonProbability } from '../../src/utils/probability.js';

export const RUN_LINES = [1.5, 2.5, 3.5, 4.5, 5.5];
export const HANDICAP_LINES = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, -1.5, -2.5, -3.5, -4.5, -5.5, -6.5];
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const pair = home => Number.isFinite(home) && home >= 0 && home <= 1
  ? roundDistribution({ home: home * 100, away: (1 - home) * 100 }, 1)
  : { home: null, away: null };
const yesNo = p => { const values = pair(p); return { yes: values.home, no: values.away }; };
const historical = (match, games, now) => games.filter(game => game.id !== match.id && game.status === 'FINISHED'
  && Date.parse(game.kickoff) < Math.min(Date.parse(match.kickoff), now)
  && game.leagueId === match.leagueId);

// Neutral rating is a mathematical prior, not an observed ranking.
export function relativeResultStrength(match, games = [], now = Date.now()) {
  const cutoff = Math.min(Date.parse(match.kickoff), now), ratings = new Map(), samples = new Map();
  const previous = [...new Map(games.map(game => [game.id, game])).values()].filter(game => game.id !== match.id && game.status === 'FINISHED'
    && Date.parse(game.kickoff) < cutoff && !game.retired && (match.sport === 'tenis' ? game.tour === match.tour : game.leagueId === match.leagueId)
    && ['home', 'away'].every(side => Number.isInteger(game.finalScore?.[side]) && game.finalScore[side] >= 0))
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.id.localeCompare(b.id));
  for (const game of previous) {
    const h = game.homeTeam?.id, a = game.awayTeam?.id;
    if (!h || !a || h === a) continue;
    const hr = ratings.get(h) || 1500, ar = ratings.get(a) || 1500;
    const expected = 1 / (1 + 10 ** ((ar - hr) / 400));
    const actual = game.finalScore.home > game.finalScore.away ? 1 : game.finalScore.home < game.finalScore.away ? 0 : 0.5;
    const adjustment = 24 * (actual - expected);
    ratings.set(h, hr + adjustment); ratings.set(a, ar - adjustment);
    samples.set(h, (samples.get(h) || 0) + 1); samples.set(a, (samples.get(a) || 0) + 1);
  }
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
      ? [{ own, against, date: game.kickoff, id: game.id, sourceUrl: game.sourceUrl, inningScores: game.inningScores, ownSide }] : [];
  }).sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 20);
}

export function runLadder(lambda) {
  const probabilities = totalLines(lambda, RUN_LINES);
  return RUN_LINES.map(line => {
    const key = String(line).replace('.', '');
    return { line, over: probabilities[`over${key}`], under: probabilities[`under${key}`] };
  });
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
  let homeRate = ready ? (mean(home.map(g => g.own)) + mean(away.map(g => g.against))) / 2 : null;
  let awayRate = ready ? (mean(away.map(g => g.own)) + mean(home.map(g => g.against))) / 2 : null;
  const strength = relativeResultStrength(match, games, now);
  if (ready && strength.probability !== null && homeRate + awayRate > 0 && homeRate + awayRate <= 40) {
    // Keep scoring totals and the winner on the same decisive-score distribution.
    const total = homeRate + awayRate;
    let low = 0, high = total;
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2, result = poissonResult(mid, total - mid);
      const decisiveChance = result.home / (result.home + result.away);
      if (decisiveChance < strength.probability) low = mid; else high = mid;
    }
    homeRate = (low + high) / 2; awayRate = total - homeRate;
  }
  const regulation = poissonResult(homeRate, awayRate);
  const decisive = regulation.home != null ? regulation.home + regulation.away : 0;
  // A tie after Poisson regulation is not a tie at the end of extra innings.
  const drawChance = ready && match.allowsDraw ? ([...home, ...away].filter(game => game.own === game.against).length + 1) / (home.length + away.length + 3) : 0;
  const winner = decisive > 0 ? (match.allowsDraw
    ? roundDistribution({ home: regulation.home / decisive * (1 - drawChance) * 100, draw: drawChance * 100, away: regulation.away / decisive * (1 - drawChance) * 100 }, 1)
    : pair(regulation.home / decisive)) : (match.allowsDraw ? { home: null, draw: null, away: null } : pair(null));
  const periodSample = (sample, count) => sample.flatMap(game => {
    const innings = Array.from({ length: count }, (_, i) => (game.inningScores || []).find(inning => inning.num === i + 1));
    if (!innings.every(inning => inning && ['home', 'away'].every(side => Number.isInteger(inning[side]) && inning[side] >= 0))) return [];
    return [{ ...game, own: innings.reduce((sum, inning) => sum + inning[game.ownSide], 0), against: innings.reduce((sum, inning) => sum + inning[game.ownSide === 'home' ? 'away' : 'home'], 0) }];
  });
  const periodRates = count => {
    const h = periodSample(home, count), a = periodSample(away, count);
    return { home: h.length >= 5 && a.length >= 5 ? (mean(h.map(game => game.own)) + mean(a.map(game => game.against))) / 2 : null,
      away: h.length >= 5 && a.length >= 5 ? (mean(a.map(game => game.own)) + mean(h.map(game => game.against))) / 2 : null,
      sampleSize: { home: h.length, away: a.length } };
  };
  const first = periodRates(1), five = periodRates(5);
  return {
    kind: 'baseball', available: ready, winner,
    expectedRuns: { home: homeRate, away: awayRate },
    scoresRun: { home: yesNo(homeRate === null ? null : 1 - Math.exp(-homeRate)), away: yesNo(awayRate === null ? null : 1 - Math.exp(-awayRate)) },
    teamRuns: { home: runLadder(homeRate), away: runLadder(awayRate) },
    firstInning: poissonResult(first.home, first.away),
    firstFive: runLadder(five.home !== null && five.away !== null ? five.home + five.away : null),
    sampleSize: { home: home.length, away: away.length },
    inningSampleSize: { first: first.sampleSize, five: five.sampleSize },
    records: { home: home.map(({ id, date, sourceUrl }) => ({ id, date, sourceUrl })), away: away.map(({ id, date, sourceUrl }) => ({ id, date, sourceUrl })) },
    method: 'Total esperado de carreras basado en las medias anotadas y recibidas de los últimos 20 resultados completos (mínimo 5 por equipo; incluyen extra innings si los hubo). El reparto entre equipos se ajusta a una fuerza relativa tipo Elo calculada con resultados previos del mismo torneo: punto inicial neutral 1500, escala 400 y actualización 24 por partido. Son parámetros matemáticos, no rankings oficiales. Totales: Poisson sobre esas medias ajustadas. Primer inning y total de innings 1 a 5 usan exclusivamente carreras observadas en esos innings, con mínimo 5 registros por equipo; sin esos registros se muestra N/D. No incorpora lanzadores ni alineaciones.'
      + (match.allowsDraw ? ' Empate final estimado con la frecuencia observada, suavizada con un registro por resultado; la masa decisiva se reparte según Poisson.' : ' Ganador aproximado condicionando la distribución Poisson a un resultado decisivo; no simula extra innings.'),
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

export function basketballAnalysis(match, games = [], now = Date.now()) {
  const home = teamSample(match, games, 'home', now), away = teamSample(match, games, 'away', now);
  const hm = home.map(g => g.own - g.against), am = away.map(g => g.own - g.against);
  const ready = hm.length >= 5 && am.length >= 5;
  const margin = ready ? (mean(hm) - mean(am)) / 2 : null;
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
    kind: 'basketball', available: winner.home !== null, winner, handicaps,
    sampleSize: { home: home.length, away: away.length },
    records: { home: home.map(({ id, date, sourceUrl }) => ({ id, date, sourceUrl })), away: away.map(({ id, date, sourceUrl }) => ({ id, date, sourceUrl })) },
    method: 'Hándicaps estimados con una distribución normal del margen, calculada sobre los últimos 20 resultados disponibles de la misma competición (mínimo 5 por equipo). Incluyen prórroga cuando está incluida en el resultado oficial.'
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
  const previous = games.filter(game => game.id !== match.id && game.status === 'FINISHED' && game.tour === match.tour
    && !game.retired && Date.parse(game.kickoff) < Math.min(Date.parse(match.kickoff), now))
    .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff));
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

export function tennisAnalysis(match, games = [], now = Date.now()) {
  const home = setSample(match, games, 'home', now), away = setSample(match, games, 'away', now);
  const oddsWinner = marketWinner(match.odds);
  const strength = relativeResultStrength(match, games, now);
  const ready = strength.probability !== null && home.matches >= 5 && away.matches >= 5 && home.played >= 5 && away.played >= 5;
  let setChance = null;
  const maxSets = match.maxSets === 5 ? 5 : 3;
  const matchChance = oddsWinner ?? (ready ? strength.probability : null);
  if (matchChance !== null) {
    let low = 0, high = 1;
    for (let i = 0; i < 60; i++) { const mid = (low + high) / 2; if (seriesWinProbability(mid, maxSets) < matchChance) low = mid; else high = mid; }
    setChance = (low + high) / 2;
  }
  const needed = (maxSets + 1) / 2;
  return {
    kind: 'tennis', available: setChance !== null, winner: pair(oddsWinner ?? (setChance === null ? null : seriesWinProbability(setChance, maxSets))),
    firstSet: pair(setChance), secondSet: pair(setChance),
    winsSet: { home: yesNo(setChance === null ? null : 1 - (1 - setChance) ** needed), away: yesNo(setChance === null ? null : 1 - setChance ** needed) },
    maxSets, sampleSize: { home: home.matches, away: away.matches }, setSampleSize: { home: home.played, away: away.played },
    probabilitySource: oddsWinner !== null ? 'published-odds' : 'experimental-model',
    method: (oddsWinner !== null ? 'Ganador implícito en las dos cuotas publicadas, sin margen; probabilidad por set inferida de ese ganador.' : 'Ganador por fuerza relativa tipo Elo con resultados previos del mismo circuito (mínimo 5 partidos y 5 sets verificados por jugador). Inicialización neutral 1500, escala 400 y actualización 24: parámetros matemáticos, no rankings oficiales. Probabilidad por set inferida del ganador.')
      + ` Partido al mejor de ${maxSets} sets. Los sets se suponen independientes y con la misma probabilidad: primer y segundo set comparten estimación. Gana un set significa al menos uno; se supone que el partido se completa.`,
    notice: setChance !== null ? 'Estimaciones previas al partido; no incorporan cambios durante el encuentro. Precisión predictiva sin validación prospectiva.' : 'Faltan cuotas completas o al menos 5 partidos y 5 sets verificados por jugador.'
  };
}

export function analyzeSportMatch(match, games = [], now = Date.now()) {
  const model = match.sport === 'beisbol' ? baseballAnalysis : match.sport === 'tenis' ? tennisAnalysis : basketballAnalysis;
  const analysis = model(match, games, now);
  if (!['SCHEDULED', 'LIVE', 'FINISHED'].includes(match.status)) return model({ ...match, odds: {}, kickoff: 'invalid' }, [], now);
  return analysis;
}
