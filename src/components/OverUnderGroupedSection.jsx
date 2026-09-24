import React from 'react';
import { TrendingUp, ArrowUpRight, ArrowDownRight, Lock, Crown, Sparkles } from 'lucide-react';
import NumberCounter from './NumberCounter';
import { percent, complement } from '../utils/probability';
import { sounds } from '../utils/audioEffects';

export default function OverUnderGroupedSection({ match, homeStats, awayStats, diff, isVip = false, onUnlockVip = null }) {
  if (!match || !diff) return null;

  const probs = match.model?.probabilities || match.probabilities || {};
  const over05 = percent(probs.over05), under05 = complement(over05);
  const over15 = percent(probs.over15), under15 = complement(over15);
  const over25 = percent(probs.over25), under25 = complement(over25);
  const over35 = percent(probs.over35), under35 = complement(over35);
  const over45 = percent(probs.over45), under45 = complement(over45);
  const homeCornersOver5 = homeStats?.cornerOver55, homeCornersUnder5 = complement(homeCornersOver5);
  const awayCornersOver5 = awayStats?.cornerOver55, awayCornersUnder5 = complement(awayCornersOver5);
  const matchCornersOver5 = diff.matchCornersProbs?.over55, matchCornersUnder5 = complement(matchCornersOver5);
  const matchCornersOver85 = diff.matchCornersProbs?.over85, matchCornersUnder85 = complement(matchCornersOver85);
  const lines = [
    { market: 'Tarjetas amarillas totales', overLabel: '+3.5 Tarjetas', underLabel: '-3.5 Tarjetas', overProb: diff.matchCardsProbs?.over35, underProb: diff.matchCardsProbs?.under35, note: 'Amarillas registradas; no puntos por tarjetas' },
    {
      market: 'Línea de 0.5 Goles',
      overLabel: '+0.5 Goles',
      overProb: over05,
      underLabel: '-0.5 Goles',
      underProb: under05,
      note: 'Goles en el partido'
    },
    {
      market: 'Línea de 1.5 Goles',
      overLabel: '+1.5 Goles',
      overProb: over15,
      underLabel: '-1.5 Goles',
      underProb: under15,
      note: '2 o más goles vs 0-1'
    },
    {
      market: 'Línea Clásica 2.5 Goles',
      overLabel: '+2.5 Goles',
      overProb: over25,
      underLabel: '-2.5 Goles',
      underProb: under25,
      note: 'Mercado estrella de goles'
    },
    {
      market: 'Línea de 3.5 Goles',
      overLabel: '+3.5 Goles',
      overProb: over35,
      underLabel: '-3.5 Goles',
      underProb: under35,
      note: '4 o más goles vs 0–3'
    },
    {
      market: 'Línea de 4.5 Goles',
      overLabel: '+4.5 Goles',
      overProb: over45,
      underLabel: '-4.5 Goles',
      underProb: under45,
      note: '5 o más goles vs 0–4'
    },
    {
      market: `Córners ${homeStats?.shortName || 'Local'}`,
      overLabel: `+5.5 Córners ${homeStats?.shortName || 'Local'}`,
      overProb: homeCornersOver5,
      underLabel: `-5.5 Córners ${homeStats?.shortName || 'Local'}`,
      underProb: homeCornersUnder5,
      note: 'Volumen individual local'
    },
    {
      market: `Córners ${awayStats?.shortName || 'Visita'}`,
      overLabel: `+5.5 Córners ${awayStats?.shortName || 'Visita'}`,
      overProb: awayCornersOver5,
      underLabel: `-5.5 Córners ${awayStats?.shortName || 'Visita'}`,
      underProb: awayCornersUnder5,
      note: 'Volumen individual visita'
    },
    {
      market: 'Córners Totales Partido (Línea 5.5)',
      overLabel: '+5.5 Córners Partido',
      overProb: matchCornersOver5,
      underLabel: '-5.5 Córners Partido',
      underProb: matchCornersUnder5,
      note: 'Total combinado de ambos'
    },
    {
      market: 'Córners Totales Partido (Línea 8.5)',
      overLabel: '+8.5 Córners Partido',
      overProb: matchCornersOver85,
      underLabel: '-8.5 Córners Partido',
      underProb: matchCornersUnder85,
      note: 'Línea principal de córners'
    }
  ];

  return (
    <div className="bg-[#101622] rounded-xl p-5 border border-white/10 font-mono text-xs shadow-[0_0_25px_rgba(0,0,0,0.5)] space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
        <div>
          <h5 className="font-bold text-sm text-white font-sans flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span>Agrupación Cuantitativa de Mercados: Lado OVERS (+) vs Lado UNDERS (-)</span>
          </h5>
          <p className="text-[11px] text-slate-400 font-sans mt-0.5">
            Distribución separada por lados para comparar fácilmente líneas positivas y negativas de goles, córners y tarjetas. Estimaciones Poisson sobre datos registrados; N/D indica falta de muestra.
          </p>
        </div>
        <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 rounded text-[10px] font-bold">
          BALANCE SIMÉTRICO
        </span>
      </div>

      {/* Grid de 2 Columnas (Lados Diferentes) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* COLUMNA IZQUIERDA: LADO OVERS (+) */}
        <div className="relative bg-[#0b1019] rounded-xl p-3.5 border border-emerald-500/30 space-y-2.5 overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
              <span className="font-bold text-emerald-400 text-xs flex items-center space-x-1.5 uppercase tracking-wide">
                <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                <span>Lado OVERS (+) (Más De)</span>
              </span>
              <div className="flex items-center space-x-1">
                {!isVip && (
                  <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded font-mono font-bold flex items-center space-x-0.5">
                    <Lock className="w-2.5 h-2.5" />
                    <span>VIP</span>
                  </span>
                )}
                <span className="text-[9.5px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-bold">
                  POSITIVO
                </span>
              </div>
            </div>

            <div className={`space-y-2 transition duration-300 ${!isVip ? 'filter blur-[5px] select-none pointer-events-none opacity-25' : ''}`}>
              {lines.map((line, idx) => (
                <div key={idx} className="bg-[#121a28] p-2 rounded-lg border border-emerald-500/15 hover:border-emerald-500/40 transition">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-white">
                      {line.overLabel}
                    </span>
                    <span className="text-xs font-bold text-emerald-300 font-mono">
                      <NumberCounter value={line.overProb} suffix="%" />
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div style={{ width: `${line.overProb ?? 0}%` }} className="h-full bg-emerald-400 rounded-full transition-all duration-500" />
                  </div>
                  <div className="flex justify-between items-center text-[8.5px] text-slate-400 mt-1">
                    <span>{line.market}</span>
                    <span className="text-emerald-400 font-semibold">{line.note}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* VIP Locked Overlay for LADO OVERS */}
          {!isVip && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-4 text-center bg-[#090d16]/85 backdrop-blur-[2px] rounded-xl border border-amber-500/35 shadow-xl">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/25 to-amber-600/10 border border-amber-500/40 flex items-center justify-center mb-2 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                <Lock className="w-5 h-5 text-amber-400" />
              </div>

              <div className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-mono font-bold mb-1.5">
                <Crown className="w-3 h-3 text-amber-400" />
                <span>SOLO ACCESO VIP</span>
              </div>

              <h6 className="text-xs sm:text-sm font-bold text-white font-sans mb-1">
                Lado OVERS (+) Exclusivo
              </h6>
              <p className="text-[10px] sm:text-[11px] text-slate-300 max-w-[220px] mb-3 leading-tight font-sans">
                Desbloquea los porcentajes cuantitativos y barras de probabilidad de Overs con tu Pase VIP.
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

        {/* COLUMNA DERECHA: LADO UNDERS (-) */}
        <div className="bg-[#0b1019] rounded-xl p-3.5 border border-amber-500/30 space-y-2.5">
          <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
            <span className="font-bold text-amber-400 text-xs flex items-center space-x-1.5 uppercase tracking-wide">
              <ArrowDownRight className="w-4 h-4 text-amber-400" />
              <span>Lado UNDERS (-) (Menos De)</span>
            </span>
            <span className="text-[9.5px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-bold">
              NEGATIVO
            </span>
          </div>

          <div className="space-y-2">
            {lines.map((line, idx) => (
              <div key={idx} className="bg-[#121a28] p-2 rounded-lg border border-amber-500/15 hover:border-amber-500/40 transition">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold text-white">
                    {line.underLabel}
                  </span>
                  <span className="text-xs font-bold text-amber-300">
                    <NumberCounter value={line.underProb} suffix="%" />
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div style={{ width: `${line.underProb ?? 0}%` }} className="h-full bg-amber-400 rounded-full transition-all duration-500" />
                </div>
                <div className="flex justify-between items-center text-[8.5px] text-slate-400 mt-1">
                  <span>{line.market}</span>
                  <span className="text-amber-400 font-semibold">{line.note}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
