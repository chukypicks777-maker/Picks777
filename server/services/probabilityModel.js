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
  const sums = { homeWin: 0, draw: 0, awayWin: 0, bttsYes: 0, over15: 0, over25: 0, over35: 0, over45: 0 };
  const scores = [];
  let mass = 0;
  hp.forEach((p, h) => ap.forEach((q, a) => {
    const probability = p * q;
    mass += probability;
    sums[h > a ? 'homeWin' : h === a ? 'draw' : 'awayWin'] += probability;
    if (h > 0 && a > 0) sums.bttsYes += probability;
    for (const [key, line] of [['over15', 1.5], ['over25', 2.5], ['over35', 3.5], ['over45', 4.5]]) {
      if (h + a > line) sums[key] += probability;
    }
    scores.push({ score: `${h} - ${a}`, probability });
  }));
  const probabilities = Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, v / mass * 100]));
  probabilities.bttsNo = 100 - probabilities.bttsYes;
  probabilities.under15 = 100 - probabilities.over15;
  probabilities.under25 = 100 - probabilities.over25;
  probabilities.under35 = 100 - probabilities.over35;
  probabilities.under45 = 100 - probabilities.over45;
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
    limitations: 'Proyección matemática basada en la distribución de Poisson y medias históricas oficiales.'
  };
}

export function buildPick(match) {
  if (!match || match.status !== 'SCHEDULED' || Date.parse(match.kickoff) <= Date.now()) return null;
  const probs = match.model?.probabilities || match.probabilities;
  if (!probs || !Object.keys(probs).length) return null;

  const homeName = match.homeTeam?.name || 'Local';
  const awayName = match.awayTeam?.name || 'Visita';
  const homeShort = match.homeTeam?.shortName || homeName;
  const awayShort = match.awayTeam?.shortName || awayName;
  const homeGP = match.homeTeam?.gamesPlayed || (match.homeTeam?.homeRecord ? (match.homeTeam.homeRecord.w + match.homeTeam.homeRecord.d + match.homeTeam.homeRecord.l) : null) || 15;
  const awayGP = match.awayTeam?.gamesPlayed || (match.awayTeam?.awayRecord ? (match.awayTeam.awayRecord.w + match.awayTeam.awayRecord.d + match.awayTeam.awayRecord.l) : null) || 15;
  const homeAvgGF = match.homeTeam?.avgGoalsScored ? Number(match.homeTeam.avgGoalsScored).toFixed(1) : ((match.homeTeam?.goalsFor != null && homeGP) ? (match.homeTeam.goalsFor / homeGP).toFixed(1) : null);
  const awayAvgGF = match.awayTeam?.avgGoalsScored ? Number(match.awayTeam.avgGoalsScored).toFixed(1) : ((match.awayTeam?.goalsFor != null && awayGP) ? (match.awayTeam.goalsFor / awayGP).toFixed(1) : null);
  const combinedGF = (homeAvgGF && awayAvgGF) ? (parseFloat(homeAvgGF) + parseFloat(awayAvgGF)).toFixed(1) : null;

  const labels = {
    homeWin: `${homeName} Victoria Directa (1)`,
    draw: 'Empate (X)',
    awayWin: `${awayName} Victoria Directa (2)`,
    over25: 'Más de 2.5 goles',
    under25: 'Menos de 2.5 goles'
  };

  const rationales = {
    homeWin: `Ventaja de local marcada: ${homeShort} ${homeAvgGF ? `promedia ${homeAvgGF} goles/p y ` : ''}sostiene ${Math.round(probs.homeWin || 50)}% de probabilidad de triunfo según Poisson.`,
    awayWin: `Superioridad técnica visitante: ${awayShort} ${awayAvgGF ? `promedia ${awayAvgGF} goles/p con ` : ''}${Math.round(probs.awayWin || 50)}% de probabilidad estadística de triunfo.`,
    draw: `Escenario de paridad alta con defensas compactas y ${Math.round(probs.draw || 28)}% de probabilidad de empate.`,
    over25: `Tendencia ofensiva acelerada: ${combinedGF ? `Promedio conjunto de ${combinedGF} goles/p y ` : ''}${Math.round(probs.over25 || 55)}% de probabilidad de 3 o más goles.`,
    under25: `Perfil defensivo cerrado: Solidez en repliegue y baja tasa de conversión rival (${Math.round(probs.under25 || 55)}% de probabilidad de Under 2.5).`
  };

  const candidates = Object.entries(labels)
    .filter(([key]) => Number.isFinite(match.odds?.[key]) && match.odds[key] > 1 && Number.isFinite(probs[key]))
    .map(([market, selection]) => ({
      market,
      selection,
      odds: match.odds[market],
      probability: probs[market],
      rationale: rationales[market]
    }))
    .sort((a, b) => b.probability - a.probability);

  if (!candidates.length) return null;
  const top = candidates[0];

  return {
    market: top.market,
    selection: top.selection,
    odds: Number(Number(top.odds || 1.45).toFixed(2)),
    probability: Math.round(top.probability),
    type: '💎 Pick Banquero Principal',
    confidence: `${Math.round(top.probability)}%`,
    settlement: 'PENDING',
    predictedScore: match.model?.predictedScore || null,
    summaryRationale: top.rationale || `Selección cuantitativa con ${Math.round(top.probability)}% de probabilidad estadística respaldada por el modelo Poisson.`
  };
}
