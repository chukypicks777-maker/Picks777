import { validNumber, parseNumeric, percent, complement, totalLines, poissonProbability, poissonCumulative } from './probability.js';
import { parseDecimalOdds } from './oddsFormatter.js';
import { footballProbabilityLabel, footballProbabilitySource } from './marketProbability.js';
import { FOOTBALL_MODEL, countDistribution, countLines } from './footballModel.js';
export { poissonProbability, poissonCumulative };
const probabilityValue = value => { const n = parseNumeric(value); return n !== null && n >= 0 && n <= 100 ? n : null; };
const CORNER_LINES = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5];
export function calculateCornerProbabilities(avgCorners) {
  const lines = totalLines(avgCorners, CORNER_LINES);
  return { lambda: validNumber(avgCorners) ? avgCorners : null, ...lines, over5: lines.over55, under5: lines.under55 };
}
// Opponent-adjusted expectation with the overdispersion measured in the backtest.
function modelCornerProbabilities(expected, size) {
  const raw = countLines(countDistribution(expected, size), CORNER_LINES);
  const lines = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Number.isFinite(value) ? Math.round(value) : null]));
  return { ...lines, over5: lines.over55, under5: lines.under55 };
}
const meanGoals = (t, field, avg) => validNumber(t[avg]) ? t[avg] : validNumber(t[field]) && t.gamesPlayed > 0 ? t[field] / t.gamesPlayed : null;
const subtract = (a, b) => Number.isFinite(a) && Number.isFinite(b) ? Number((a - b).toFixed(2)) : null;
const sum = (a, b) => validNumber(a) && validNumber(b) ? a + b : null;
export function calculateTeamDetailedStats(team = {}, isHome = true, match = {}) {
  const avgGF = meanGoals(team, 'goalsFor', 'avgGoalsScored');
  const avgGC = meanGoals(team, 'goalsAgainst', 'avgGoalsConceded');
  const expGoals = match.model?.expectedGoals?.[isHome ? 'home' : 'away'] ?? avgGF;
  const goals = totalLines(expGoals);

  const cards = validNumber(team.avgYellowCards)
    ? team.avgYellowCards
    : null;
  const avgCorners = validNumber(team.avgCorners)
    ? team.avgCorners
    : null;
  const side = isHome ? 'home' : 'away';
  const expectedCorners = match.model?.corners?.expected?.[side];
  const corners = validNumber(expectedCorners)
    ? { lambda: avgCorners, ...modelCornerProbabilities(expectedCorners, FOOTBALL_MODEL.corners.size[side]) }
    : calculateCornerProbabilities(avgCorners);

  let cleanSheetRate = percent(team.cleanSheetRate);
  if (cleanSheetRate === null && Array.isArray(match.recentMatches)) {
    const targetId = team.id ? String(team.id) : (isHome ? String(match.homeTeamId || '') : String(match.awayTeamId || ''));
    const targetName = (team.name || '').toLowerCase().trim();
    const group = match.recentMatches.find(g => {
      if (targetId && String(g.teamId) === targetId) return true;
      if (!g.team || !targetName) return false;
      const gName = g.team.toLowerCase().trim();
      return gName === targetName || gName.includes(targetName) || targetName.includes(gName);
    });
    if (group && Array.isArray(group.events)) {
      let clean = 0, count = 0;
      for (const e of group.events) {
        if (!e.score) continue;
        const parts = e.score.split('-').map(s => Number(s.trim()));
        if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
          count++;
          const rivalScore = e.atVs === '@' ? parts[0] : parts[1];
          if (rivalScore === 0) clean++;
        }
      }
      if (count >= 5) cleanSheetRate = Math.round((clean / count) * 100);
    }
  }
  const bttsRate = percent(team.bttsRate);
  const gamesPlayed = team.gamesPlayed ?? null;

  return {
    name: team.name || (isHome ? 'Local' : 'Visitante'), shortName: team.shortName || (isHome ? 'LOC' : 'VIS'), logo: team.logo,
    position: team.position ?? null, points: team.points ?? null, gamesPlayed,
    form: Array.isArray(team.form) ? team.form : [], goalsFor: team.goalsFor ?? null,
    goalsAgainst: team.goalsAgainst ?? null,
    avgGF, avgGC, goalDiff: subtract(team.goalsFor, team.goalsAgainst),
    ...Object.fromEntries(Object.entries(goals).map(([k, v]) => [`${k}Rate`, v])),
    bttsRate, cleanSheetRate,
    avgCorners: corners.lambda, avgCornersConceded: team.avgCornersConceded ?? null, expectedCorners: validNumber(expectedCorners) ? expectedCorners : null,
    ...Object.fromEntries(Object.entries(corners).filter(([k]) => k !== 'lambda').map(([k, v]) => [`corner${k[0].toUpperCase()}${k.slice(1)}`, v])),
    ...Object.fromEntries(Object.entries(totalLines(cards)).map(([k, v]) => [`cards${k[0].toUpperCase()}${k.slice(1)}`, v])),
    fouls: validNumber(team.avgFouls) ? team.avgFouls : null,
    cards, sampleSizes: team.sampleSizes,
    statsSource: team.statsSource,
    statsFetchedAt: team.statsFetchedAt
  };
}
export function calculateDifferential(home, away, match = {}) {
  const p = match.model?.probabilities || match.probabilities || {};
  const cornerGap = subtract(home.avgCorners, away.avgCorners);
  const over25 = percent(p.over25), under25 = complement(over25);
  // Rated, opponent-adjusted totals when the league model exists; otherwise
  // the plain sum of both recorded averages.
  const modelCorners = match.model?.corners, modelCards = match.model?.cards;
  const margin = subtract(over25, under25), totalMatchCorners = modelCorners?.expected?.total ?? sum(home.avgCorners, away.avgCorners);
  return {
    goalDiffGap: subtract(home.goalDiff, away.goalDiff), attackDefenseHome: subtract(home.avgGF, away.avgGC),
    attackDefenseAway: subtract(away.avgGF, home.avgGC), cornerGap,
    cornerAdvantageTeam: cornerGap === null ? null : cornerGap >= 0 ? home.shortName : away.shortName,
    cornerAdvantageAbs: cornerGap === null ? null : Math.abs(cornerGap),
    cornerDifferentialText: cornerGap === null ? 'Sin datos suficientes' : `Diferencia histórica: ${cornerGap} córners/p`,
    totalMatchCorners, matchCornersProbs: modelCorners?.total ? { lambda: totalMatchCorners, ...modelCorners.total } : calculateCornerProbabilities(totalMatchCorners),
    matchCardsProbs: modelCards?.total || totalLines(sum(home.cards, away.cards)),
    over15: percent(p.over15), under15: complement(p.over15), over25, under25,
    over35: percent(p.over35), under35: complement(p.over35), overUnderMargin: margin,
    overUnderTendency: margin === null ? 'Sin datos suficientes' : margin > 0 ? 'Mayor probabilidad Over' : margin < 0 ? 'Mayor probabilidad Under' : 'Equilibrado'
  };
}
export function getTop3Opportunities(match) {
  if (!match || ['LIVE', 'FINISHED', 'POSTPONED', 'CANCELLED', 'SUSPENDED', 'ABANDONED', 'DELAYED', 'UNKNOWN'].includes(match.status)) return [];
  const p = { ...(match.model?.probabilities || match.probabilities || {}) };

  const parseOddsNum = val => {
    const n = parseDecimalOdds(val);
    return Number.isFinite(n) && n > 1 ? n : null;
  };
  const oddsH = parseOddsNum(match.odds?.homeWin);
  const oddsD = parseOddsNum(match.odds?.draw);
  const oddsA = parseOddsNum(match.odds?.awayWin);
  if ((p.homeWin == null || p.draw == null || p.awayWin == null) && oddsH && oddsD && oddsA) {
    const invH = 1 / oddsH, invD = 1 / oddsD, invA = 1 / oddsA;
    const invSum = invH + invD + invA;
    if (invSum > 0) {
      if (p.homeWin == null) p.homeWin = (invH / invSum) * 100;
      if (p.draw == null) p.draw = (invD / invSum) * 100;
      if (p.awayWin == null) p.awayWin = (invA / invSum) * 100;
    }
  }
  const oddsOver25 = parseOddsNum(match.odds?.over25);
  const oddsUnder25 = parseOddsNum(match.odds?.under25);
  if ((p.over25 == null || p.under25 == null) && oddsOver25 && oddsUnder25) {
    const invO = 1 / oddsOver25, invU = 1 / oddsUnder25;
    const invSum = invO + invU;
    if (invSum > 0) {
      if (p.over25 == null) p.over25 = (invO / invSum) * 100;
      if (p.under25 == null) p.under25 = (invU / invSum) * 100;
    }
  }

  const candidates = [];
  const add = (key, selection, market, probability, category) => {
    if (percent(probability) === null) return;
    const rawOdds = match.odds?.[key];
    const oddsNum = parseDecimalOdds(rawOdds);
    const odds = Number.isFinite(oddsNum) && oddsNum > 1 ? Number(oddsNum.toFixed(2)) : null;
    const rounded = percent(probability);
    const estimatedOdds = Number.isFinite(rounded) && rounded > 0 ? Number(Math.max(1.01, 100 / rounded).toFixed(2)) : null;
    candidates.push({ key, selection, market, category, probability: rounded, safetyScore: rounded,
      odds,
      estimatedOdds,
      probabilitySource: footballProbabilitySource(match, key.startsWith('dc') ? 'homeWin' : key),
      oddsKind: odds != null ? 'published' : 'theoretical',
      rationale: `Probabilidad estimada de ${rounded}% para ${selection.toLowerCase()}. ${footballProbabilityLabel(match, key.startsWith('dc') ? 'homeWin' : key)}.`,
      matchId: match.id, matchTitle: `${match.homeTeam?.name || 'Local'} vs ${match.awayTeam?.name || 'Visitante'}`, league: match.leagueName });
  };
  const home = match.homeTeam?.shortName || match.homeTeam?.name || 'Local', away = match.awayTeam?.shortName || match.awayTeam?.name || 'Visitante';
  add('homeWin', `Gana ${home}`, '1X2', p.homeWin, 'result');
  add('awayWin', `Gana ${away}`, '1X2', p.awayWin, 'result');
  if ([p.homeWin, p.draw, p.awayWin].every(v => percent(v) !== null) && Math.abs(p.homeWin + p.draw + p.awayWin - 100) <= 2.5) {
    add('dc1X', `${home} o Empate (1X)`, 'Doble Oportunidad (1X)', p.homeWin + p.draw, 'result');
    add('dcX2', `${away} o Empate (X2)`, 'Doble Oportunidad (X2)', p.awayWin + p.draw, 'result');
  }
  for (const [key, line] of [['15', 1.5], ['25', 2.5], ['35', 3.5]]) {
    add(`over${key}`, `Más de ${line} Goles`, `Total Goles Over ${line}`, p[`over${key}`], 'goals');
    add(`under${key}`, `Menos de ${line} Goles`, `Total Goles Under ${line}`, p[`under${key}`], 'goals');
  }
  add('bttsYes', 'Ambos anotan: Sí', 'Ambos anotan', p.bttsYes, 'btts');
  add('bttsNo', 'Ambos anotan: No', 'Ambos anotan', p.bttsNo, 'btts');
  const selected = [], used = new Set();
  const accepts = (c, h, a) => c.key === 'homeWin' ? h > a : c.key === 'awayWin' ? a > h : c.key === 'dc1X' ? h >= a : c.key === 'dcX2' ? a >= h : c.key === 'bttsYes' ? h > 0 && a > 0 : c.key === 'bttsNo' ? h === 0 || a === 0 : c.key.startsWith('over') ? h + a > Number(c.key.slice(4)) / 10 : h + a < Number(c.key.slice(5)) / 10;
  for (const candidate of candidates.sort((a, b) => b.probability - a.probability)) {
    if (candidate.probability < 50 || used.has(candidate.category)) continue;
    let compatible = false;
    for (let h = 0; h <= 10; h++) for (let a = 0; a <= 10; a++) if ([...selected, candidate].every(c => accepts(c, h, a))) compatible = true;
    if (!compatible) continue;
    used.add(candidate.category); selected.push(candidate);
    if (selected.length === 3) break;
  }
  if (selected.length === 0 && candidates.length > 0) {
    selected.push(candidates[0]);
  }
  if (match.aiPick?.selection) {
    const prob = percent(match.aiPick.probability);
    if (prob !== null && prob > 0) {
      const rawOdds = parseOddsNum(match.aiPick.odds);
      const estOdds = parseOddsNum(match.aiPick.estimatedOdds) || Number(Math.max(1.01, 100 / prob).toFixed(2));
      const aiCandidate = {
        key: match.aiPick.key || 'aiPick',
        probabilitySource: match.aiPick.probabilitySource,
        oddsKind: rawOdds ? 'published' : 'theoretical',
        selection: match.aiPick.selection,
        market: match.aiPick.market || 'Pronóstico IA',
        category: 'ai',
        probability: prob,
        safetyScore: prob,
        odds: rawOdds,
        estimatedOdds: estOdds,
        rationale: match.aiPick.summaryRationale || `Pronóstico cuantitativo IA con ${prob}% de probabilidad.`,
        matchId: match.id,
        matchTitle: `${match.homeTeam?.name || 'Local'} vs ${match.awayTeam?.name || 'Visitante'}`,
        league: match.leagueName
      };
      if (selected.length === 0) {
        selected.push(aiCandidate);
      } else if (match.isAiAnalyzed || match.aiReport) {
        const matchIdx = selected.findIndex(c => c.selection === match.aiPick.selection);
        if (matchIdx >= 0) {
          selected[matchIdx] = { ...selected[matchIdx], ...aiCandidate };
          if (matchIdx > 0) {
            const [promoted] = selected.splice(matchIdx, 1);
            selected.unshift(promoted);
          }
        } else {
          selected.unshift(aiCandidate);
          if (selected.length > 3) selected.pop();
        }
      }
    }
  }
  return selected;
}
export function deriveSeasonPoisson(match) {
  if (match?.goalMarketsConflict) return null;
  if (!match) return null;
  const home = match.homeTeam || {};
  const away = match.awayTeam || {};
  const getGP = t => {
    if (!t) return null;
    if (Number.isFinite(t.gamesPlayed)) return t.gamesPlayed;
    if (t.homeRecord && Number.isFinite(t.homeRecord.w + t.homeRecord.d + t.homeRecord.l)) return t.homeRecord.w + t.homeRecord.d + t.homeRecord.l;
    if (t.awayRecord && Number.isFinite(t.awayRecord.w + t.awayRecord.d + t.awayRecord.l)) return t.awayRecord.w + t.awayRecord.d + t.awayRecord.l;
    if (t.record && Number.isFinite(t.record.w + t.record.d + t.record.l)) return t.record.w + t.record.d + t.record.l;
    return null;
  };
  const homeGP = getGP(home);
  const awayGP = getGP(away);
  if (Number.isFinite(homeGP) && homeGP >= 5 && Number.isFinite(awayGP) && awayGP >= 5 &&
      Number.isFinite(home.goalsFor) && home.goalsFor >= 0 && Number.isFinite(home.goalsAgainst) && home.goalsAgainst >= 0 &&
      Number.isFinite(away.goalsFor) && away.goalsFor >= 0 && Number.isFinite(away.goalsAgainst) && away.goalsAgainst >= 0) {
    const lambda = (home.goalsFor / homeGP + away.goalsAgainst / awayGP) / 2;
    const mu = (away.goalsFor / awayGP + home.goalsAgainst / homeGP) / 2;
    const totalLambda = lambda + mu;
    if (lambda > 0 && mu > 0 && lambda <= 10 && mu <= 10 && totalLambda <= 20) {
      const p0 = Math.exp(-totalLambda);
      const p1 = totalLambda * p0;
      const p2 = (totalLambda * totalLambda / 2) * p0;
      const pHome = 1 - Math.exp(-lambda);
      const pAway = 1 - Math.exp(-mu);
      return {
        over15: Math.round((1 - p0 - p1) * 100),
        over25: Math.round((1 - p0 - p1 - p2) * 100),
        bttsYes: Math.round(pHome * pAway * 100)
      };
    }
  }
  return null;
}

export function getContextualPick(match, marketFilter = 'all') {
  if (!match || ['LIVE', 'FINISHED', 'POSTPONED', 'CANCELLED', 'SUSPENDED', 'ABANDONED', 'DELAYED', 'UNKNOWN'].includes(match.status)) return null;

  const parseOddsNum = val => {
    const n = parseDecimalOdds(val);
    return Number.isFinite(n) && n > 1 ? Number(n.toFixed(2)) : null;
  };

  const p = { ...(match.model?.probabilities || match.probabilities || {}) };
  const poisson = deriveSeasonPoisson(match);
  const matchTitle = `${match.homeTeam?.name || 'Local'} vs ${match.awayTeam?.name || 'Visitante'}`;

  // Implied probabilities from odds if probabilities are absent
  const oddsOver25 = parseOddsNum(match.odds?.over25);
  const oddsUnder25 = parseOddsNum(match.odds?.under25);
  if ((p.over25 == null || p.under25 == null) && oddsOver25 && oddsUnder25) {
    const invO = 1 / oddsOver25, invU = 1 / oddsUnder25;
    const invSum = invO + invU;
    if (invSum > 0) {
      if (p.over25 == null) p.over25 = (invO / invSum) * 100;
      if (p.under25 == null) p.under25 = (invU / invSum) * 100;
    }
  }

  const oddsBttsYes = parseOddsNum(match.odds?.bttsYes);
  const oddsBttsNo = parseOddsNum(match.odds?.bttsNo);
  if ((p.bttsYes == null || p.bttsNo == null) && oddsBttsYes && oddsBttsNo) {
    const invY = 1 / oddsBttsYes, invN = 1 / oddsBttsNo;
    const invSum = invY + invN;
    if (invSum > 0) {
      if (p.bttsYes == null) p.bttsYes = (invY / invSum) * 100;
      if (p.bttsNo == null) p.bttsNo = (invN / invSum) * 100;
    }
  }

  const buildCandidate = (key, selection, market, category, rawProb, rawOdds) => {
    const prob = percent(rawProb);
    if (prob === null || prob <= 0) return null;
    const odds = parseOddsNum(rawOdds);
    const estimatedOdds = Number(Math.max(1.01, 100 / prob).toFixed(2));
    return {
      key,
      selection,
      market,
      category,
      probability: prob,
      safetyScore: prob,
      odds,
      estimatedOdds,
      probabilitySource: footballProbabilitySource(match, key),
      oddsKind: odds != null ? 'published' : 'theoretical',
      rationale: `Probabilidad estimada de ${prob}% para ${selection.toLowerCase()}. ${footballProbabilityLabel(match, key)}.`,
      matchId: match.id,
      matchTitle,
      league: match.leagueName
    };
  };

  if (marketFilter === 'over' || marketFilter === 'over25') {
    const prob25 = percent(p.over25) ?? percent(match.model?.probabilities?.over25) ?? percent(match.probabilities?.over25) ?? poisson?.over25;
    if (prob25 != null && prob25 >= 50) {
      const odds25 = match.odds?.over25;
      const rationale = match.model
        ? `Modelo Poisson proyecta ${prob25}% de probabilidad para Más de 2.5 Goles${match.model?.predictedScore ? ` (marcador previsto: ${match.model.predictedScore})` : ''}.`
        : `Probabilidad estimada de ${prob25}% para Más de 2.5 Goles según métricas de goles registradas.`;
      return buildCandidate('over25', 'Más de 2.5 Goles', 'Total Goles Over 2.5', 'goals', prob25, odds25, rationale);
    }
    return null;
  }

  if (marketFilter === 'btts') {
    const probBtts = percent(p.bttsYes) ?? percent(match.model?.probabilities?.bttsYes) ?? percent(match.probabilities?.bttsYes) ?? poisson?.bttsYes;
    if (probBtts != null && probBtts >= 50) {
      const oddsBtts = match.odds?.bttsYes;
      const rationale = match.model
        ? `Modelo Poisson proyecta ${probBtts}% de probabilidad de que ambos equipos anoten.`
        : `Probabilidad estimada de ${probBtts}% para Ambos Equipos Anotan (BTTS Sí).`;
      return buildCandidate('bttsYes', 'Ambos anotan: Sí', 'Ambos anotan', 'btts', probBtts, oddsBtts, rationale);
    }
    return null;
  }

  if (marketFilter === 'under' || marketFilter === 'under25') {
    const probUnder25 = percent(p.under25) ?? percent(match.model?.probabilities?.under25) ?? (p.over25 != null ? 100 - percent(p.over25) : (poisson?.over25 != null ? 100 - poisson.over25 : null));
    if (probUnder25 != null && probUnder25 >= 50) {
      const oddsUnder25 = match.odds?.under25;
      const rationale = match.model
        ? `Modelo Poisson proyecta ${probUnder25}% de probabilidad para Menos de 2.5 Goles.`
        : `Probabilidad estimada de ${probUnder25}% para Menos de 2.5 Goles según balance defensivo.`;
      return buildCandidate('under25', 'Menos de 2.5 Goles', 'Total Goles Under 2.5', 'goals', probUnder25, oddsUnder25, rationale);
    }
    return null;
  }

  return getBestBankerPick(match);
}

export const getBestBankerPick = match => getTop3Opportunities(match)[0] ?? null;
export function getEffectiveOdds(pick) {
  if (!pick) return null;
  const parseOddsNum = val => {
    const n = parseDecimalOdds(val);
    return Number.isFinite(n) && n > 1 ? Number(n.toFixed(2)) : null;
  };
  const realOdds = parseOddsNum(pick.odds);
  if (realOdds) return realOdds;
  const estOdds = parseOddsNum(pick.estimatedOdds);
  if (estOdds) return estOdds;
  const prob = typeof pick.probability === 'number' ? pick.probability : parseFloat(pick.probability);
  if (Number.isFinite(prob) && prob > 0) {
    return Number(Math.max(1.01, 100 / prob).toFixed(2));
  }
  return null;
}
export function getMatchSafetyScore(match) { return percent(match?.probabilities?.confidence) ?? getBestBankerPick(match)?.probability ?? 0; }
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

export function fillPoissonGoalLadder(probabilities = {}, odds = {}) {
  if (probabilities.goalMarketsConflict) return probabilities;
  const p = { ...probabilities };
  let prob25 = probabilityValue(p.over25);
  if (prob25 === null && odds?.over25 && odds?.under25) {
    const invO = 1 / Number(odds.over25), invU = 1 / Number(odds.under25);
    if (invO + invU > 0) prob25 = (invO / (invO + invU)) * 100;

  }
  if (prob25 !== null && prob25 > 0 && prob25 < 100) {
    const lambda = solvePoissonLambdaFromUnder25((100 - prob25) / 100);
    const p0 = Math.exp(-lambda);
    const p1 = lambda * p0;
    const p2 = (lambda * lambda / 2) * p0;
    const p3 = (lambda * lambda * lambda / 6) * p0;
    const p4 = (lambda * lambda * lambda * lambda / 24) * p0;

    if (p.over05 == null) p.over05 = Math.round((1 - p0) * 100);
    if (p.under05 == null) p.under05 = 100 - p.over05;
    if (p.over15 == null) p.over15 = Math.round((1 - p0 - p1) * 100);
    if (p.under15 == null) p.under15 = 100 - p.over15;
    if (p.over25 == null) p.over25 = prob25 ?? Math.round((1 - p0 - p1 - p2) * 100);
    if (p.under25 == null) p.under25 = 100 - p.over25;
    if (p.over35 == null) p.over35 = Math.round((1 - p0 - p1 - p2 - p3) * 100);
    if (p.under35 == null) p.under35 = 100 - p.over35;
    if (p.over45 == null) p.over45 = Math.round((1 - p0 - p1 - p2 - p3 - p4) * 100);
    if (p.under45 == null) p.under45 = 100 - p.over45;

    if (p.bttsYes == null) {
      let pH = percent(p.homeWin) ?? (odds?.homeWin ? 100 / Number(odds.homeWin) : null);
      let pA = percent(p.awayWin) ?? (odds?.awayWin ? 100 / Number(odds.awayWin) : null);
      const wH = (pH !== null && pA !== null && (pH + pA) > 0)
        ? Math.max(0.2, Math.min(0.8, Math.sqrt(pH) / (Math.sqrt(pH) + Math.sqrt(pA))))
        : 0.5;
      const lH = lambda * wH;
      const lA = lambda * (1 - wH);
      const probBtts = Math.round((1 - Math.exp(-lH)) * (1 - Math.exp(-lA)) * 100);
      p.bttsYes = probBtts;
      p.bttsNo = 100 - probBtts;
    } else if (p.bttsNo == null) {
      p.bttsNo = 100 - p.bttsYes;
    }
  }
  return p;
}

export function derivePoissonScoreFromMatch(match) {
  if (match?.goalMarketsConflict) return 'N/D';
  if (!match) return null;
  const p = match.model?.probabilities || match.probabilities || match.aiReport?.probabilities || {};
  let prob25 = probabilityValue(p.over25);
  if (prob25 === null && match.odds?.over25 && match.odds?.under25) {
    const invO = 1 / Number(match.odds.over25), invU = 1 / Number(match.odds.under25);
    if (invO + invU > 0) prob25 = (invO / (invO + invU)) * 100;

  }

  const home = match.homeTeam || {};
  const away = match.awayTeam || {};
  const homeGP = Number(home.gamesPlayed);
  const awayGP = Number(away.gamesPlayed);
  const hasStandings = Number.isFinite(homeGP) && homeGP >= 5 && Number.isFinite(awayGP) && awayGP >= 5 &&
    validNumber(home.goalsFor) && validNumber(away.goalsFor);

  let pH = percent(p.homeWin);
  let pA = percent(p.awayWin);
  if (pH === null && match.odds?.homeWin) {
    pH = 100 / Number(match.odds.homeWin);
  }
  if (pA === null && match.odds?.awayWin) {
    pA = 100 / Number(match.odds.awayWin);
  }

  // Reject empty fixtures that lack any statistical signal, odds or standings
  if (prob25 === null && pH === null && pA === null && !hasStandings) {
    return null;
  }

  let totalLambda;
  if (prob25 !== null && prob25 > 0 && prob25 < 100) {
    totalLambda = solvePoissonLambdaFromUnder25((100 - prob25) / 100);
  } else if (hasStandings) {
    totalLambda = Math.max(1.2, Math.min(6.5, (Number(home.goalsFor) / homeGP) + (Number(away.goalsFor) / awayGP)));
  } else {
    return null;
  }

  let wH;
  if (pH !== null && pA !== null && (pH + pA) > 0) {
    wH = Math.max(0.18, Math.min(0.82, Math.sqrt(pH) / (Math.sqrt(pH) + Math.sqrt(pA))));
  } else if (hasStandings) {
    const homeAttack = Number(home.goalsFor) / homeGP;
    const awayAttack = Number(away.goalsFor) / awayGP;
    wH = (homeAttack + awayAttack > 0)
      ? Math.max(0.18, Math.min(0.82, homeAttack / (homeAttack + awayAttack)))
      : 0.5;
  } else {
    wH = 0.5;
  }

  const lH = totalLambda * wH;
  const lA = totalLambda * (1 - wH);

  let bestScore = null, bestProb = -1;
  const fact = n => n <= 1 ? 1 : n * fact(n - 1);
  for (let h = 0; h <= 8; h++) {
    for (let a = 0; a <= 8; a++) {
      const prob = (Math.pow(lH, h) * Math.exp(-lH) / fact(h)) * (Math.pow(lA, a) * Math.exp(-lA) / fact(a));
      if (prob > bestProb) {
        bestProb = prob;
        bestScore = `${h} - ${a}`;
      }
    }
  }
  return bestScore;
}

export function calculateRealPoissonScore(match) {
  if (!match) return null;
  if (match.model?.predictedScore && /^\d+\s*-\s*\d+$/.test(match.model.predictedScore)) {
    return match.model.predictedScore;
  }
  if (match.probabilities?.predictedScore && /^\d+\s*-\s*\d+$/.test(match.probabilities.predictedScore)) {
    return match.probabilities.predictedScore;
  }
  if (match.aiPick?.predictedScore && /^\d+\s*-\s*\d+$/.test(match.aiPick.predictedScore)) {
    return match.aiPick.predictedScore;
  }
  if (match.aiReport?.predictedScore && /^\d+\s*-\s*\d+$/.test(match.aiReport.predictedScore)) {
    return match.aiReport.predictedScore;
  }
  return derivePoissonScoreFromMatch(match);
}

export const getCoherentPredictedScore = (match, fallback) => {
  if (!match) return 'N/D';
  const score = calculateRealPoissonScore(match);
  if (score) return score;
  if (fallback && typeof fallback === 'string' && /^\d+\s*-\s*\d+$/.test(fallback.trim())) {
    return fallback.trim();
  }
  return 'N/D';
};
