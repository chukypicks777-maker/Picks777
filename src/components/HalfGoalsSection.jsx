import React from 'react';
import { Lock, Crown, Sparkles } from 'lucide-react';
import NumberCounter from './NumberCounter';
import { sounds } from '../utils/audioEffects';

export default function HalfGoalsSection({ match, isVip = false, onUnlockVip = null }) {
  const data = match?.halfGoals;
  return (
    <section className="rounded-xl border border-sky-500/25 bg-[#101622] p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2.5">
        <div>
          <h4 className="text-white font-bold text-sm sm:text-base">Probabilidad de goles por mitad</h4>
          <p className="text-xs text-slate-400">Estimaciones antes del inicio. Cada mitad incluye su tiempo de descuento.</p>
        </div>
        <span className="px-2 py-0.5 bg-sky-500/10 text-sky-300 border border-sky-500/20 rounded text-[10px] font-bold">
          1ª Y 2ª MITAD
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {['first', 'second'].map((key, index) => {
          const isFirstHalfLocked = key === 'first' && !isVip;

          return (
            <div key={key} className="relative bg-[#0b1019] rounded-xl p-3.5 border border-white/10 overflow-hidden flex flex-col justify-between min-h-[220px]">
              <div>
                <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-1.5">
                  <h5 className="font-bold text-sky-300 text-xs sm:text-sm flex items-center space-x-1.5">
                    <span>{index + 1}ª Mitad · Total de goles</span>
                  </h5>
                  {isFirstHalfLocked && (
                    <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[9.5px] font-mono font-bold flex items-center space-x-1">
                      <Lock className="w-2.5 h-2.5" />
                      <span>VIP EXCLUSIVO</span>
                    </span>
                  )}
                </div>

                <div className={`transition duration-300 ${isFirstHalfLocked ? 'filter blur-[5px] select-none pointer-events-none opacity-25' : ''}`}>
                  {!data ? (
                    <p className="text-xs text-slate-400 py-3">
                      {match?.status !== 'SCHEDULED' 
                        ? 'Pronóstico previo no disponible para un partido iniciado.' 
                        : 'Sin datos suficientes de ambas mitades (mínimo 5 partidos por equipo).'}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {[0.5, 1.5, 2.5, 3.5].map(line => (
                        <div key={line} className="grid grid-cols-2 gap-2 text-xs">
                          {['over', 'under'].map(side => (
                            <div key={side} className="rounded-lg bg-[#141b29] p-2.5 sm:p-3 flex flex-wrap justify-between items-center gap-1.5">
                              <span className="text-slate-200 text-[11px] sm:text-xs">
                                {side === 'over' ? 'Más' : 'Menos'} de {line}
                              </span>
                              <strong className={`font-mono text-xs sm:text-sm ${side === 'over' ? 'text-emerald-400' : 'text-amber-400'}`}>
                                <NumberCounter value={data[key][`${side}${String(line).replace('.', '')}`]} suffix="%" />
                              </strong>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* VIP Locked Overlay for 1st Half */}
              {isFirstHalfLocked && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-4 text-center bg-[#090d16]/85 backdrop-blur-[2px] rounded-xl border border-amber-500/35 shadow-xl">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/25 to-amber-600/10 border border-amber-500/40 flex items-center justify-center mb-2 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                    <Lock className="w-5 h-5 text-amber-400" />
                  </div>

                  <div className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-mono font-bold mb-1.5">
                    <Crown className="w-3 h-3 text-amber-400" />
                    <span>SOLO ACCESO VIP</span>
                  </div>

                  <h6 className="text-xs sm:text-sm font-bold text-white font-sans mb-1">
                    1ª Mitad · Total de Goles
                  </h6>
                  <p className="text-[10px] sm:text-[11px] text-slate-300 max-w-[220px] mb-3 leading-tight font-sans">
                    Desbloquea las probabilidades cuantitativas de la 1ª Mitad con tu Pase VIP.
                  </p>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      sounds?.playClick?.();
                      onUnlockVip?.();
                    }}
                    className="px-3.5 py-1.5 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold font-mono text-[11px] rounded-lg shadow-[0_0_15px_rgba(245,158,11,0.35)] transition transform hover:scale-[1.03] cursor-pointer flex items-center space-x-1"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-slate-950" />
                    <span>Desbloquear con VIP</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {data && (
        <p className="text-xs text-slate-400">
          Muestra: {data.sampleSize?.home ?? '-'} partidos del local y {data.sampleSize?.away ?? '-'} del visitante. {data.method || ''}
        </p>
      )}
    </section>
  );
}
