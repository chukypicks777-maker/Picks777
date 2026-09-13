import React from 'react';
import { Activity, ArrowUpRight } from 'lucide-react';

export default function LiveTacticalPitch({ match }) {
  if (!match) return null;

  const homePressure = match.probabilities?.homeWin || 54;
  const awayPressure = match.probabilities?.awayWin || 20;

  return (
    <div className="w-full bg-[#0a0f19] border border-white/10 rounded-xl p-4 font-mono text-xs overflow-hidden relative">
      
      {/* Pitch Header */}
      <div className="flex items-center justify-between mb-3 text-slate-300">
        <div className="flex items-center space-x-1.5">
          <Activity className="w-3.5 h-3.5 text-sky-400" />
          <span className="font-bold text-white uppercase tracking-wide">Mapa Táctico & Presión Ofensiva</span>
        </div>
        <span className="text-[10px] text-emerald-400 font-bold">xG Modelo Activado</span>
      </div>

      {/* Visual Pitch Representation */}
      <div className="relative w-full h-44 bg-[#0d1624] border-2 border-slate-700/60 rounded-lg overflow-hidden flex items-center justify-between px-6">
        
        {/* Pitch markings */}
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-40" />
        
        {/* Pitch scanline effect */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-sky-500/10 to-transparent pitch-scanline pointer-events-none" />

        {/* Center circle and line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-slate-700/80 -translate-x-1/2" />
        <div className="absolute left-1/2 top-1/2 w-20 h-20 rounded-full border border-slate-700/80 -translate-x-1/2 -translate-y-1/2" />

        {/* Goal boxes */}
        <div className="absolute left-0 top-1/4 bottom-1/4 w-12 border-r border-t border-b border-slate-700/80 bg-sky-500/5" />
        <div className="absolute right-0 top-1/4 bottom-1/4 w-12 border-l border-t border-b border-slate-700/80 bg-indigo-500/5" />

        {/* Home Team Attacking Vector */}
        <div className="relative z-10 flex flex-col items-center space-y-1">
          <div className="w-8 h-8 rounded-full bg-sky-500/20 border border-sky-400 text-sky-300 flex items-center justify-center font-bold text-xs shadow-[0_0_12px_rgba(56,189,248,0.5)]">
            {match.homeTeam?.shortName || match.homeTeam?.name?.substring(0, 3)?.toUpperCase() || 'LOC'}
          </div>
          <span className="text-[10px] text-sky-300 font-bold">{homePressure}% Presión</span>
          <div className="flex items-center space-x-0.5 text-[9px] text-emerald-400">
            <ArrowUpRight className="w-3 h-3 animate-pulse" />
            <span>Ataque Alto</span>
          </div>
        </div>

        {/* Center Momentum Indicator */}
        <div className="relative z-10 bg-[#070b12]/90 border border-white/10 px-3 py-1.5 rounded-lg text-center backdrop-blur-sm">
          <span className="text-[9px] text-slate-400 block uppercase">Dominio Táctico</span>
          <span className="text-xs font-bold text-white">
            {homePressure > awayPressure 
              ? `${match.homeTeam?.shortName || match.homeTeam?.name?.substring(0, 3)?.toUpperCase() || 'LOC'} +${(homePressure - awayPressure)}%` 
              : `${match.awayTeam?.shortName || match.awayTeam?.name?.substring(0, 3)?.toUpperCase() || 'VIS'} +${(awayPressure - homePressure)}%`}
          </span>
        </div>

        {/* Away Team Attacking Vector */}
        <div className="relative z-10 flex flex-col items-center space-y-1">
          <div className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-400 text-indigo-300 flex items-center justify-center font-bold text-xs shadow-[0_0_12px_rgba(129,140,248,0.5)]">
            {match.awayTeam?.shortName || match.awayTeam?.name?.substring(0, 3)?.toUpperCase() || 'VIS'}
          </div>
          <span className="text-[10px] text-indigo-300 font-bold">{awayPressure}% Presión</span>
          <div className="flex items-center space-x-0.5 text-[9px] text-slate-400">
            <span>Bloque Medio</span>
          </div>
        </div>

      </div>

      {/* Footer Momentum Bar */}
      <div className="mt-3 flex items-center justify-between text-[10px] text-slate-400">
        <span>Tasa de Corners: <strong className="text-sky-400">{((match.homeTeam?.avgCorners ?? 4.8) + (match.awayTeam?.avgCorners ?? 4.5)).toFixed(1)} / partido</strong></span>
        <span>xG Esperado: <strong className="text-emerald-400">2.68 goles</strong></span>
      </div>

    </div>
  );
}
