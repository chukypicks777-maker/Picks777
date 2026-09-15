import React from 'react';
import { Scale, TrendingUp, Flag, ArrowRightLeft } from 'lucide-react';
import NumberCounter from './NumberCounter';

export default function DifferentialAnalysisSection({ homeStats, awayStats, diff }) {
  if (!homeStats || !awayStats || !diff) return null;

  const homeCorners = homeStats.avgCorners;
  const awayCorners = awayStats.avgCorners;
  const totalCorners = (homeCorners + awayCorners).toFixed(1);
  const cornerGap = diff.cornerGap; // home - away
  const homePct = Math.round((homeCorners / (homeCorners + awayCorners || 1)) * 100);
  const awayPct = 100 - homePct;

  // Diferencial de gol
  const homeGoalDiff = homeStats.goalDiff;
  const awayGoalDiff = awayStats.goalDiff;

  return (
    <div className="bg-[#111724] rounded-xl p-5 border border-sky-500/30 font-mono text-xs shadow-[0_0_25px_rgba(0,0,0,0.5)] space-y-4">
      {/* Header del Apartado Diferencial */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
        <div className="flex items-center space-x-2">
          <ArrowRightLeft className="w-4 h-4 text-sky-400" />
          <h5 className="font-bold text-sm text-white font-sans uppercase tracking-wide">
            Apartado Diferencial Cuantitativo ({homeStats.shortName} vs {awayStats.shortName})
          </h5>
        </div>
        <span className="px-2 py-0.5 bg-sky-500/10 text-sky-300 border border-sky-500/20 rounded text-[10px] font-bold">
          COMPENSACIÓN ESTADÍSTICA
        </span>
      </div>

      {/* 1. DIFERENCIAL DE CÓRNERS (POSITIVO Y NEGATIVO) */}
      <div className="bg-[#151d2d] rounded-xl p-4 border border-white/5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-bold text-xs text-sky-300 flex items-center space-x-1.5 font-sans">
            <Flag className="w-3.5 h-3.5 text-sky-400" />
            <span>Diferencial de Córners & Ventaja de Ataque por Bandas</span>
          </span>
          <span className="text-[10px] text-slate-400 font-bold">
            Total Proyectado: <strong className="text-white">{totalCorners} 🚩</strong>
          </span>
        </div>

        {/* Visual Balance Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-sky-400 font-bold">
              {homeStats.shortName}: {homeCorners} 🚩 ({homePct}%)
            </span>
            <span className="text-slate-400 text-[10px]">
              Diferencial: <strong className={cornerGap >= 0 ? 'text-sky-300' : 'text-indigo-300'}>
                {cornerGap >= 0 ? `+${cornerGap}` : cornerGap} córners
              </strong>
            </span>
            <span className="text-indigo-400 font-bold">
              {awayStats.shortName}: {awayCorners} 🚩 ({awayPct}%)
            </span>
          </div>

          <div className="h-2.5 w-full bg-[#0a0e16] rounded-full overflow-hidden flex gap-0.5 p-0.5 border border-white/5">
            <div style={{ width: `${homePct}%` }} className="bg-sky-500 h-full rounded-l-full transition-all duration-500 shadow-[0_0_8px_rgba(56,189,248,0.5)]" />
            <div style={{ width: `${awayPct}%` }} className="bg-indigo-500 h-full rounded-r-full transition-all duration-500 shadow-[0_0_8px_rgba(129,140,248,0.5)]" />
          </div>
        </div>

        {/* Comparativa Diferencial: Positivo (+5) vs Negativo (-5) en Córners */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center text-[10px] pt-1">
          <div className="bg-[#101622] p-2.5 rounded-lg border border-sky-500/20">
            <span className="text-slate-400 block mb-0.5">Prob. +5 Córners Local</span>
            <span className="text-sm font-bold text-sky-400">
              <NumberCounter value={homeStats.cornerOver5} suffix="%" />
            </span>
            <span className="text-[8.5px] text-slate-500 block">(-5 Córners: {homeStats.cornerUnder5}%)</span>
          </div>

          <div className="bg-[#101622] p-2.5 rounded-lg border border-white/10">
            <span className="text-slate-400 block mb-0.5">Saldo Diferencial Neto</span>
            <span className="text-xs font-bold text-emerald-400">
              {diff.cornerDifferentialText}
            </span>
          </div>

          <div className="bg-[#101622] p-2.5 rounded-lg border border-indigo-500/20">
            <span className="text-slate-400 block mb-0.5">Prob. +5 Córners Visita</span>
            <span className="text-sm font-bold text-indigo-400">
              <NumberCounter value={awayStats.cornerOver5} suffix="%" />
            </span>
            <span className="text-[8.5px] text-slate-500 block">(-5 Córners: {awayStats.cornerUnder5}%)</span>
          </div>
        </div>
      </div>

      {/* 2. DIFERENCIAL DE GOLES & EFICIENCIA */}
      <div className="bg-[#151d2d] rounded-xl p-4 border border-white/5 space-y-3">
        <span className="font-bold text-xs text-emerald-300 flex items-center space-x-1.5 font-sans">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          <span>Diferencial de Gol & Compensación Ofensiva / Defensiva</span>
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
          {/* Local vs Defensa Visitante */}
          <div className="bg-[#101622] p-3 rounded-lg border border-white/5 space-y-1">
            <div className="flex justify-between items-center text-slate-300">
              <span>Ataque Local vs Defensa Visita:</span>
              <span className={`font-bold ${diff.attackDefenseHome >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {diff.attackDefenseHome >= 0 ? `+${diff.attackDefenseHome}` : diff.attackDefenseHome} gol/p
              </span>
            </div>
            <p className="text-[9.5px] text-slate-400 leading-snug">
              {homeStats.name} anota <strong>{homeStats.avgGF}</strong> goles/p frente a los <strong>{awayStats.avgGC}</strong> concedidos por {awayStats.name}.
            </p>
          </div>

          {/* Visita vs Defensa Local */}
          <div className="bg-[#101622] p-3 rounded-lg border border-white/5 space-y-1">
            <div className="flex justify-between items-center text-slate-300">
              <span>Ataque Visita vs Defensa Local:</span>
              <span className={`font-bold ${diff.attackDefenseAway >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {diff.attackDefenseAway >= 0 ? `+${diff.attackDefenseAway}` : diff.attackDefenseAway} gol/p
              </span>
            </div>
            <p className="text-[9.5px] text-slate-400 leading-snug">
              {awayStats.name} anota <strong>{awayStats.avgGF}</strong> goles/p frente a los <strong>{homeStats.avgGC}</strong> concedidos por {homeStats.name}.
            </p>
          </div>
        </div>

        {/* Resumen Diferencial de Temporada */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[10px] text-slate-300 border-t border-white/5">
          <span>Diferencial de Goles en Tabla:</span>
          <div className="flex items-center space-x-3">
            <span>{homeStats.shortName}: <strong className="text-sky-400">{homeGoalDiff >= 0 ? `+${homeGoalDiff}` : homeGoalDiff}</strong></span>
            <span>vs</span>
            <span>{awayStats.shortName}: <strong className="text-indigo-400">{awayGoalDiff >= 0 ? `+${awayGoalDiff}` : awayGoalDiff}</strong></span>
            <span>•</span>
            <span className="text-emerald-400 font-bold">
              Brecha: {diff.goalDiffGap >= 0 ? `+${diff.goalDiffGap}` : diff.goalDiffGap}
            </span>
          </div>
        </div>
      </div>

      {/* 3. DIFERENCIAL OVER VS UNDER (TENDENCIA DEL PARTIDO) */}
      <div className="bg-[#151d2d] rounded-xl p-4 border border-white/5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-bold text-xs text-amber-300 flex items-center space-x-1.5 font-sans">
            <Scale className="w-3.5 h-3.5 text-amber-400" />
            <span>Balanza Diferencial Over vs Under (Línea 2.5 Goles)</span>
          </span>
          <span className="text-[10.5px] font-bold text-teal-300">
            {diff.overUnderTendency} ({diff.overUnderMargin >= 0 ? `+${diff.overUnderMargin}%` : `${diff.overUnderMargin}%`})
          </span>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-slate-300">
            <span className="text-emerald-400 font-bold">+2.5 Goles (Over): {diff.over25}%</span>
            <span className="text-amber-400 font-bold">-2.5 Goles (Under): {diff.under25}%</span>
          </div>
          <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden flex gap-0.5">
            <div style={{ width: `${diff.over25}%` }} className="bg-emerald-500 h-full rounded-l-full" />
            <div style={{ width: `${diff.under25}%` }} className="bg-amber-500 h-full rounded-r-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
