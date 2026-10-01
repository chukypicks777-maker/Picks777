import { normalizeMatchId } from './parlayTicket.js';

export function calculateParlay(legs = [], stake = 100) {
  if (!Array.isArray(legs) || legs.length > 20 || !Number.isFinite(stake) || stake < 0 || stake > 1000000) throw new Error('Importe o número de selecciones inválido.');
  if (legs.some(leg => !leg || !normalizeMatchId(leg.matchId) || !Number.isFinite(leg.odds) || leg.odds <= 1 || leg.odds > 1000 ||
      (leg.probability != null && (!Number.isFinite(leg.probability) || leg.probability < 0 || leg.probability > 100)))) throw new Error('Cuotas o probabilidades inválidas.');
  if (new Set(legs.map(leg => normalizeMatchId(leg.matchId))).size !== legs.length) throw new Error('No se combinan mercados del mismo partido: son dependientes.');
  const odds = legs.reduce((product, leg) => product * leg.odds, 1);
  const known = legs.length > 0 && legs.every(leg => leg.probability != null);
  return {
    legs, legCount: legs.length, stake, totalDecimalOdds: odds,
    totalAmericanOdds: odds >= 2 ? Math.round((odds - 1) * 100) : odds > 1 ? Math.round(-100 / (odds - 1)) : 0,
    potentialPayout: legs.length ? Number((stake * odds).toFixed(2)) : 0,
    netProfit: legs.length ? Number((stake * (odds - 1)).toFixed(2)) : 0,
    overallProbability: known ? legs.reduce((probability, leg) => probability * leg.probability / 100, 1) * 100 : null,
    warning: 'Cálculo informativo que supone independencia; no garantiza ganancias. Si una selección pierde, se pierde la combinada. Confirma cuotas y reglas en la casa de apuestas.'
  };
}
