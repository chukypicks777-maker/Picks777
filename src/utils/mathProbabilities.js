import { validNumber, percent, complement, totalLines, poissonProbability, poissonCumulative } from './probability.js';
export { poissonProbability, poissonCumulative };
export function calculateCornerProbabilities(avgCorners) {
  const lines = totalLines(avgCorners, [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 8.5, 9.5]);
  return { lambda: validNumber(avgCorners) ? avgCorners : null, ...lines, over5: lines.over55, under5: lines.under55 };
}
const meanGoals = (t, field, avg) => validNumber(t[avg]) ? t[avg] : validNumber(t[field]) && t.gamesPlayed > 0 ? t[field] / t.gamesPlayed : null;
const subtract = (a, b) => Number.isFinite(a) && Number.isFinite(b) ? Number((a - b).toFixed(2)) : null;
const sum = (a, b) => validNumber(a) && validNumber(b) ? a + b : null;
export function calculateTeamDetailedStats(team = {}, isHome = true, match = {}) {
  const avgGF = meanGoals(team, 'goalsFor', 'avgGoalsScored');
  const avgGC = meanGoals(team, 'goalsAgainst', 'avgGoalsConceded');
  const goals = totalLines(match.model?.expectedGoals?.[isHome ? 'home' : 'away']);
  const cards = validNumber(team.avgYellowCards) ? team.avgYellowCards : null;
  const corners = calculateCornerProbabilities(team.avgCorners);
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
      if (count > 0) cleanSheetRate = Math.round((clean / count) * 100);
    }
  }
  if (cleanSheetRate === null && validNumber(avgGC)) {
    cleanSheetRate = Math.round(Math.exp(-avgGC) * 100);
  }
  return {
    name: team.name || (isHome ? 'Local' : 'Visitante'), shortName: team.shortName || (isHome ? 'LOC' : 'VIS'), logo: team.logo,
    position: team.position ?? null, points: team.points ?? null, gamesPlayed: team.gamesPlayed ?? null,
    form: Array.isArray(team.form) ? team.form : [], goalsFor: team.goalsFor ?? null, goalsAgainst: team.goalsAgainst ?? null,
    avgGF, avgGC, goalDiff: subtract(team.goalsFor, team.goalsAgainst),
    ...Object.fromEntries(Object.entries(goals).map(([k, v]) => [`${k}Rate`, v])),
    bttsRate: percent(team.bttsRate), cleanSheetRate,
    avgCorners: corners.lambda, avgCornersConceded: team.avgCornersConceded ?? null,
    ...Object.fromEntries(Object.entries(corners).filter(([k]) => k !== 'lambda').map(([k, v]) => [`corner${k[0].toUpperCase()}${k.slice(1)}`, v])),
    ...Object.fromEntries(Object.entries(totalLines(cards)).map(([k, v]) => [`cards${k[0].toUpperCase()}${k.slice(1)}`, v])),
    fouls: validNumber(team.avgFouls) ? team.avgFouls : null, cards, sampleSizes: team.sampleSizes,
    statsSource: team.statsSource, statsFetchedAt: team.statsFetchedAt
  };
}
export function calculateDifferential(home, away, match = {}) {
  const p = match.model?.probabilities || match.probabilities || {};
  const cornerGap = subtract(home.avgCorners, away.avgCorners);
  const over25 = percent(p.over25), under25 = complement(over25);
  const margin = subtract(over25, under25), totalMatchCorners = sum(home.avgCorners, away.avgCorners);
  return {
    goalDiffGap: subtract(home.goalDiff, away.goalDiff), attackDefenseHome: subtract(home.avgGF, away.avgGC),
    attackDefenseAway: subtract(away.avgGF, home.avgGC), cornerGap,
    cornerAdvantageTeam: cornerGap === null ? null : cornerGap >= 0 ? home.shortName : away.shortName,
    cornerAdvantageAbs: cornerGap === null ? null : Math.abs(cornerGap),
    cornerDifferentialText: cornerGap === null ? 'Sin datos suficientes' : `Diferencia histórica: ${cornerGap} córners/p`,
    totalMatchCorners, matchCornersProbs: calculateCornerProbabilities(totalMatchCorners), matchCardsProbs: totalLines(sum(home.cards, away.cards)),
    over15: percent(p.over15), under15: complement(p.over15), over25, under25,
    over35: percent(p.over35), under35: complement(p.over35), overUnderMargin: margin,
    overUnderTendency: margin === null ? 'Sin datos suficientes' : margin > 0 ? 'Mayor probabilidad Over' : margin < 0 ? 'Mayor probabilidad Under' : 'Equilibrado'
  };
}
export function getTop3Opportunities(match) {
  if (!match || match.status === 'POSTPONED' || match.status === 'CANCELLED') return [];
  const p = { ...(match.model?.probabilities || match.probabilities || {}) };

  const parseOddsNum = val => {
    const n = typeof val === 'number' ? val : parseFloat(val);
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
    const oddsNum = typeof rawOdds === 'number' ? rawOdds : parseFloat(rawOdds);
    const odds = Number.isFinite(oddsNum) && oddsNum > 1 ? Number(oddsNum.toFixed(2)) : null;
    const rounded = percent(probability);
    const estimatedOdds = Number.isFinite(rounded) && rounded > 0 ? Number(Math.max(1.01, 100 / rounded).toFixed(2)) : null;
    candidates.push({ key, selection, market, category, probability: rounded, safetyScore: rounded,
      odds,
      estimatedOdds,
      rationale: `Probabilidad estimada de ${rounded}% para ${selection.toLowerCase()}. ${match.model ? 'Modelo Poisson sobre goles registrados.' : 'Probabilidad implícita en las cuotas publicadas.'}`,
      matchId: match.id, matchTitle: `${match.homeTeam?.name || 'Local'} vs ${match.awayTeam?.name || 'Visitante'}`, league: match.leagueName });
  };
  const home = match.homeTeam?.shortName || match.homeTeam?.name || 'Local', away = match.awayTeam?.shortName || match.awayTeam?.name || 'Visitante';
  add('homeWin', `Gana ${home}`, '1X2', p.homeWin, 'result');
  add('awayWin', `Gana ${away}`, '1X2', p.awayWin, 'result');
  if ([p.homeWin, p.draw, p.awayWin].every(v => percent(v) !== null) && Math.abs(p.homeWin + p.draw + p.awayWin - 100) < 0.01) {
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
  if (selected.length === 0 && match.aiPick?.selection) {
    const prob = percent(match.aiPick.probability) || 50;
    const rawOdds = parseOddsNum(match.aiPick.odds);
    const estOdds = parseOddsNum(match.aiPick.estimatedOdds) || Number(Math.max(1.01, 100 / prob).toFixed(2));
    selected.push({
      key: 'aiPick',
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
    });
  }
  return selected;
}
export const getBestBankerPick = match => getTop3Opportunities(match)[0] ?? null;
export function getEffectiveOdds(pick) {
  if (!pick) return null;
  const parseOddsNum = val => {
    const n = typeof val === 'number' ? val : parseFloat(val);
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
export function calculateRealPoissonScore(match) { return match?.model?.predictedScore ?? null; }
export const getCoherentPredictedScore = match => calculateRealPoissonScore(match) ?? 'N/D';
