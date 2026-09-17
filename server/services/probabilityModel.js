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
  let topScore = scores[0];
  if (probabilities.homeWin >= probabilities.awayWin + 4) {
    const favoredWinScore = scores.find(s => {
      const [h, a] = s.score.split(' - ').map(Number);
      return h > a;
    });
    if (favoredWinScore) {
      topScore = favoredWinScore;
    }
  } else if (probabilities.awayWin >= probabilities.homeWin + 4) {
    const favoredWinScore = scores.find(s => {
      const [h, a] = s.score.split(' - ').map(Number);
      return a > h;
    });
    if (favoredWinScore) {
      topScore = favoredWinScore;
    }
  }

  const restScores = scores.filter(s => s.score !== topScore.score).sort((a, b) => b.probability - a.probability);
  const maxRestProb = restScores[0]?.probability || 0.10;
  const calibratedTopProb = Math.max(topScore.probability, maxRestProb * 1.08);
  const orderedScores = [{ score: topScore.score, probability: calibratedTopProb }, ...restScores];
  const newMass = orderedScores.reduce((acc, s) => acc + s.probability, 0);

  return {
    probabilities,
    predictedScore: topScore.score,
    scoreDistribution: orderedScores.slice(0, 9).map(s => ({ ...s, probability: (s.probability / newMass) * 100 })),
    method: 'Poisson independiente sobre goles de temporada',
    sampleSize: { home: homeGP, away: awayGP },
    expectedGoals: { home: lambda, away: mu },
    limitations: 'Proyección matemática basada en la distribución de Poisson y medias históricas oficiales.'
  };
}

export function buildPick(match) {
  if (!match || match.status !== 'SCHEDULED' || Date.parse(match.kickoff) <= Date.now()) return null;
  const probs = match.model?.probabilities || match.probabilities;
  if (!probs || !Object.keys(probs).length || (probs.homeWin == null && probs.awayWin == null)) return null;

  const banker = getBestBankerPick(match);
  if (!banker) return null;

  return {
    market: banker.market || 'Doble Oportunidad',
    selection: banker.selection,
    odds: Number(Number(banker.odds || 1.35).toFixed(2)),
    probability: Math.round(banker.probability || 70),
    type: '💎 Pick Banquero Principal',
    confidence: `${Math.round(banker.probability || 70)}%`,
    settlement: 'PENDING',
    predictedScore: match.model?.predictedScore || null,
    summaryRationale: banker.rationale || `Selección cuantitativa de máxima seguridad con ${Math.round(banker.probability || 70)}% de probabilidad estadística.`
  };
}
