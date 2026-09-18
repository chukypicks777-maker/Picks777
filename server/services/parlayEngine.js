export function calculateParlay(legs = [], stake = 100) {
  if (!Array.isArray(legs) || legs.length > 20 || !Number.isFinite(stake) || stake < 0 || stake > 1000000) throw new Error('Importe o número de selecciones inválido.');
  if (new Set(legs.map(l => l.matchId)).size !== legs.length) throw new Error('No se combinan mercados del mismo partido: son dependientes.');
  if (legs.some(l => !l.matchId || !Number.isFinite(l.odds) || l.odds <= 1 || l.odds > 1000 || (l.probability != null && (!Number.isFinite(l.probability) || l.probability < 0 || l.probability > 100)))) throw new Error('Cuotas o probabilidades inválidas.');
  const odds = legs.reduce((acc, l) => acc * l.odds, 1);
  const known = legs.length > 0 && legs.every(l => l.probability != null);
  return {
    legs, legCount: legs.length, stake, totalDecimalOdds: odds,
    totalAmericanOdds: odds >= 2 ? Math.round((odds - 1) * 100) : odds > 1 ? Math.round(-100 / (odds - 1)) : 0,
    potentialPayout: legs.length ? Number((stake * odds).toFixed(2)) : 0,
    netProfit: legs.length ? Number((stake * (odds - 1)).toFixed(2)) : 0,
    overallProbability: known ? legs.reduce((p, l) => p * l.probability / 100, 1) * 100 : null,
    warning: 'Cálculo informativo que supone independencia; no garantiza ganancias. Si una selección pierde, se pierde la combinada. Confirma cuotas y reglas en la casa de apuestas.'
  };
}
export function getAiDailyParlay(matches = []) {
  const legs = matches.filter(m => m.status === 'SCHEDULED' && Date.parse(m.kickoff) > Date.now() && Number.isFinite(m.aiPick?.odds) && m.aiPick.odds > 1 && Date.now() - Date.parse(m.oddsFetchedAt) < 120000)
    .sort((a, b) => b.aiPick.probability - a.aiPick.probability)
    .slice(0, 3).map(m => ({ matchId: m.id, matchTitle: `${m.homeTeam.name} vs ${m.awayTeam.name}`, league: m.leagueName, ...m.aiPick, oddsFetchedAt: m.oddsFetchedAt }));
  return { bankerParlay: legs.length >= 2 ? { title: 'Combinada experimental', ...calculateParlay(legs) } : null, message: legs.length < 2 ? 'No hay suficientes selecciones con datos y cuotas disponibles.' : 'No constituye una apuesta segura.' };
}
