import React from 'react';
import { Plus, Check, Layers } from 'lucide-react';
import { getTop3Opportunities, getEffectiveOdds } from '../utils/mathProbabilities';
import { formatOdds } from '../utils/oddsFormatter';
import { sounds } from '../utils/audioEffects';

export default function VerifiedPicks({ 
  match, 
  onAddToParlay, 
  onToggleParlay,
  parlayLegs = [],
  oddsFormat = 'decimal' 
}) {
  const rawPicks = getTop3Opportunities(match);
  if (!rawPicks.length) return <p className="p-4 text-slate-400 text-sm font-mono">Sin datos suficientes para generar selecciones previas al partido.</p>;
  const isClosed = Boolean(match?.status && match.status !== 'SCHEDULED');
  const picks = rawPicks.map(p => {
    const effective = getEffectiveOdds(p);
    return { ...p, effectiveOdds: effective };
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-slate-400 font-sans">
          {isClosed
            ? 'Selecciones previas al partido calculadas antes del inicio (mercado cerrado para apuestas previas).'
            : 'Probabilidades estimadas por modelo cuantitativo. Puedes añadir las selecciones directamente a tu parlay.'}
        </p>
        {parlayLegs?.length > 0 && (
          <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center space-x-1 shrink-0">
            <Check className="w-3 h-3 text-emerald-400" />
            <span>{parlayLegs.length} {parlayLegs.length === 1 ? 'pick en ticket' : 'picks en ticket'}</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {picks.map(pick => {
          const finalOdds = pick.odds ?? pick.effectiveOdds;
          const isInParlay = Boolean(parlayLegs?.some(
            l => l.matchId === pick.matchId && l.selection === pick.selection
          ));
          const currentMatchLeg = parlayLegs?.find(l => l.matchId === pick.matchId);
          const hasOtherFromSameMatch = Boolean(currentMatchLeg && currentMatchLeg.selection !== pick.selection);

          const handleClick = () => {
            if (isClosed || !finalOdds) return;
            if (isInParlay) {
              sounds.playClick();
              if (onToggleParlay) {
                onToggleParlay(pick);
              } else if (onAddToParlay) {
                onAddToParlay({ ...pick, odds: finalOdds });
              }
            } else {
              sounds.playAddParlay();
              if (onToggleParlay) {
                onToggleParlay({ ...pick, odds: finalOdds });
              } else if (onAddToParlay) {
                onAddToParlay({ ...pick, odds: finalOdds });
              }
            }
          };

          return (
            <article 
              key={pick.key} 
              className={`rounded-xl p-4 space-y-3 flex flex-col justify-between transition-all duration-200 border ${
                isInParlay
                  ? 'border-emerald-500/80 bg-[#0f1d24] shadow-[0_0_20px_rgba(16,185,129,0.25)] ring-1 ring-emerald-400/50'
                  : 'border-emerald-500/30 bg-[#111723] hover:border-sky-500/40'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-1.5 flex-wrap">
                  <p className="text-emerald-300 font-bold text-sm">{pick.probability}% · {pick.selection}</p>
                  {isInParlay && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 text-[9.5px] font-mono font-bold flex items-center space-x-1 shrink-0 animate-fade-in shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>EN TU TICKET</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300">{pick.rationale}</p>
                <p className="text-sm font-mono text-slate-300">
                  {pick.odds 
                    ? <span>Cuota publicada: <strong className="text-emerald-400">{formatOdds(pick.odds, oddsFormat)}</strong></span>
                    : <span>Cuota estimada: <strong className="text-sky-400">{formatOdds(pick.effectiveOdds, oddsFormat)}</strong></span>}
                </p>
              </div>

              <button
                type="button"
                disabled={isClosed || !finalOdds}
                onClick={handleClick}
                className={`text-xs rounded-xl p-2.5 font-semibold transition-all duration-200 cursor-pointer flex items-center justify-center space-x-1.5 active:scale-95 ${
                  isClosed || !finalOdds
                    ? 'border border-white/10 text-slate-500 opacity-40 cursor-not-allowed'
                    : isInParlay
                      ? 'border border-emerald-400/80 bg-emerald-500/25 hover:bg-rose-500/20 text-emerald-200 hover:text-rose-200 hover:border-rose-400/60 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                      : hasOtherFromSameMatch
                        ? 'border border-amber-500/50 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 shadow-sm'
                        : 'border border-sky-500/50 bg-sky-500/15 hover:bg-sky-500/30 hover:border-sky-400 text-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.15)]'
                }`}
              >
                {isClosed ? (
                  <span>{match?.status === 'LIVE' ? 'Partido en vivo (Cerrado)' : 'Partido finalizado (Cerrado)'}</span>
                ) : !finalOdds ? (
                  <span>Sin datos</span>
                ) : isInParlay ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                    <span>✓ En tu Parlay (Quitar)</span>
                  </>
                ) : hasOtherFromSameMatch ? (
                  <>
                    <Layers className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    <span>Cambiar selección en Parlay</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                    <span>Agregar al parlay</span>
                  </>
                )}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
