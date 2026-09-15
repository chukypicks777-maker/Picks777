/**
 * mathProbabilities.js
 * Algoritmos cuantitativos para cálculo de probabilidades de córners (+5 / -5),
 * agrupación simétrica de Over / Under (positivo vs negativo), desglose detallado
 * por equipo y balance diferencial.
 */

export function poissonProbability(lambda, k) {
  if (lambda <= 0 || k < 0) return 0;
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) {
    p = (p * lambda) / i;
  }
  return p;
}

export function poissonCumulative(lambda, maxK) {
  let sum = 0;
  for (let k = 0; k <= maxK; k++) {
    sum += poissonProbability(lambda, k);
  }
  return Math.min(1, Math.max(0, sum));
}

/**
 * Calcula probabilidades de córners para una media lambda dada.
 * @param {number} avgCorners Promedio de córners por partido
 * @returns {Object} Probabilidades de +5, -5, +8.5, -8.5, +9.5, -9.5
 */
export function calculateCornerProbabilities(avgCorners) {
  const lambda = Math.max(1.0, Math.min(16.0, Number(avgCorners) || 5.0));

  // Menos de 5 córners: k <= 4
  const probUnder5Raw = poissonCumulative(lambda, 4);
  // Más de 5 córners (5 o más): 1 - P(k <= 4)
  const probOver5Raw = 1 - probUnder5Raw;

  // Menos de 8.5 córners (k <= 8)
  const probUnder85Raw = poissonCumulative(lambda, 8);
  const probOver85Raw = 1 - probUnder85Raw;

  // Menos de 9.5 córners (k <= 9)
  const probUnder95Raw = poissonCumulative(lambda, 9);
  const probOver95Raw = 1 - probUnder95Raw;

  const over5 = Math.round(probOver5Raw * 100);
  const under5 = 100 - over5;

  const over85 = Math.round(probOver85Raw * 100);
  const under85 = 100 - over85;

  const over95 = Math.round(probOver95Raw * 100);
  const under95 = 100 - over95;

  return {
    lambda: Number(lambda.toFixed(1)),
    over5,
    under5,
    over85,
    under85,
    over95,
    under95
  };
}

/**
 * Extrae o calcula estadísticas detalladas y enriquecidas de cada equipo
 */
export function calculateTeamDetailedStats(team = {}, isHome = true, _match = {}) {
  const gamesPlayed = Math.max(1, team.gamesPlayed || 15);
  const goalsFor = team.goalsFor != null ? team.goalsFor : (isHome ? 26 : 21);
  const goalsAgainst = team.goalsAgainst != null ? team.goalsAgainst : (isHome ? 14 : 19);

  const avgGF = Number((team.avgGoalsScored || goalsFor / gamesPlayed).toFixed(2));
  const avgGC = Number((team.avgGoalsConceded || goalsAgainst / gamesPlayed).toFixed(2));
  const goalDiff = Number((goalsFor - goalsAgainst).toFixed(0));

  // Promedio de córners
  const avgCorners = Number((team.avgCorners || (isHome ? 5.8 : 4.8)).toFixed(1));
  // Córners concedidos estimados o derivados
  const avgCornersConceded = Number(Math.max(2.5, (10.5 - avgCorners)).toFixed(1));

  const cornerProbs = calculateCornerProbabilities(avgCorners);

  // Goles Over / Under del equipo
  const over25Rate = team.over25Rate || Math.round(Math.min(90, Math.max(25, (avgGF + avgGC) * 22)));
  const under25Rate = 100 - over25Rate;

  const over15Rate = Math.round(Math.min(98, Math.max(45, over25Rate + 24)));
  const under15Rate = 100 - over15Rate;

  const over35Rate = Math.round(Math.max(10, over25Rate - 26));
  const under35Rate = 100 - over35Rate;

  const bttsRate = team.bttsRate || Math.round(Math.min(85, Math.max(30, (avgGF > 0.8 && avgGC > 0.8 ? 62 : 45))));

  // Estimación de Clean Sheet (valla invicta)
  const cleanSheetRate = Math.round(Math.exp(-avgGC) * 100);

  const fouls = Number((team.avgFouls || (isHome ? 11.2 : 12.8)).toFixed(1));
  const cards = Number((team.avgYellowCards || (isHome ? 2.1 : 2.6)).toFixed(1));

  return {
    name: team.name || (isHome ? 'Equipo Local' : 'Equipo Visitante'),
    shortName: team.shortName || (isHome ? 'LOC' : 'VIS'),
    logo: team.logo,
    position: team.position || (isHome ? 3 : 6),
    points: team.points != null ? team.points : (isHome ? 32 : 24),
    gamesPlayed,
    form: Array.isArray(team.form) && team.form.length ? team.form : ['W', 'D', 'W', 'W', 'L'],
    // Goles
    goalsFor,
    goalsAgainst,
    avgGF,
    avgGC,
    goalDiff,
    over15Rate,
    under15Rate,
    over25Rate,
    under25Rate,
    over35Rate,
    under35Rate,
    bttsRate,
    cleanSheetRate,
    // Córners (positivo y negativo)
    avgCorners,
    avgCornersConceded,
    cornerOver5: cornerProbs.over5,
    cornerUnder5: cornerProbs.under5,
    cornerOver85: cornerProbs.over85,
    cornerUnder85: cornerProbs.under85,
    // Disciplina
    fouls,
    cards
  };
}

/**
 * Calcula el análisis diferencial entre Equipo A (Local) y Equipo B (Visitante)
 */
export function calculateDifferential(homeStats, awayStats, match = {}) {
  const goalDiffGap = Number((homeStats.goalDiff - awayStats.goalDiff).toFixed(1));
  const attackDefenseHome = Number((homeStats.avgGF - awayStats.avgGC).toFixed(2));
  const attackDefenseAway = Number((awayStats.avgGF - homeStats.avgGC).toFixed(2));

  // Diferencial de córners: ventaja neta a favor del local o visitante
  const cornerGap = Number((homeStats.avgCorners - awayStats.avgCorners).toFixed(1));
  const cornerAdvantageTeam = cornerGap >= 0 ? homeStats.shortName : awayStats.shortName;
  const cornerAdvantageAbs = Math.abs(cornerGap);

  // Probabilidades globales del partido
  const probs = match.probabilities || {};
  const over25 = probs.over25 || Math.round((homeStats.over25Rate + awayStats.over25Rate) / 2);
  const under25 = probs.under25 != null ? probs.under25 : (100 - over25);

  const over15 = probs.over15 || Math.round((homeStats.over15Rate + awayStats.over15Rate) / 2);
  const under15 = 100 - over15;

  const over35 = probs.over35 || Math.round((homeStats.over35Rate + awayStats.over35Rate) / 2);
  const under35 = 100 - over35;

  const totalMatchCorners = Number((homeStats.avgCorners + awayStats.avgCorners).toFixed(1));
  const matchCornersProbs = calculateCornerProbabilities(totalMatchCorners);

  // Sesgo Over vs Under: si over25 > under25 hay sesgo over
  const overUnderMargin = Math.round(over25 - under25);
  const overUnderTendency = overUnderMargin > 0 ? 'Sesgo Ofensivo (Over)' : overUnderMargin < 0 ? 'Sesgo Defensivo (Under)' : 'Equilibrado';

  // Dominio de córners diferencial
  const cornerDifferentialText = cornerGap > 0
    ? `Ventaja de +${cornerGap} córners/p para ${homeStats.shortName} (Mayor juego por bandas)`
    : cornerGap < 0
    ? `Ventaja de +${cornerAdvantageAbs} córners/p para ${awayStats.shortName}`
    : 'Producción de córners perfectamente equilibrada';

  return {
    goalDiffGap,
    attackDefenseHome,
    attackDefenseAway,
    cornerGap,
    cornerAdvantageTeam,
    cornerAdvantageAbs,
    cornerDifferentialText,
    totalMatchCorners,
    matchCornersProbs,
    over15,
    under15,
    over25,
    under25,
    over35,
    under35,
    overUnderMargin,
    overUnderTendency
  };
}

/**
 * Obtiene el mejor Pick Banquero del partido con su cuota calibrada,
 * selección específica y probabilidad algorítmica más alta.
 * Evalúa Doble Oportunidad (1X / X2), Over 1.5, Under 3.5, y favoritos sólidos.
 */
export function getBestBankerPick(match) {
  if (!match) {
    return {
      selection: 'Victoria Local o Empate (1X)',
      market: 'Doble Oportunidad (1X)',
      probability: 70,
      odds: 1.35,
      safetyScore: 70,
      rationale: 'Pick de cobertura de bajo riesgo'
    };
  }

  const p = match.probabilities || {};
  const odds = match.odds || {};
  const homeName = match.homeTeam?.name || 'Local';
  const awayName = match.awayTeam?.name || 'Visita';
  const homeShort = match.homeTeam?.shortName || homeName;
  const awayShort = match.awayTeam?.shortName || awayName;

  const hasHome = p.homeWin != null;
  const hasAway = p.awayWin != null;
  const hasDraw = p.draw != null;

  const homeProb = hasHome ? Number(p.homeWin) : (hasAway ? Math.max(10, 100 - Number(p.awayWin) - 25) : 45);
  const awayProb = hasAway ? Number(p.awayWin) : (hasHome ? Math.max(5, 100 - Number(p.homeWin) - 20) : 28);
  const drawProb = hasDraw ? Number(p.draw) : Math.max(0, 100 - homeProb - awayProb);

  const over25Prob = p.over25 != null ? Number(p.over25) : 56;
  const under25Prob = p.under25 != null ? Number(p.under25) : (100 - over25Prob);
  const over15Prob = p.over15 != null ? Number(p.over15) : (p.over25 != null ? Math.min(96, Math.round(over25Prob + 26)) : 82);
  const over35Prob = p.over35 != null ? Number(p.over35) : (p.over25 != null ? Math.max(8, Math.round(over25Prob - 24)) : 32);
  const under35Prob = 100 - over35Prob;

  // Doble oportunidad (cobertura matemática)
  const dc1XProb = Math.min(97, Math.max(40, Math.round(homeProb + drawProb)));
  const dcX2Prob = Math.min(97, Math.max(40, Math.round(awayProb + drawProb)));

  const calcOdds = (prob, fallback = 1.32) => {
    if (prob <= 0) return fallback;
    const fair = 100 / prob;
    return Number(Math.max(1.08, Math.min(3.50, fair * 0.94)).toFixed(2));
  };

  const candidates = [];

  // 1. Doble oportunidad 1X (si local tiene ventaja)
  if (dc1XProb >= 65) {
    candidates.push({
      selection: `${homeShort} o Empate (1X)`,
      market: 'Doble Oportunidad (1X)',
      probability: dc1XProb,
      odds: calcOdds(dc1XProb, 1.25),
      safetyScore: dc1XProb,
      rationale: `Cobertura 1X con ${dc1XProb}% de probabilidad combinada (victoria o empate de ${homeShort})`
    });
  }

  // 2. Doble oportunidad X2 (si visita tiene ventaja)
  if (dcX2Prob >= 65) {
    candidates.push({
      selection: `${awayShort} o Empate (X2)`,
      market: 'Doble Oportunidad (X2)',
      probability: dcX2Prob,
      odds: calcOdds(dcX2Prob, 1.25),
      safetyScore: dcX2Prob,
      rationale: `Cobertura X2 con ${dcX2Prob}% de probabilidad combinada (victoria o empate de ${awayShort})`
    });
  }

  // 3. Más de 1.5 Goles (Línea de alta seguridad)
  if (over15Prob >= 72) {
    candidates.push({
      selection: 'Más de 1.5 Goles',
      market: 'Total de Goles Over 1.5',
      probability: over15Prob,
      odds: calcOdds(over15Prob, 1.26),
      safetyScore: over15Prob,
      rationale: `Alta frecuencia goleadora: ${over15Prob}% de partidos superan la línea de 1.5 goles`
    });
  }

  // 4. Menos de 3.5 Goles (Línea defensiva segura)
  if (under35Prob >= 72) {
    candidates.push({
      selection: 'Menos de 3.5 Goles',
      market: 'Total de Goles Under 3.5',
      probability: under35Prob,
      odds: calcOdds(under35Prob, 1.28),
      safetyScore: under35Prob,
      rationale: `Bajo índice de goles proyectado: ${under35Prob}% de probabilidad de máximo 3 goles`
    });
  }

  // 5. Victoria directa si hay favorito aplastante (>= 62%)
  if (homeProb >= 62) {
    candidates.push({
      selection: `Gana ${homeName}`,
      market: '1X2 (Victoria Local)',
      probability: Math.round(homeProb),
      odds: Number((odds.homeWin || calcOdds(homeProb, 1.45)).toFixed(2)),
      safetyScore: Math.round(homeProb),
      rationale: `Dominio estadístico claro de ${homeShort} como local (${Math.round(homeProb)}% prob)`
    });
  } else if (awayProb >= 62) {
    candidates.push({
      selection: `Gana ${awayName}`,
      market: '1X2 (Victoria Visita)',
      probability: Math.round(awayProb),
      odds: Number((odds.awayWin || calcOdds(awayProb, 1.45)).toFixed(2)),
      safetyScore: Math.round(awayProb),
      rationale: `Superioridad visitante clara de ${awayShort} (${Math.round(awayProb)}% prob)`
    });
  }

  // 6. Over 2.5 / Under 2.5 si son marcados
  if (over25Prob >= 65) {
    candidates.push({
      selection: 'Más de 2.5 Goles',
      market: 'Total Goles Over 2.5',
      probability: Math.round(over25Prob),
      odds: Number((odds.over25 || calcOdds(over25Prob, 1.65)).toFixed(2)),
      safetyScore: Math.round(over25Prob),
      rationale: `Tendencia ofensiva marcada (${Math.round(over25Prob)}% prob Over 2.5)`
    });
  } else if (under25Prob >= 65) {
    candidates.push({
      selection: 'Menos de 2.5 Goles',
      market: 'Total Goles Under 2.5',
      probability: Math.round(under25Prob),
      odds: Number((odds.under25 || calcOdds(under25Prob, 1.70)).toFixed(2)),
      safetyScore: Math.round(under25Prob),
      rationale: `Perfil defensivo cerrado (${Math.round(under25Prob)}% prob Under 2.5)`
    });
  }

  // Ordenar de mayor a menor seguridad
  candidates.sort((a, b) => b.safetyScore - a.safetyScore);

  if (candidates.length > 0) {
    return candidates[0];
  }

  // Si no hay ninguno que superó umbrales altos, elegir la mejor doble oportunidad
  const fallbackDC = dc1XProb >= dcX2Prob
    ? { sel: `${homeShort} o Empate (1X)`, prob: dc1XProb, mkt: 'Doble Oportunidad (1X)' }
    : { sel: `${awayShort} o Empate (X2)`, prob: dcX2Prob, mkt: 'Doble Oportunidad (X2)' };

  return {
    selection: fallbackDC.sel,
    market: fallbackDC.mkt,
    probability: fallbackDC.prob,
    odds: calcOdds(fallbackDC.prob, 1.30),
    safetyScore: fallbackDC.prob,
    rationale: `Pick de cobertura óptima con ${fallbackDC.prob}% de seguridad`
  };
}

/**
 * Obtiene el puntaje de seguridad (confianza) para ordenar picks banqueros
 * de mayor a menor ("de lo mejor a lo menor, lo más seguro").
 */
export function getMatchSafetyScore(match) {
  if (!match) return 50;
  if (typeof match.probabilities?.confidence === 'number' && match.probabilities.confidence > 0) {
    return match.probabilities.confidence;
  }
  if (typeof match.aiPick?.probability === 'number' && match.aiPick.probability > 0) {
    return match.aiPick.probability;
  }
  const p = match.probabilities || {};
  const maxProb = Math.max(
    p.homeWin || 0,
    p.awayWin || 0,
    p.over25 || 0,
    p.under25 || 0,
    p.over15 || 0,
    p.bttsYes || 0
  );
  if (maxProb > 0) return Math.round(maxProb);
  const banker = getBestBankerPick(match);
  return banker?.safetyScore || 60;
}

