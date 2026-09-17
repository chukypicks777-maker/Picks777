import React from 'react';
import { TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import NumberCounter from './NumberCounter';

export default function OverUnderGroupedSection({ match, homeStats, awayStats, diff }) {
  if (!match || !diff) return null;

  const probs = match.probabilities || {};

  // Goles Over & Under
  const over05 = 96;
  const under05 = 4;

  const over15 = probs.over15 || diff.over15 || 85;
  const under15 = 100 - over15;

  const over25 = probs.over25 || diff.over25 || 62;
  const under25 = probs.under25 != null ? probs.under25 : (100 - over25);

  const over35 = probs.over35 || diff.over35 || 34;
  const under35 = 100 - over35;

  const over45 = probs.over45 != null ? Math.round(probs.over45) : Math.round(Math.max(6, over35 * 0.45));
  const under45 = probs.under45 != null ? Math.round(probs.under45) : (100 - over45);

  // Córners Over & Under
  const homeCornersOver5 = homeStats?.cornerOver5 || 74;
  const homeCornersUnder5 = 100 - homeCornersOver5;

  const awayCornersOver5 = awayStats?.cornerOver5 || 58;
  const awayCornersUnder5 = 100 - awayCornersOver5;

  // Córners totales partido
  const matchCornersOver5 = diff.matchCornersProbs?.over5 || 95;
  const matchCornersUnder5 = 100 - matchCornersOver5;

  const matchCornersOver85 = diff.matchCornersProbs?.over85 || 68;
  const matchCornersUnder85 = 100 - matchCornersOver85;

  const lines = [
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
      note: 'Partido de alta intensidad'
    },
    {
      market: 'Línea de 4.5 Goles',
      overLabel: '+4.5 Goles',
      overProb: over45,
      underLabel: '-4.5 Goles',
      underProb: under45,
      note: 'Marcador abultado'
    },
    {
      market: `Córners ${homeStats?.shortName || 'Local'}`,
      overLabel: `+5 Córners ${homeStats?.shortName || 'Local'}`,
      overProb: homeCornersOver5,
      underLabel: `-5 Córners ${homeStats?.shortName || 'Local'}`,
      underProb: homeCornersUnder5,
      note: 'Volumen individual local'
    },
    {
      market: `Córners ${awayStats?.shortName || 'Visita'}`,
      overLabel: `+5 Córners ${awayStats?.shortName || 'Visita'}`,
      overProb: awayCornersOver5,
      underLabel: `-5 Córners ${awayStats?.shortName || 'Visita'}`,
      underProb: awayCornersUnder5,
      note: 'Volumen individual visita'
    },
    {
      market: 'Córners Totales Partido (Línea 5)',
      overLabel: '+5 Córners Partido',
      overProb: matchCornersOver5,
      underLabel: '-5 Córners Partido',
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
            Distribución separada por lados para comparar fácilmente líneas positivas y negativas de goles y córners.
          </p>
        </div>
        <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 rounded text-[10px] font-bold">
          BALANCE SIMÉTRICO
        </span>
      </div>

      {/* Grid de 2 Columnas (Lados Diferentes) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* COLUMNA IZQUIERDA: LADO OVERS (+) */}
        <div className="bg-[#0b1019] rounded-xl p-3.5 border border-emerald-500/30 space-y-2.5">
          <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
            <span className="font-bold text-emerald-400 text-xs flex items-center space-x-1.5 uppercase tracking-wide">
              <ArrowUpRight className="w-4 h-4 text-emerald-400" />
              <span>Lado OVERS (+) (Más De)</span>
            </span>
            <span className="text-[9.5px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-bold">
              POSITIVO
            </span>
          </div>

          <div className="space-y-2">
            {lines.map((line, idx) => (
              <div key={idx} className="bg-[#121a28] p-2 rounded-lg border border-emerald-500/15 hover:border-emerald-500/40 transition">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold text-white">
                    {line.overLabel}
                  </span>
                  <span className="text-xs font-bold text-emerald-300">
                    <NumberCounter value={line.overProb} suffix="%" />
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div style={{ width: `${line.overProb}%` }} className="h-full bg-emerald-400 rounded-full transition-all duration-500" />
                </div>
                <div className="flex justify-between items-center text-[8.5px] text-slate-400 mt-1">
                  <span>{line.market}</span>
                  <span className="text-emerald-400 font-semibold">{line.note}</span>
                </div>
              </div>
            ))}
          </div>
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
                  <div style={{ width: `${line.underProb}%` }} className="h-full bg-amber-400 rounded-full transition-all duration-500" />
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
