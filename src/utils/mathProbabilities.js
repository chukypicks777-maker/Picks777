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

  // Nuevas líneas detalladas de Córners (+1.5, +2.5, +3.5, +4.5, +5.5, +6.5)
  const over15 = Math.min(99, Math.max(1, Math.round((1 - poissonCumulative(lambda, 1)) * 100)));
  const over25 = Math.min(over15 - 1, Math.max(1, Math.round((1 - poissonCumulative(lambda, 2)) * 100)));
  const over35 = Math.min(over25 - 1, Math.max(1, Math.round((1 - poissonCumulative(lambda, 3)) * 100)));
  const over45 = Math.min(over35 - 1, Math.max(1, Math.round((1 - poissonCumulative(lambda, 4)) * 100)));
  const over55 = Math.min(over45 - 1, Math.max(1, Math.round((1 - poissonCumulative(lambda, 5)) * 100)));
  const over65 = Math.min(over55 - 1, Math.max(1, Math.round((1 - poissonCumulative(lambda, 6)) * 100)));

  return {
    lambda: Number(lambda.toFixed(1)),
    over5,
    under5,
    over85,
    under85,
    over95,
    under95,
    over15,
    over25,
    over35,
    over45,
    over55,
    over65
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

  // Promedio de córners (usar dato real del equipo o calcular dinámicamente por volumen ofensivo)
  const avgCorners = Number((team.avgCorners || (isHome ? Math.min(7.5, Math.max(3.8, 4.2 + avgGF * 0.8)) : Math.min(7.2, Math.max(3.5, 3.8 + avgGF * 0.7)))).toFixed(1));
  // Córners concedidos estimados o derivados por volumen defensivo
  const avgCornersConceded = Number((team.avgCornersConceded || Math.max(2.8, Math.min(7.5, 3.6 + avgGC * 0.7))).toFixed(1));

  const cornerProbs = calculateCornerProbabilities(avgCorners);

  // Goles Over / Under del equipo
  const lambdaGoals = Math.max(0.6, avgGF + avgGC);
  const probOver05Calc = Math.min(99, Math.max(65, Math.round((1 - Math.exp(-lambdaGoals)) * 100)));

  const over25Rate = team.over25Rate || Math.round(Math.min(90, Math.max(15, (avgGF + avgGC) * 22)));
  const under25Rate = 100 - over25Rate;

  const over15Rate = team.over15Rate || Math.round(Math.min(probOver05Calc - 1, Math.max(over25Rate + 12, over25Rate + 24)));
  const under15Rate = 100 - over15Rate;

  const over05Rate = team.over05Rate || Math.min(99, Math.max(over15Rate + 1, probOver05Calc));
  const under05Rate = 100 - over05Rate;

  const over35Rate = team.over35Rate || Math.round(Math.min(over25Rate - 2, Math.max(10, over25Rate - 26)));
  const under35Rate = 100 - over35Rate;

  const bttsRate = team.bttsRate || Math.round(Math.min(85, Math.max(30, (avgGF > 0.8 && avgGC > 0.8 ? 62 : 45))));

  // Estimación de Clean Sheet (valla invicta)
  const cleanSheetRate = Math.round(Math.exp(-avgGC) * 100);

  const fouls = Number((team.avgFouls || (isHome ? Math.min(16.0, Math.max(9.5, 10.5 + avgGC * 0.7)) : Math.min(16.5, Math.max(10.0, 11.2 + avgGC * 0.8)))).toFixed(1));
  const cards = Number((team.avgYellowCards || (isHome ? Math.min(3.6, Math.max(1.4, 1.8 + avgGC * 0.3)) : Math.min(3.8, Math.max(1.6, 2.1 + avgGC * 0.3)))).toFixed(1));

  // Probabilidades de Tarjetas (-0.5, +0.5, +1.5, +2.5)
  const lambdaCards = Math.max(0.5, cards);
  const probCardsUnder05Raw = Math.round(poissonProbability(lambdaCards, 0) * 100);
  const cardsUnder05 = Math.max(1, Math.min(55, probCardsUnder05Raw));
  const cardsOver05 = 100 - cardsUnder05;
  const cardsOver15 = Math.max(1, Math.min(cardsOver05 - 1, Math.round((1 - poissonCumulative(lambdaCards, 1)) * 100)));
  const cardsOver25 = Math.max(1, Math.min(cardsOver15 - 1, Math.round((1 - poissonCumulative(lambdaCards, 2)) * 100)));

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
    over05Rate,
    under05Rate,
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
    cornerOver15: cornerProbs.over15,
    cornerOver25: cornerProbs.over25,
    cornerOver35: cornerProbs.over35,
    cornerOver45: cornerProbs.over45,
    cornerOver55: cornerProbs.over55,
    cornerOver65: cornerProbs.over65,
    // Tarjetas
    cardsUnder05,
    cardsOver05,
    cardsOver15,
    cardsOver25,
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
      rationale: 'Pick de cobertura de bajo riesgo con alta seguridad estadística'
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
    return Number(Math.max(1.12, Math.min(3.50, fair * 0.96)).toFixed(2));
  };

  const homeGF = match.homeTeam?.goalsFor;
  const homeGP = match.homeTeam?.gamesPlayed || (match.homeTeam?.homeRecord ? (match.homeTeam.homeRecord.w + match.homeTeam.homeRecord.d + match.homeTeam.homeRecord.l) : null) || 15;
  const awayGF = match.awayTeam?.goalsFor;
  const awayGP = match.awayTeam?.gamesPlayed || (match.awayTeam?.awayRecord ? (match.awayTeam.awayRecord.w + match.awayTeam.awayRecord.d + match.awayTeam.awayRecord.l) : null) || 15;
  const homeAvgGF = match.homeTeam?.avgGoalsScored ? Number(match.homeTeam.avgGoalsScored).toFixed(1) : ((homeGF != null && homeGP) ? (homeGF / homeGP).toFixed(1) : null);
  const awayAvgGF = match.awayTeam?.avgGoalsScored ? Number(match.awayTeam.avgGoalsScored).toFixed(1) : ((awayGF != null && awayGP) ? (awayGF / awayGP).toFixed(1) : null);
  const xGHome = match.model?.expectedGoals?.home != null ? Number(match.model.expectedGoals.home).toFixed(1) : null;
  const xGAway = match.model?.expectedGoals?.away != null ? Number(match.model.expectedGoals.away).toFixed(1) : null;
  const combinedGoals = (homeAvgGF && awayAvgGF) ? (parseFloat(homeAvgGF) + parseFloat(awayAvgGF)).toFixed(1) : null;

  const candidates = [];

  // 1. Doble oportunidad 1X (si local tiene ventaja)
  if (dc1XProb >= 65) {
    candidates.push({
      selection: `${homeShort} o Empate (1X)`,
      market: 'Doble Oportunidad (1X)',
      probability: dc1XProb,
      odds: calcOdds(dc1XProb, 1.25),
      safetyScore: dc1XProb,
      rationale: `Dominio y solidez local: ${homeShort} ${homeAvgGF ? `promedia ${homeAvgGF} goles/p y ` : ''}${xGHome ? `xG de ${xGHome} frente a ${xGAway || '0.9'}, con ` : 'sostiene un '}${dc1XProb}% de probabilidad combinada de sumar (victoria o empate).`
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
      rationale: `Superioridad visitante: ${awayShort} ${awayAvgGF ? `promedia ${awayAvgGF} goles/p y ` : ''}${xGAway ? `xG de ${xGAway} frente a ${xGHome || '1.0'}, con ` : 'sostiene un '}${dcX2Prob}% de probabilidad combinada de sumar (victoria o empate).`
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
      rationale: `Alta frecuencia ofensiva: ${combinedGoals ? `Ambos equipos combinan ${combinedGoals} goles/p y ` : ''}${over15Prob}% de partidos superan la línea de 1.5 goles con ritmo constante de llegadas al arco.`
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
      rationale: `Bloque defensivo hermético: Índice controlado de goles con ${under35Prob}% de probabilidad de máximo 3 goles y esquemas tácticos que priorizan el orden.`
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
      rationale: `Ventaja de local marcada: ${homeShort} ${homeAvgGF ? `anota ${homeAvgGF} goles/p y ` : ''}sostiene ${Math.round(homeProb)}% de victoria directa proyectada por Poisson frente a su rival.`
    });
  } else if (awayProb >= 62) {
    candidates.push({
      selection: `Gana ${awayName}`,
      market: '1X2 (Victoria Visita)',
      probability: Math.round(awayProb),
      odds: Number((odds.awayWin || calcOdds(awayProb, 1.45)).toFixed(2)),
      safetyScore: Math.round(awayProb),
      rationale: `Superioridad técnica visitante: ${awayShort} ${awayAvgGF ? `anota ${awayAvgGF} goles/p con ` : ''}${Math.round(awayProb)}% de probabilidad de triunfo en campo contrario.`
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
      rationale: `Tendencia ofensiva acelerada: ${combinedGoals ? `Promedio conjunto de ${combinedGoals} goles/p y ` : ''}${Math.round(over25Prob)}% de probabilidad estadística de 3 o más goles.`
    });
  } else if (under25Prob >= 65) {
    candidates.push({
      selection: 'Menos de 2.5 Goles',
      market: 'Total Goles Under 2.5',
      probability: Math.round(under25Prob),
      odds: Number((odds.under25 || calcOdds(under25Prob, 1.70)).toFixed(2)),
      safetyScore: Math.round(under25Prob),
      rationale: `Perfil defensivo cerrado: Solidez en repliegue y baja tasa de conversión rival (${Math.round(under25Prob)}% prob de Under 2.5).`
    });
  }

  // Ordenar de mayor a menor seguridad
  candidates.sort((a, b) => b.safetyScore - a.safetyScore);

  if (candidates.length > 0) {
    return candidates[0];
  }

  // Si no hay ninguno que superó umbrales altos, elegir la mejor doble oportunidad
  const fallbackDC = dc1XProb >= dcX2Prob
    ? { sel: `${homeShort} o Empate (1X)`, prob: dc1XProb, mkt: 'Doble Oportunidad (1X)', team: homeShort, avgGF: homeAvgGF }
    : { sel: `${awayShort} o Empate (X2)`, prob: dcX2Prob, mkt: 'Doble Oportunidad (X2)', team: awayShort, avgGF: awayAvgGF };

  return {
    selection: fallbackDC.sel,
    market: fallbackDC.mkt,
    probability: fallbackDC.prob,
    odds: calcOdds(fallbackDC.prob, 1.30),
    safetyScore: fallbackDC.prob,
    rationale: `Cobertura y solidez táctica: ${fallbackDC.sel} sostiene ${fallbackDC.prob}% de probabilidad combinada de sumar con bajo margen de error defensivo y volumen regular de goles.`
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

/**
 * Obtiene las 3 mejores oportunidades de un partido (las de mayor probabilidad/posibilidad)
 * para agregarlas automáticamente al boleto de parlay al presionar "+ Al Parlay".
 * Analiza rigurosamente Doble Oportunidad, Total Goles, Córners y Tarjetas, garantizando
 * selecciones complementarias, no contradictorias y con altas posibilidades estadísticas.
 *
 * @param {Object} match Objeto de datos del partido
 * @returns {Array<Object>} Lista con las 3 selecciones de mayor probabilidad
 */
export function getTop3Opportunities(match) {
  if (!match) {
    return [
      { matchId: 'm-def', matchTitle: 'Partido', league: 'Liga', selection: 'Victoria o Empate (1X)', market: 'Doble Oportunidad (1X)', probability: 80, odds: 1.25 },
      { matchId: 'm-def', matchTitle: 'Partido', league: 'Liga', selection: 'Más de 1.5 Goles', market: 'Total Goles Over 1.5', probability: 82, odds: 1.24 },
      { matchId: 'm-def', matchTitle: 'Partido', league: 'Liga', selection: 'Más de 5.5 Córners', market: 'Córners Totales', probability: 85, odds: 1.20 }
    ];
  }

  const p = match.probabilities || {};
  const odds = match.odds || {};
  const matchId = match.id || 'match';
  const matchTitle = `${match.homeTeam?.name || 'Local'} vs ${match.awayTeam?.name || 'Visita'}`;
  const league = match.leagueName || 'Fútbol';
  const homeShort = match.homeTeam?.shortName || match.homeTeam?.name || 'Local';
  const awayShort = match.awayTeam?.shortName || match.awayTeam?.name || 'Visita';

  const homeProb = p.homeWin != null ? Number(p.homeWin) : 48;
  const awayProb = p.awayWin != null ? Number(p.awayWin) : 26;
  const drawProb = p.draw != null ? Number(p.draw) : Math.max(10, 100 - homeProb - awayProb);

  const calcOdds = (prob, fallback = 1.25) => {
    if (!prob || prob <= 0) return fallback;
    const p = Math.min(97, Math.max(35, prob));
    // Calibrated bookmaker odds curve for high-probability markets:
    // 95% -> 1.15
    // 90% -> 1.22
    // 85% -> 1.30
    // 80% -> 1.38
    // 75% -> 1.46
    const calibrated = 1.06 + ((100 - p) / 100) * 1.60;
    return Number(Math.max(1.12, Math.min(3.50, calibrated)).toFixed(2));
  };

  const candidates = [];

  // 1. Doble Oportunidad (Alta probabilidad de acierto entre 75% y 95%)
  const dc1XProb = Math.min(97, Math.max(35, Math.round(homeProb + drawProb)));
  const dcX2Prob = Math.min(97, Math.max(35, Math.round(awayProb + drawProb)));

  if (dc1XProb >= dcX2Prob) {
    candidates.push({
      category: 'result',
      market: 'Doble Oportunidad (1X)',
      selection: `${homeShort} o Empate (1X)`,
      probability: dc1XProb,
      odds: odds.dc1X || calcOdds(dc1XProb, 1.22)
    });
  } else {
    candidates.push({
      category: 'result',
      market: 'Doble Oportunidad (X2)',
      selection: `${awayShort} o Empate (X2)`,
      probability: dcX2Prob,
      odds: odds.dcX2 || calcOdds(dcX2Prob, 1.25)
    });
  }

  // 2. Líneas Seguras de Goles
  const over15Prob = p.over15 != null
    ? Number(p.over15)
    : (p.over25 != null ? Math.min(96, Math.round(Number(p.over25) + 26)) : 82);
  const under35Prob = p.under35 != null
    ? Number(p.under35)
    : (p.over25 != null ? Math.min(94, Math.round(100 - (Number(p.over25) - 24))) : 78);

  if (over15Prob >= under35Prob) {
    candidates.push({
      category: 'goals',
      market: 'Total Goles Over 1.5',
      selection: 'Más de 1.5 Goles',
      probability: over15Prob,
      odds: Number((odds.over15 || calcOdds(over15Prob, 1.28)).toFixed(2))
    });
  } else {
    candidates.push({
      category: 'goals',
      market: 'Total Goles Under 3.5',
      selection: 'Menos de 3.5 Goles',
      probability: under35Prob,
      odds: Number((odds.under35 || calcOdds(under35Prob, 1.30)).toFixed(2))
    });
  }

  // 3. Córners del Partido (Línea adaptativa de máxima probabilidad según lambda)
  const homeCorners = Number(match.homeTeam?.avgCorners) || 5.2;
  const awayCorners = Number(match.awayTeam?.avgCorners) || 4.8;
  const lambdaCorners = Math.max(3.5, homeCorners + awayCorners);

  let cornerLine = '5.5';
  let cornerK = 5;
  if (lambdaCorners >= 9.0) {
    cornerLine = '5.5';
    cornerK = 5;
  } else if (lambdaCorners >= 7.0) {
    cornerLine = '4.5';
    cornerK = 4;
  } else {
    cornerLine = '3.5';
    cornerK = 3;
  }
  const probOverCorners = Math.min(97, Math.max(78, Math.round((1 - poissonCumulative(lambdaCorners, cornerK)) * 100)));

  candidates.push({
    category: 'corners',
    market: 'Córners Totales',
    selection: `Más de ${cornerLine} Córners`,
    probability: probOverCorners,
    odds: calcOdds(probOverCorners, 1.22)
  });

  // 4. Tarjetas Totales (Línea adaptativa de alta probabilidad)
  const homeCards = Number(match.homeTeam?.avgYellowCards) || 2.1;
  const awayCards = Number(match.awayTeam?.avgYellowCards) || 2.4;
  const lambdaCards = Math.max(1.5, homeCards + awayCards);

  let cardLine = '1.5';
  let cardK = 1;
  if (lambdaCards >= 3.0) {
    cardLine = '1.5';
    cardK = 1;
  } else {
    cardLine = '0.5';
    cardK = 0;
  }
  const probOverCards = Math.min(97, Math.max(76, Math.round((1 - poissonCumulative(lambdaCards, cardK)) * 100)));

  candidates.push({
    category: 'cards',
    market: 'Tarjetas Totales',
    selection: `Más de ${cardLine} Tarjetas`,
    probability: probOverCards,
    odds: calcOdds(probOverCards, 1.20)
  });

  // 5. Goles por Equipo (Anotará al menos 1 gol - evaluar favorito goleador)
  const homeGoalsAvg = Number(match.homeTeam?.avgGoalsScored) || ((match.homeTeam?.goalsFor || 24) / Math.max(1, match.homeTeam?.gamesPlayed || 15));
  const awayGoalsAvg = Number(match.awayTeam?.avgGoalsScored) || ((match.awayTeam?.goalsFor || 20) / Math.max(1, match.awayTeam?.gamesPlayed || 15));

  const probHomeScores = Math.min(96, Math.max(50, Math.round((1 - Math.exp(-homeGoalsAvg)) * 100)));
  const probAwayScores = Math.min(96, Math.max(50, Math.round((1 - Math.exp(-awayGoalsAvg)) * 100)));

  if (probHomeScores >= probAwayScores) {
    candidates.push({
      category: 'team_goals',
      market: 'Goles por Equipo',
      selection: `${homeShort} anota (+0.5 Goles)`,
      probability: probHomeScores,
      odds: calcOdds(probHomeScores, 1.26)
    });
  } else {
    candidates.push({
      category: 'team_goals',
      market: 'Goles por Equipo',
      selection: `${awayShort} anota (+0.5 Goles)`,
      probability: probAwayScores,
      odds: calcOdds(probAwayScores, 1.26)
    });
  }

  // Si existe pick IA de alta confianza, considerarlo
  if (match.aiPick?.selection && (match.aiPick.probability || 0) >= 65) {
    candidates.push({
      category: 'ai_pick',
      market: 'Pronóstico IA Principal',
      selection: match.aiPick.selection,
      probability: match.aiPick.probability,
      odds: match.aiPick.odds || calcOdds(match.aiPick.probability, 1.45)
    });
  }

  // Ordenar de mayor a menor probabilidad ("las que tengas más posibilidad")
  candidates.sort((a, b) => b.probability - a.probability);

  // Seleccionar las 3 mejores sin repetir categoría para evitar redundancias
  const selected = [];
  const usedCategories = new Set();

  for (const cand of candidates) {
    if (!usedCategories.has(cand.category)) {
      selected.push(cand);
      usedCategories.add(cand.category);
      if (selected.length === 3) break;
    }
  }

  // Si no se llenaron 3 (raro), completar con las mejores restantes
  if (selected.length < 3) {
    for (const cand of candidates) {
      if (!selected.includes(cand)) {
        selected.push(cand);
        if (selected.length === 3) break;
      }
    }
  }

  return selected.slice(0, 3).map(sel => ({
    matchId,
    matchTitle,
    league,
    selection: sel.selection,
    market: sel.market,
    odds: sel.odds,
    probability: sel.probability
  }));
}

