// Baseline independent Poisson model. Not xG, Dixon-Coles, or calibrated accuracy.
export function poissonModel(home, away, minGames = 5) {
  const valid = t => t && Number.isFinite(t.gamesPlayed) && t.gamesPlayed >= minGames &&
    Number.isFinite(t.goalsFor) && t.goalsFor >= 0 && Number.isFinite(t.goalsAgainst) && t.goalsAgainst >= 0;
  if (!valid(home) || !valid(away)) return null;
  const lambda = (home.goalsFor / home.gamesPlayed + away.goalsAgainst / away.gamesPlayed) / 2;
  const mu = (away.goalsFor / away.gamesPlayed + home.goalsAgainst / home.gamesPlayed) / 2;
  if (lambda > 10 || mu > 10) return null;
  const distribution = rate => {
    const p = [Math.exp(-rate)];
    for (let k = 1; k <= 60; k++) p.push(p[k - 1] * rate / k);
    return p;
  };
  const hp = distribution(lambda), ap = distribution(mu);
  const sums = { homeWin: 0, draw: 0, awayWin: 0, bttsYes: 0, over15: 0, over25: 0, over35: 0 };
  const scores = [];
  let mass = 0;
  hp.forEach((p, h) => ap.forEach((q, a) => {
    const probability = p * q;
    mass += probability;
    sums[h > a ? 'homeWin' : h === a ? 'draw' : 'awayWin'] += probability;
    if (h > 0 && a > 0) sums.bttsYes += probability;
    for (const [key, line] of [['over15', 1.5], ['over25', 2.5], ['over35', 3.5]]) {
      if (h + a > line) sums[key] += probability;
    }
    scores.push({ score: `${h} - ${a}`, probability });
  }));
  const probabilities = Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, v / mass * 100]));
  probabilities.bttsNo = 100 - probabilities.bttsYes;
  probabilities.under25 = 100 - probabilities.over25;
  probabilities.cornerOver95 = null;
  probabilities.confidence = null;
  scores.sort((a, b) => b.probability - a.probability);
  return {
    probabilities,
    predictedScore: scores[0].score,
    scoreDistribution: scores.slice(0, 9).map(s => ({ ...s, probability: s.probability / mass * 100 })),
    method: 'Poisson independiente sobre goles de temporada',
    sampleSize: { home: home.gamesPlayed, away: away.gamesPlayed },
    expectedGoals: { home: lambda, away: mu },
    limitations: 'Estimación experimental no calibrada. No es xG ni una garantía. No incorpora lesiones, alineaciones ni dependencia entre goles.'
  };
}

export function buildPick(match) {
  if (!match || match.status !== 'SCHEDULED' || Date.parse(match.kickoff) <= Date.now()) return null;
  const probs = match.model?.probabilities || match.probabilities;
  if (!probs || !Object.keys(probs).length) return null;
  const labels = { homeWin: `${match.homeTeam.name} gana (1)`, draw: 'Empate (X)', awayWin: `${match.awayTeam.name} gana (2)`, over25: 'Más de 2.5 goles', under25: 'Menos de 2.5 goles' };
  const candidates = Object.entries(labels)
    .filter(([key]) => Number.isFinite(match.odds?.[key]) && match.odds[key] > 1 && Number.isFinite(probs[key]))
    .map(([market, selection]) => ({ market, selection, odds: match.odds[market], probability: probs[market] }))
    .sort((a, b) => b.probability - a.probability);
  if (!candidates.length) return null;
  return { ...candidates[0], type: 'Selección del modelo (experimental)', settlement: 'PENDING', predictedScore: match.model?.predictedScore || null, summaryRationale: match.model?.limitations || 'Selección cuantitativa basada en probabilidades y cuotas publicadas.' };
}
