import { getBestBankerPick } from '../../src/utils/mathProbabilities.js';

// Baseline independent Poisson model. Not xG, Dixon-Coles, or calibrated accuracy.
export function poissonModel(home, away, minGames = 5) {
  const getGP = t => {
    if (!t) return null;
    if (Number.isFinite(t.gamesPlayed)) return t.gamesPlayed;
    if (t.homeRecord && Number.isFinite(t.homeRecord.w + t.homeRecord.d + t.homeRecord.l)) {
      return t.homeRecord.w + t.homeRecord.d + t.homeRecord.l;
    }
    if (t.awayRecord && Number.isFinite(t.awayRecord.w + t.awayRecord.d + t.awayRecord.l)) {
      return t.awayRecord.w + t.awayRecord.d + t.awayRecord.l;
    }
    if (t.record && Number.isFinite(t.record.w + t.record.d + t.record.l)) {
      return t.record.w + t.record.d + t.record.l;
    }
    return null;
  };
  const homeGP = getGP(home);
  const awayGP = getGP(away);
  const valid = (t, gp) => t && Number.isFinite(gp) && gp >= minGames &&
    Number.isFinite(t.goalsFor) && t.goalsFor >= 0 && Number.isFinite(t.goalsAgainst) && t.goalsAgainst >= 0;
  if (!valid(home, homeGP) || !valid(away, awayGP)) return null;
  const lambda = (home.goalsFor / homeGP + away.goalsAgainst / awayGP) / 2;
  const mu = (away.goalsFor / awayGP + home.goalsAgainst / homeGP) / 2;
  if (lambda > 10 || mu > 10) return null;
  const distribution = rate => {
    const p = [Math.exp(-rate)];
    for (let k = 1; k <= 60; k++) p.push(p[k - 1] * rate / k);
    return p;
  };
  const hp = distribution(lambda), ap = distribution(mu);
  const sums = { homeWin: 0, draw: 0, awayWin: 0, bttsYes: 0, over05: 0, over15: 0, over25: 0, over35: 0, over45: 0 };
  const scores = [];
  let mass = 0;
  hp.forEach((p, h) => ap.forEach((q, a) => {
    const probability = p * q;
    mass += probability;
    sums[h > a ? 'homeWin' : h === a ? 'draw' : 'awayWin'] += probability;
    if (h > 0 && a > 0) sums.bttsYes += probability;
    for (const [key, line] of [['over05', 0.5], ['over15', 1.5], ['over25', 2.5], ['over35', 3.5], ['over45', 4.5]]) {
      if (h + a > line) sums[key] += probability;
    }
    scores.push({ score: `${h} - ${a}`, probability });
  }));
  const probabilities = Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, v / mass * 100]));
  probabilities.under05 = 100 - probabilities.over05;
  probabilities.bttsNo = 100 - probabilities.bttsYes;
  probabilities.under15 = 100 - probabilities.over15;
  probabilities.under25 = 100 - probabilities.over25;
  probabilities.under35 = 100 - probabilities.over35;
  probabilities.under45 = 100 - probabilities.over45;
  probabilities.cornerOver95 = null;
  probabilities.confidence = null;
  scores.sort((a, b) => b.probability - a.probability);
  const topScore = scores[0];

  return {
    probabilities,
    predictedScore: topScore.score,
    scoreDistribution: scores.slice(0, 9).map(s => ({ ...s, probability: (s.probability / mass) * 100 })),
    method: 'Poisson independiente sobre goles de temporada',
    sampleSize: { home: homeGP, away: awayGP },
    expectedGoals: { home: lambda, away: mu },
    limitations: 'Proyección matemática basada en la distribución de Poisson y medias históricas oficiales.'
  };
}

export function solvePoissonLambdaFromUnder25(probUnder25Decimal) {
  const decimal = probUnder25Decimal > 1 ? probUnder25Decimal / 100 : probUnder25Decimal;
  const p = Math.max(1e-8, Math.min(1 - 1e-8, decimal));
  let low = 0, high = 60;
  for (let i = 0; i < 45; i++) {
    const mid = (low + high) / 2;
    const pUnder = Math.exp(-mid) * (1 + mid + (mid * mid) / 2);
    if (pUnder > p) low = mid; else high = mid;
  }
  return (low + high) / 2;
}

export function deriveCalibratedPoissonModel(rawProbs = {}, home = {}, away = {}, odds = {}) {
  // All probabilities in this contract are percentages, including values below 1.
  const parseNum = val => typeof val === 'number' && Number.isFinite(val) && val >= 0 ? val : null;
  rawProbs = Object.fromEntries(Object.entries(rawProbs).map(([key, value]) => [key, parseNum(value) !== null && value <= 100 ? value : null]));
  odds = Object.fromEntries(Object.entries(odds).map(([key, value]) => [key, typeof value === 'number' && Number.isFinite(value) && value > 1 ? value : null]));
  for (const [yes, no] of [['over25', 'under25'], ['bttsYes', 'bttsNo']]) {
    if (rawProbs[yes] != null) rawProbs[no] = 100 - rawProbs[yes];
    else if (rawProbs[no] != null) rawProbs[yes] = 100 - rawProbs[no];
  }
  const winKeys = ['homeWin', 'draw', 'awayWin'];
  if (winKeys.every(key => rawProbs[key] != null)) {
    const total = winKeys.reduce((sum, key) => sum + rawProbs[key], 0);
    for (const key of winKeys) rawProbs[key] = total > 0 ? rawProbs[key] / total * 100 : null;
  } else if (winKeys.every(key => odds[key])) {
    const total = winKeys.reduce((sum, key) => sum + 1 / odds[key], 0);
    for (const key of winKeys) rawProbs[key] = 100 / odds[key] / total;
  } else {
    for (const key of winKeys) rawProbs[key] = null;
  }

  let probOver25 = parseNum(rawProbs?.over25);
  if (probOver25 === null && odds?.over25 && odds?.under25) {
    const invO = 1 / odds.over25, invU = 1 / odds.under25;
    if (invO + invU > 0) probOver25 = (invO / (invO + invU)) * 100;
  }

  let pH = parseNum(rawProbs?.homeWin);
  let pA = parseNum(rawProbs?.awayWin);
  if (pH === null && odds?.homeWin) {
    pH = (1 / odds.homeWin) * 100;
  }
  if (pA === null && odds?.awayWin) {
    pA = (1 / odds.awayWin) * 100;
  }

  const homeGP = parseNum(home?.gamesPlayed);
  const awayGP = parseNum(away?.gamesPlayed);
  const homeGF = parseNum(home?.goalsFor);
  const awayGF = parseNum(away?.goalsFor);
  const hasStandings = homeGP !== null && homeGP >= 5 && awayGP !== null && awayGP >= 5 && homeGF !== null && awayGF !== null;

  // If there are no probabilities, no odds, and no match sample, return null
  if (probOver25 === null && pH === null && pA === null && !hasStandings) {
    return null;
  }

  let totalLambda;
  if (probOver25 === 0 || probOver25 === 100) return null;
  if (probOver25 !== null && probOver25 > 0 && probOver25 < 100) {
    totalLambda = solvePoissonLambdaFromUnder25((100 - probOver25) / 100);
  } else if (hasStandings) {
    totalLambda = Math.max(1.2, Math.min(6.5, (homeGF / homeGP) + (awayGF / awayGP)));
  } else {
    return null;
  }

  let weightHome;
  if (pH !== null && pA !== null && (pH + pA) > 0) {
    weightHome = Math.max(0.18, Math.min(0.82, Math.sqrt(pH) / (Math.sqrt(pH) + Math.sqrt(pA))));
  } else if (hasStandings) {
    const homeAttack = homeGF / homeGP;
    const awayAttack = awayGF / awayGP;
    weightHome = (homeAttack + awayAttack > 0)
      ? Math.max(0.18, Math.min(0.82, homeAttack / (homeAttack + awayAttack)))
      : 0.5;
  } else if (pH !== null || pA !== null) {
    const effH = pH ?? 45;
    const effA = pA ?? 30;
    weightHome = Math.max(0.18, Math.min(0.82, Math.sqrt(effH) / (Math.sqrt(effH) + Math.sqrt(effA))));
  } else {
    weightHome = 0.5;
  }

  const lambda = totalLambda * weightHome;
  const mu = totalLambda * (1 - weightHome);

  const distribution = rate => {
    const p = [Math.exp(-rate)];
    for (let k = 1; k <= 30; k++) p.push(p[k - 1] * rate / k);
    return p;
  };
  const hp = distribution(lambda), ap = distribution(mu);
  const sums = { homeWin: 0, draw: 0, awayWin: 0, bttsYes: 0, over05: 0, over15: 0, over25: 0, over35: 0, over45: 0 };
  const scores = [];
  let mass = 0;

  hp.forEach((p, h) => ap.forEach((q, a) => {
    const probability = p * q;
    mass += probability;
    sums[h > a ? 'homeWin' : h === a ? 'draw' : 'awayWin'] += probability;
    if (h > 0 && a > 0) sums.bttsYes += probability;
    for (const [key, line] of [['over05', 0.5], ['over15', 1.5], ['over25', 2.5], ['over35', 3.5], ['over45', 4.5]]) {
      if (h + a > line) sums[key] += probability;
    }
    scores.push({ score: `${h} - ${a}`, probability });
  }));

  const hasWinSignal = rawProbs.homeWin != null || odds?.homeWin || hasStandings;
  const probabilities = {
    homeWin: rawProbs.homeWin ?? (hasWinSignal ? (sums.homeWin / mass * 100) : null),
    draw: rawProbs.draw ?? (hasWinSignal ? (sums.draw / mass * 100) : null),
    awayWin: rawProbs.awayWin ?? (hasWinSignal ? (sums.awayWin / mass * 100) : null),
    over05: (sums.over05 / mass) * 100,
    under05: 100 - (sums.over05 / mass) * 100,
    over15: (sums.over15 / mass) * 100,
    under15: 100 - (sums.over15 / mass) * 100,
    over25: rawProbs.over25 ?? ((sums.over25 / mass) * 100),
    under25: rawProbs.under25 ?? (100 - (rawProbs.over25 ?? ((sums.over25 / mass) * 100))),
    over35: (sums.over35 / mass) * 100,
    under35: 100 - (sums.over35 / mass) * 100,
    over45: (sums.over45 / mass) * 100,
    under45: 100 - (sums.over45 / mass) * 100,
    bttsYes: rawProbs.bttsYes ?? ((sums.bttsYes / mass) * 100),
    bttsNo: rawProbs.bttsNo ?? (100 - (rawProbs.bttsYes ?? ((sums.bttsYes / mass) * 100))),
    cornerOver95: rawProbs.cornerOver95 ?? null,
    confidence: null
  };

  // Do not combine incompatible market inputs into a seemingly coherent forecast.
  if (probabilities.bttsYes > probabilities.over15 + 1e-6) return null;
  const goalLadder = ['over05', 'over15', 'over25', 'over35', 'over45'].map(key => probabilities[key]);
  if (goalLadder.some((value, index) => index > 0 && value > goalLadder[index - 1] + 1e-6)) return null;

  scores.sort((a, b) => b.probability - a.probability);
  const topScore = scores[0];

  return {
    probabilities,
    predictedScore: topScore.score,
    scoreDistribution: scores.slice(0, 9).map(s => ({ ...s, probability: (s.probability / mass) * 100 })),
    method: 'Poisson aproximado a partir de cuotas o goles observados',
    sampleSize: { home: homeGP ?? home?.gamesPlayed ?? null, away: awayGP ?? away?.gamesPlayed ?? null },
    expectedGoals: { home: Number(lambda.toFixed(2)), away: Number(mu.toFixed(2)) },
    limitations: 'Modelo sin calibración histórica de aciertos. Las cuotas reflejan el mercado; el reparto de goles supone independencia. No garantiza resultados.'
  };
}

export function buildPick(match) {
  if (!match || match.status === 'POSTPONED' || match.status === 'CANCELLED') return null;
  const probs = match.model?.probabilities || match.probabilities;
  if (!probs || !Object.keys(probs).length || (probs.homeWin == null && probs.awayWin == null)) return null;

  const banker = getBestBankerPick(match);
  if (!banker) return null;

  const odds = banker.odds ?? banker.estimatedOdds ?? (banker.probability > 0 ? Number(Math.max(1.01, 100 / banker.probability).toFixed(2)) : null);

  return {
    market: banker.market || 'Doble Oportunidad',
    selection: banker.selection,
    odds: banker.odds ?? null,
    estimatedOdds: banker.odds == null ? odds : null,
    probability: Math.round(banker.probability),
    type: '💎 Pick Banquero Principal',
    confidence: `${Math.round(banker.probability)}%`,
    settlement: match.status === 'LIVE' ? 'IN_PLAY' : match.status === 'FINISHED' ? 'SETTLED' : 'PENDING',
    predictedScore: match.model?.predictedScore || match.probabilities?.predictedScore || null,
    summaryRationale: banker.rationale || `Estimación del modelo, sin garantía, con ${Math.round(banker.probability)}% de probabilidad estadística.`
  };
}
