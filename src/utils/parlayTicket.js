import { getEffectiveOdds } from './mathProbabilities.js';
import { parseDecimalOdds } from './oddsFormatter.js';

export function normalizeMatchId(value) {
  if (typeof value === 'string') return value.trim();
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

export function isSameMatch(left, right) {
  const id = normalizeMatchId(left);
  return Boolean(id) && id === normalizeMatchId(right);
}

export function normalizeParlayLeg(raw) {
  const matchId = normalizeMatchId(raw?.matchId);
  const selection = typeof raw?.selection === 'string' ? raw.selection.trim() : '';
  const odds = raw?.odds == null ? getEffectiveOdds(raw) : parseDecimalOdds(raw.odds);
  const probability = raw?.probability == null ? null : Number(raw.probability);
  if (!matchId || !selection || !Number.isFinite(odds) || odds <= 1 || odds > 1000 ||
      (probability != null && (!Number.isFinite(probability) || probability < 0 || probability > 100))) return null;
  const oddsKind = raw.oddsKind || (raw.odds == null ? 'theoretical' : 'published');
  return { ...raw, matchId, selection, odds, probability, oddsKind };
}

export const EMPTY_PARLAY = { legs: [], notice: '' };

// A reducer processes every action against the latest ticket, including batched taps.
// One match contributes one selection and one decimal odd to the product.
export function parlayTicketReducer(state, action) {
  if (action.type === 'clear') return { ...EMPTY_PARLAY };
  if (action.type === 'remove') {
    return { legs: state.legs.filter(leg => !isSameMatch(leg.matchId, action.leg?.matchId)), notice: '' };
  }
  if (action.type === 'replace') {
    const raw = action.legs;
    const legs = Array.isArray(raw) ? raw.map(normalizeParlayLeg) : [];
    if (!legs.length || legs.length > 20 || legs.some(leg => !leg) || new Set(legs.map(leg => leg.matchId)).size !== legs.length) {
      return { ...state, notice: 'No se pudo cargar el parlay: contiene selecciones o cuotas inválidas.' };
    }
    return { legs, notice: 'Parlay Banquero IA del Día cargado. Reemplaza el boleto anterior.' };
  }
  if (action.type !== 'add' && action.type !== 'toggle') return state;

  const items = Array.isArray(action.legs) ? action.legs : [action.leg];
  const legs = [...state.legs];
  let added = 0, replaced = 0, removed = 0;
  for (const raw of items) {
    const leg = normalizeParlayLeg(raw);
    if (!leg) continue;
    const index = legs.findIndex(existing => isSameMatch(existing.matchId, leg.matchId));
    if (index >= 0) {
      if (action.type === 'toggle' && legs[index].selection === leg.selection) {
        legs.splice(index, 1);
        removed++;
      } else {
        // Refresh the same selection's odds as well; never append a second market.
        legs[index] = leg;
        replaced++;
      }
    } else if (legs.length < 20) {
      legs.push(leg);
      added++;
    }
  }
  const notice = removed ? 'Selección eliminada del parlay.'
    : added ? `Añadidas ${added} ${added === 1 ? 'selección' : 'selecciones'} al parlay.`
    : replaced ? 'Selección y cuota actualizadas en el parlay.'
    : 'No se añadieron selecciones. Revisa las cuotas o el límite de 20 partidos.';
  return { legs, notice };
}
