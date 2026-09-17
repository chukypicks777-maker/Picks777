import React from 'react';
import { Flag, Flame } from 'lucide-react';
import NumberCounter from './NumberCounter';

export default function TeamDetailedStatsCard({ stats, isHome }) {
  if (!stats) return null;

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
              <div className={`w-8 h-8 rounded-full ${isHome ? 'bg-sky-500/20 text-sky-300' : 'bg-indigo-500/20 text-indigo-300'} flex items-center justify-center font-bold text-xs`}>
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
            <span className="font-bold text-emerald-400">{Number(stats.avgGF || 0).toFixed(2)} / p</span>
            <span className="text-[8px] text-slate-500 block">({stats.goalsFor} tot)</span>
          </div>
          <div className="bg-[#141b29] p-2 rounded-lg border border-white/5">
            <span className="text-slate-400 block text-[9px]">Goles Contra</span>
            <span className="font-bold text-rose-400">{Number(stats.avgGC || 0).toFixed(2)} / p</span>
            <span className="text-[8px] text-slate-500 block">({stats.goalsAgainst} tot)</span>
          </div>
          <div className="bg-[#141b29] p-2 rounded-lg border border-white/5">
            <span className="text-slate-400 block text-[9px]">Diferencial</span>
            <span className={`font-bold ${Math.round(stats.goalDiff || 0) >= 0 ? 'text-sky-400' : 'text-amber-400'}`}>
              {Math.round(stats.goalDiff || 0) >= 0 ? `+${Math.round(stats.goalDiff || 0)}` : Math.round(stats.goalDiff || 0)}
            </span>
            <span className="text-[8px] text-slate-500 block">{stats.gamesPlayed} PJ</span>
          </div>
        </div>

        {/* MÉTRICAS CATEGORIZADAS: GOLES, TARJETAS, CÓRNERS */}
        <div className="bg-[#121926] p-3 rounded-xl border border-white/10 space-y-3.5">
          
          {/* SECCIÓN 1: GOLES */}
          <div>
            <div className="flex items-center justify-between border-b border-emerald-500/20 pb-1.5 mb-2">
              <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-tight flex items-center space-x-1.5">
                <Flame className="w-3.5 h-3.5 text-emerald-400" />
                <span>Goles</span>
              </span>
              <span className="text-[9.5px] text-slate-400 font-mono">
                Prom: <strong className="text-emerald-300">{(Number(stats.avgGF || 0) + Number(stats.avgGC || 0)).toFixed(2)}</strong> / p
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-left">
              {/* +0.5 */}
              <div className="bg-[#101c2b] p-2 rounded-lg border border-emerald-500/25">
                <div className="flex justify-between items-center text-[10.5px]">
                  <span className="text-slate-200 font-bold">+0.5</span>
                  <span className="font-bold text-emerald-400"><NumberCounter value={stats.over05Rate} suffix="%" /></span>
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden mt-1.5">
                  <div style={{ width: `${stats.over05Rate}%` }} className="h-full bg-emerald-400 rounded-full" />
                </div>
              </div>

              {/* +2.5 */}
              <div className="bg-[#101c2b] p-2 rounded-lg border border-emerald-500/25">
                <div className="flex justify-between items-center text-[10.5px]">
                  <span className="text-slate-200 font-bold">+2.5</span>
                  <span className="font-bold text-emerald-400"><NumberCounter value={stats.over25Rate} suffix="%" /></span>
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden mt-1.5">
                  <div style={{ width: `${stats.over25Rate}%` }} className="h-full bg-emerald-400 rounded-full" />
                </div>
              </div>

              {/* +1.5 */}
              <div className="bg-[#101c2b] p-2 rounded-lg border border-emerald-500/25">
                <div className="flex justify-between items-center text-[10.5px]">
                  <span className="text-slate-200 font-bold">+1.5</span>
                  <span className="font-bold text-emerald-400"><NumberCounter value={stats.over15Rate} suffix="%" /></span>
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden mt-1.5">
                  <div style={{ width: `${stats.over15Rate}%` }} className="h-full bg-emerald-400 rounded-full" />
                </div>
              </div>

              {/* +3.5 */}
              <div className="bg-[#101c2b] p-2 rounded-lg border border-emerald-500/25">
                <div className="flex justify-between items-center text-[10.5px]">
                  <span className="text-slate-200 font-bold">+3.5</span>
                  <span className="font-bold text-emerald-400"><NumberCounter value={stats.over35Rate} suffix="%" /></span>
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden mt-1.5">
                  <div style={{ width: `${stats.over35Rate}%` }} className="h-full bg-emerald-400 rounded-full" />
                </div>
              </div>
            </div>
          </div>

          {/* SECCIÓN 2: TARJETAS */}
          <div>
            <div className="flex items-center justify-between border-b border-amber-500/20 pb-1.5 mb-2">
              <span className="text-[11px] font-bold text-amber-400 uppercase tracking-tight flex items-center space-x-1.5">
                <span className="text-amber-400 text-xs">🟨</span>
                <span>Tarjetas</span>
              </span>
              <span className="text-[9.5px] text-slate-400 font-mono">
                Prom: <strong className="text-amber-300">{Number(stats.cards || 0).toFixed(1)}</strong> / p
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-left">
              {/* -0.5 */}
              <div className="bg-[#1c160e] p-2 rounded-lg border border-amber-500/25">
                <div className="flex justify-between items-center text-[10.5px]">
                  <span className="text-slate-200 font-bold">-0.5</span>
                  <span className="font-bold text-amber-400"><NumberCounter value={stats.cardsUnder05} suffix="%" /></span>
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden mt-1.5">
                  <div style={{ width: `${stats.cardsUnder05}%` }} className="h-full bg-amber-400 rounded-full" />
                </div>
              </div>

              {/* +0.5 */}
              <div className="bg-[#1c160e] p-2 rounded-lg border border-amber-500/25">
                <div className="flex justify-between items-center text-[10.5px]">
                  <span className="text-slate-200 font-bold">+0.5</span>
                  <span className="font-bold text-amber-400"><NumberCounter value={stats.cardsOver05} suffix="%" /></span>
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden mt-1.5">
                  <div style={{ width: `${stats.cardsOver05}%` }} className="h-full bg-amber-400 rounded-full" />
                </div>
              </div>

              {/* +1.5 */}
              <div className="bg-[#1c160e] p-2 rounded-lg border border-amber-500/25">
                <div className="flex justify-between items-center text-[10.5px]">
                  <span className="text-slate-200 font-bold">+1.5</span>
                  <span className="font-bold text-amber-400"><NumberCounter value={stats.cardsOver15} suffix="%" /></span>
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden mt-1.5">
                  <div style={{ width: `${stats.cardsOver15}%` }} className="h-full bg-amber-400 rounded-full" />
                </div>
              </div>

              {/* +2.5 */}
              <div className="bg-[#1c160e] p-2 rounded-lg border border-amber-500/25">
                <div className="flex justify-between items-center text-[10.5px]">
                  <span className="text-slate-200 font-bold">+2.5</span>
                  <span className="font-bold text-amber-400"><NumberCounter value={stats.cardsOver25} suffix="%" /></span>
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden mt-1.5">
                  <div style={{ width: `${stats.cardsOver25}%` }} className="h-full bg-amber-400 rounded-full" />
                </div>
              </div>
            </div>
          </div>

          {/* SECCIÓN 3: CÓRNERS */}
          <div>
            <div className="flex items-center justify-between border-b border-sky-500/20 pb-1.5 mb-2">
              <span className="text-[11px] font-bold text-sky-400 uppercase tracking-tight flex items-center space-x-1.5">
                <Flag className="w-3.5 h-3.5 text-sky-400" />
                <span>Córners</span>
              </span>
              <span className="text-[9.5px] text-slate-400 font-mono">
                Fav: <strong className="text-white">{Number(stats.avgCorners || 0).toFixed(1)}</strong> | Conced: <strong className="text-slate-300">{Number(stats.avgCornersConceded || 0).toFixed(1)}</strong>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-left">
              {/* +1.5 */}
              <div className="bg-[#0f1b2b] p-2 rounded-lg border border-sky-500/25">
                <div className="flex justify-between items-center text-[10.5px]">
                  <span className="text-slate-200 font-bold">+1.5</span>
                  <span className="font-bold text-sky-400"><NumberCounter value={stats.cornerOver15} suffix="%" /></span>
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden mt-1.5">
                  <div style={{ width: `${stats.cornerOver15}%` }} className="h-full bg-sky-400 rounded-full" />
                </div>
              </div>

              {/* +2.5 */}
              <div className="bg-[#0f1b2b] p-2 rounded-lg border border-sky-500/25">
                <div className="flex justify-between items-center text-[10.5px]">
                  <span className="text-slate-200 font-bold">+2.5</span>
                  <span className="font-bold text-sky-400"><NumberCounter value={stats.cornerOver25} suffix="%" /></span>
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden mt-1.5">
                  <div style={{ width: `${stats.cornerOver25}%` }} className="h-full bg-sky-400 rounded-full" />
                </div>
              </div>

              {/* +3.5 */}
              <div className="bg-[#0f1b2b] p-2 rounded-lg border border-sky-500/25">
                <div className="flex justify-between items-center text-[10.5px]">
                  <span className="text-slate-200 font-bold">+3.5</span>
                  <span className="font-bold text-sky-400"><NumberCounter value={stats.cornerOver35} suffix="%" /></span>
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden mt-1.5">
                  <div style={{ width: `${stats.cornerOver35}%` }} className="h-full bg-sky-400 rounded-full" />
                </div>
              </div>

              {/* +4.5 */}
              <div className="bg-[#0f1b2b] p-2 rounded-lg border border-sky-500/25">
                <div className="flex justify-between items-center text-[10.5px]">
                  <span className="text-slate-200 font-bold">+4.5</span>
                  <span className="font-bold text-sky-400"><NumberCounter value={stats.cornerOver45} suffix="%" /></span>
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden mt-1.5">
                  <div style={{ width: `${stats.cornerOver45}%` }} className="h-full bg-sky-400 rounded-full" />
                </div>
              </div>

              {/* +5.5 */}
              <div className="bg-[#0f1b2b] p-2 rounded-lg border border-sky-500/25">
                <div className="flex justify-between items-center text-[10.5px]">
                  <span className="text-slate-200 font-bold">+5.5</span>
                  <span className="font-bold text-sky-400"><NumberCounter value={stats.cornerOver55} suffix="%" /></span>
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden mt-1.5">
                  <div style={{ width: `${stats.cornerOver55}%` }} className="h-full bg-sky-400 rounded-full" />
                </div>
              </div>

              {/* +6.5 */}
              <div className="bg-[#0f1b2b] p-2 rounded-lg border border-sky-500/25">
                <div className="flex justify-between items-center text-[10.5px]">
                  <span className="text-slate-200 font-bold">+6.5</span>
                  <span className="font-bold text-sky-400"><NumberCounter value={stats.cornerOver65} suffix="%" /></span>
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden mt-1.5">
                  <div style={{ width: `${stats.cornerOver65}%` }} className="h-full bg-sky-400 rounded-full" />
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
