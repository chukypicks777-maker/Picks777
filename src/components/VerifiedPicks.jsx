import React from 'react';
import { getTop3Opportunities, getEffectiveOdds } from '../utils/mathProbabilities';
import { formatOdds } from '../utils/oddsFormatter';
export default function VerifiedPicks({ match, onAddToParlay, oddsFormat }) {
  const rawPicks = getTop3Opportunities(match);
  if (!rawPicks.length) return <p className="p-4 text-slate-400 text-sm">Sin datos suficientes para generar selecciones previas al partido.</p>;
  const isClosed = Boolean(match?.status && match.status !== 'SCHEDULED');
  const picks = rawPicks.map(p => {
    const effective = getEffectiveOdds(p);
    return { ...p, effectiveOdds: effective };
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">
        {isClosed
          ? 'Selecciones previas al partido calculadas antes del inicio (mercado cerrado para apuestas previas).'
          : 'Probabilidades estimadas por modelo cuantitativo. Puedes añadir las selecciones directamente a tu parlay.'}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {picks.map(pick => {
          const finalOdds = pick.odds ?? pick.effectiveOdds;
          return (
            <article key={pick.key} className="rounded-xl border border-emerald-500/30 bg-[#111723] p-4 space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <p className="text-emerald-300 font-bold">{pick.probability}% · {pick.selection}</p>
                <p className="text-xs text-slate-300">{pick.rationale}</p>
                <p className="text-sm font-mono text-slate-300">
                  {pick.odds 
                    ? <span>Cuota publicada: <strong className="text-emerald-400">{formatOdds(pick.odds, oddsFormat)}</strong></span>
                    : <span>Cuota estimada: <strong className="text-sky-400">{formatOdds(pick.effectiveOdds, oddsFormat)}</strong></span>}
                </p>
              </div>
              <button
                disabled={isClosed || !finalOdds}
                onClick={() => onAddToParlay?.({ ...pick, odds: finalOdds })}
                className={`text-xs rounded-lg border p-2 font-medium transition cursor-pointer flex items-center justify-center space-x-1 ${
                  isClosed || !finalOdds
                    ? 'border-white/10 text-slate-500 opacity-40 cursor-not-allowed'
                    : 'border-sky-500/40 text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 shadow-sm'
                }`}
              >
                {isClosed
                  ? (match?.status === 'LIVE' ? 'Partido en vivo (Cerrado)' : 'Partido finalizado (Cerrado)')
                  : (finalOdds ? 'Agregar al parlay' : 'Sin datos')}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
