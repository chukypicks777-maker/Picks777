import React from 'react';
import { getTop3Opportunities } from '../utils/mathProbabilities';
import { formatOdds } from '../utils/oddsFormatter';
export default function VerifiedPicks({ match, onAddToParlay, oddsFormat }) {
  const picks = getTop3Opportunities(match);
  if (!picks.length) return <p className="p-4 text-slate-400 text-sm">Sin datos suficientes para generar selecciones previas al partido.</p>;
  return <div className="space-y-3"><p className="text-xs text-slate-400">Probabilidades estimadas, no resultados garantizados. El marcador individual más probable puede diferir del resultado agregado de victoria o empate.</p>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">{picks.map(pick => <article key={pick.key} className="rounded-xl border border-emerald-500/30 bg-[#111723] p-4 space-y-3">
      <p className="text-emerald-300 font-bold">{pick.probability}% · {pick.selection}</p>
      <p className="text-xs text-slate-300">{pick.rationale}</p>
      <p className="text-sm text-slate-300">Cuota publicada: {formatOdds(pick.odds, oddsFormat)}</p>
      <button disabled={!pick.odds} onClick={() => onAddToParlay?.(pick)} className="text-xs rounded-lg border border-sky-500/30 text-sky-300 p-2 disabled:opacity-40">{pick.odds ? 'Agregar al parlay' : 'Sin cuota publicada'}</button>
    </article>)}</div></div>;
}
