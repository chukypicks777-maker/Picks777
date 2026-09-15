import React from 'react';
import { Flag } from 'lucide-react';
import NumberCounter from './NumberCounter';

export default function TeamDetailedStatsCard({ stats, isHome }) {
  if (!stats) return null;

  const accentColor = isHome ? 'sky' : 'indigo';
  const borderClass = isHome ? 'border-sky-500/30' : 'border-indigo-500/30';
  const glowClass = isHome ? 'shadow-[0_0_15px_rgba(56,189,248,0.1)]' : 'shadow-[0_0_15px_rgba(129,140,248,0.1)]';

  return (
    <div className={`bg-[#0f1522] rounded-xl p-4 border ${borderClass} ${glowClass} flex flex-col justify-between font-mono text-xs space-y-4`}>
      {/* Header del Equipo */}
      <div>
        <div className="flex items-center justify-between border-b border-white/5 pb-2.5 mb-3">
          <div className="flex items-center space-x-2.5">
            {stats.logo ? (
              <img src={stats.logo} alt={stats.name} className="w-8 h-8 object-contain filter drop-shadow" />
            ) : (
              <div className={`w-8 h-8 rounded-full bg-${accentColor}-500/20 text-${accentColor}-300 flex items-center justify-center font-bold text-xs`}>
                {stats.shortName}
              </div>
            )}
            <div>
              <h4 className="font-bold text-white text-sm font-sans truncate max-w-[160px]">
                {stats.name}
              </h4>
              <span className={`text-[10px] font-bold ${isHome ? 'text-sky-400' : 'text-indigo-400'}`}>
                {isHome ? 'Local' : 'Visitante'} • #{stats.position} ({stats.points} pts)
              </span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-400 block">Racha Reciente</span>
            <div className="flex space-x-1 justify-end mt-0.5">
              {(stats.form || []).slice(0, 5).map((f, i) => (
                <span
                  key={i}
                  className={`w-3.5 h-3.5 text-[8.5px] font-bold rounded flex items-center justify-center ${
                    f === 'W'
                      ? 'bg-emerald-600 text-white'
                      : f === 'D'
                      ? 'bg-amber-600 text-white'
                      : 'bg-rose-600 text-white'
                  }`}
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Resumen Goleador y Eficiencia */}
        <div className="grid grid-cols-3 gap-1.5 text-center text-[11px] mb-3">
          <div className="bg-[#141b29] p-2 rounded-lg border border-white/5">
            <span className="text-slate-400 block text-[9px]">Goles Favor</span>
            <span className="font-bold text-emerald-400">{stats.avgGF} / p</span>
            <span className="text-[8px] text-slate-500 block">({stats.goalsFor} tot)</span>
          </div>
          <div className="bg-[#141b29] p-2 rounded-lg border border-white/5">
            <span className="text-slate-400 block text-[9px]">Goles Contra</span>
            <span className="font-bold text-rose-400">{stats.avgGC} / p</span>
            <span className="text-[8px] text-slate-500 block">({stats.goalsAgainst} tot)</span>
          </div>
          <div className="bg-[#141b29] p-2 rounded-lg border border-white/5">
            <span className="text-slate-400 block text-[9px]">Diferencial</span>
            <span className={`font-bold ${stats.goalDiff >= 0 ? 'text-sky-400' : 'text-amber-400'}`}>
              {stats.goalDiff >= 0 ? `+${stats.goalDiff}` : stats.goalDiff}
            </span>
            <span className="text-[8px] text-slate-500 block">{stats.gamesPlayed} PJ</span>
          </div>
        </div>

        {/* AGRUPACIÓN OVERS (+) VS UNDERS (-) POR LADOS DIFERENTES */}
        <div className="bg-[#121926] p-3 rounded-xl border border-white/10 space-y-2.5">
          <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
            <span className="text-[10.5px] font-bold text-slate-200 flex items-center space-x-1.5 uppercase tracking-wide">
              <Flag className="w-3 h-3 text-sky-400" />
              <span>Métricas Agrupadas por Lados</span>
            </span>
            <span className="text-[9.5px] text-slate-400">
              Córners Fav: <strong className="text-white">{stats.avgCorners}</strong> | Concedidos: <strong className="text-slate-300">{stats.avgCornersConceded}</strong>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center">
            {/* LADO IZQUIERDO: OVERS (+) */}
            <div className="bg-[#0b131e] p-2.5 rounded-lg border border-emerald-500/30 space-y-2">
              <div className="flex items-center justify-between border-b border-emerald-500/20 pb-1">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-tight flex items-center space-x-1">
                  <span>▲ LADO OVERS (+)</span>
                </span>
                <span className="text-[8.5px] bg-emerald-500/20 text-emerald-300 px-1 rounded font-bold">POSITIVO</span>
              </div>

              {/* +5 Córners */}
              <div className="bg-[#121c2b] p-1.5 rounded border border-emerald-500/20 text-left">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-300 font-semibold">+5 Córners</span>
                  <span className="font-bold text-emerald-400"><NumberCounter value={stats.cornerOver5} suffix="%" /></span>
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden mt-1">
                  <div style={{ width: `${stats.cornerOver5}%` }} className="h-full bg-emerald-400 rounded-full" />
                </div>
              </div>

              {/* +1.5 Goles */}
              <div className="bg-[#121c2b] p-1.5 rounded border border-emerald-500/20 text-left">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-300 font-semibold">+1.5 Goles</span>
                  <span className="font-bold text-emerald-400"><NumberCounter value={stats.over15Rate} suffix="%" /></span>
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden mt-1">
                  <div style={{ width: `${stats.over15Rate}%` }} className="h-full bg-emerald-400 rounded-full" />
                </div>
              </div>

              {/* +2.5 Goles */}
              <div className="bg-[#121c2b] p-1.5 rounded border border-emerald-500/20 text-left">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-300 font-semibold">+2.5 Goles</span>
                  <span className="font-bold text-emerald-400"><NumberCounter value={stats.over25Rate} suffix="%" /></span>
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden mt-1">
                  <div style={{ width: `${stats.over25Rate}%` }} className="h-full bg-emerald-400 rounded-full" />
                </div>
              </div>

              {/* +3.5 Goles */}
              <div className="bg-[#121c2b] p-1.5 rounded border border-emerald-500/20 text-left">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-300 font-semibold">+3.5 Goles</span>
                  <span className="font-bold text-emerald-400"><NumberCounter value={stats.over35Rate} suffix="%" /></span>
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden mt-1">
                  <div style={{ width: `${stats.over35Rate}%` }} className="h-full bg-emerald-400 rounded-full" />
                </div>
              </div>
            </div>

            {/* LADO DERECHO: UNDERS (-) */}
            <div className="bg-[#191310] p-2.5 rounded-lg border border-amber-500/30 space-y-2">
              <div className="flex items-center justify-between border-b border-amber-500/20 pb-1">
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-tight flex items-center space-x-1">
                  <span>▼ LADO UNDERS (-)</span>
                </span>
                <span className="text-[8.5px] bg-amber-500/20 text-amber-300 px-1 rounded font-bold">NEGATIVO</span>
              </div>

              {/* -5 Córners */}
              <div className="bg-[#241a15] p-1.5 rounded border border-amber-500/20 text-left">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-300 font-semibold">-5 Córners</span>
                  <span className="font-bold text-amber-400"><NumberCounter value={stats.cornerUnder5} suffix="%" /></span>
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden mt-1">
                  <div style={{ width: `${stats.cornerUnder5}%` }} className="h-full bg-amber-400 rounded-full" />
                </div>
              </div>

              {/* -1.5 Goles */}
              <div className="bg-[#241a15] p-1.5 rounded border border-amber-500/20 text-left">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-300 font-semibold">-1.5 Goles</span>
                  <span className="font-bold text-amber-400"><NumberCounter value={stats.under15Rate} suffix="%" /></span>
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden mt-1">
                  <div style={{ width: `${stats.under15Rate}%` }} className="h-full bg-amber-400 rounded-full" />
                </div>
              </div>

              {/* -2.5 Goles */}
              <div className="bg-[#241a15] p-1.5 rounded border border-amber-500/20 text-left">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-300 font-semibold">-2.5 Goles</span>
                  <span className="font-bold text-amber-400"><NumberCounter value={stats.under25Rate} suffix="%" /></span>
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden mt-1">
                  <div style={{ width: `${stats.under25Rate}%` }} className="h-full bg-amber-400 rounded-full" />
                </div>
              </div>

              {/* -3.5 Goles */}
              <div className="bg-[#241a15] p-1.5 rounded border border-amber-500/20 text-left">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-300 font-semibold">-3.5 Goles</span>
                  <span className="font-bold text-amber-400"><NumberCounter value={stats.under35Rate} suffix="%" /></span>
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden mt-1">
                  <div style={{ width: `${stats.under35Rate}%` }} className="h-full bg-amber-400 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Metrics: BTTS, Valla Invicta, Disciplina */}
      <div className="pt-2 border-t border-white/5 grid grid-cols-4 gap-1 text-center text-[9px]">
        <div className="bg-[#121824] p-1 rounded">
          <span className="text-slate-500 block">BTTS</span>
          <span className="font-bold text-teal-300">{stats.bttsRate}%</span>
        </div>
        <div className="bg-[#121824] p-1 rounded">
          <span className="text-slate-500 block">Valla 0</span>
          <span className="font-bold text-sky-300">{stats.cleanSheetRate}%</span>
        </div>
        <div className="bg-[#121824] p-1 rounded">
          <span className="text-slate-500 block">Faltas</span>
          <span className="font-bold text-slate-300">{stats.fouls}</span>
        </div>
        <div className="bg-[#121824] p-1 rounded">
          <span className="text-slate-500 block">Tarjetas</span>
          <span className="font-bold text-amber-300">{stats.cards} 🟨</span>
        </div>
      </div>
    </div>
  );
}
