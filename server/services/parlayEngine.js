import { calculateParlay } from '../../src/utils/parlayCalculation.js';
export { calculateParlay };
export function getAiDailyParlay(matches = []) {
  const legs = matches.filter(m => {
    if (m.status !== 'SCHEDULED' || Date.parse(m.kickoff) <= Date.now()) return false;
    const odds = m.aiPick?.odds ?? m.aiPick?.estimatedOdds;
    return Number.isFinite(odds) && odds > 1;
  })
    .sort((a, b) => (b.aiPick?.probability || 0) - (a.aiPick?.probability || 0))
    .slice(0, 3).map(m => {
      const odds = m.aiPick?.odds ?? m.aiPick?.estimatedOdds;
      return { matchId: m.id, matchTitle: `${m.homeTeam.name} vs ${m.awayTeam.name}`, league: m.leagueName, ...m.aiPick, odds, oddsFetchedAt: m.oddsFetchedAt };
    });
  return { bankerParlay: legs.length >= 2 ? { title: 'Combinada experimental', ...calculateParlay(legs) } : null, message: legs.length < 2 ? 'No hay suficientes selecciones con datos y cuotas disponibles.' : 'No constituye una apuesta segura.' };
}
