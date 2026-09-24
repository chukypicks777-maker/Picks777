import React from 'react';
import { displayNumber } from '../utils/probability';
import { Activity, Calendar } from 'lucide-react';

export default function LiveTacticalPitch({ match }) {
  if (!match) return null;
  const isLiveOrFinished = match.status === 'LIVE' || match.status === 'FINISHED';
  const live = match.realBoxscore;
  const hasRealBoxData = Boolean(
    live && (
      Object.values(live.home || {}).some(v => v !== null) ||
      Object.values(live.away || {}).some(v => v !== null)
    )
  );

  if (isLiveOrFinished) {
    return (
      <section className="rounded-xl p-5 bg-[#0a0f19] border border-white/10 text-xs text-slate-300 space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <h4 className="font-bold text-white flex items-center space-x-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>Estadísticas Observadas del Partido ({match.status === 'LIVE' ? (match.liveMinute ? `En Vivo · ${match.liveMinute}'` : 'En Vivo') : 'Finalizado'})</span>
          </h4>
          <span className="text-[10px] font-mono text-slate-400">Datos oficiales en directo (ESPN)</span>
        </div>

        {!hasRealBoxData ? (
          <p className="text-slate-400 font-sans text-xs">
            El proveedor aún no ha publicado el registro detallado de posesión y remates en vivo para este encuentro.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {['home', 'away'].map(side => {
              const team = match[`${side}Team`];
              const stats = live?.[side] || {};
              return (
                <div key={side} className="space-y-2 bg-[#0d1424] p-3 rounded-xl border border-white/5">
                  <div className="flex items-center space-x-2 pb-1 border-b border-white/5">
                    {team?.logo && <img src={team.logo} alt="" className="w-5 h-5 object-contain" />}
                    <h5 className="text-sky-300 font-bold truncate">{team?.name || (side === 'home' ? 'Local' : 'Visitante')}</h5>
                  </div>
                  <div className="space-y-1 text-slate-300 font-mono text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Posesión:</span>
                      <span className="font-bold text-white">{displayNumber(stats.possession)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Remates totales:</span>
                      <span className="font-bold text-white">{displayNumber(stats.shots, 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Tiros al arco:</span>
                      <span className="font-bold text-white">{displayNumber(stats.shotsOnTarget, 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Tiros de esquina:</span>
                      <span className="font-bold text-amber-300">{displayNumber(stats.corners, 0)} 🚩</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Faltas cometidas:</span>
                      <span className="font-bold text-slate-300">{displayNumber(stats.fouls, 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Tarjetas amarillas:</span>
                      <span className="font-bold text-amber-400">{displayNumber(stats.yellowCards, 0)} 🟨</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  // Pre-partido / SCHEDULED
  const home = match.homeTeam || {};
  const away = match.awayTeam || {};
  const kickoffFormatted = match.kickoff
    ? new Date(match.kickoff).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'Por definir';

  return (
    <section className="rounded-xl p-5 bg-[#0a0f19] border border-white/10 text-xs text-slate-300 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-white/5 pb-2">
        <h4 className="font-bold text-white flex items-center space-x-2">
          <Calendar className="w-4 h-4 text-sky-400" />
          <span>Contexto Pre-Partido & Estadísticas de Temporada</span>
        </h4>
        <span className="text-[10px] font-mono text-sky-300/80">
          Programado: {kickoffFormatted}
        </span>
      </div>

      <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
        Las estadísticas observadas en vivo (posesión, remates y tiros de esquina) se activarán automáticamente en este bloque al iniciar el encuentro. Consulta a continuación el rendimiento consolidado de temporada de ambos equipos:
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { side: 'home', label: 'Local', team: home, color: 'text-sky-300', borderColor: 'border-sky-500/20' },
          { side: 'away', label: 'Visitante', team: away, color: 'text-indigo-300', borderColor: 'border-indigo-500/20' }
        ].map(({ side, label, team, color, borderColor }) => (
          <div key={side} className={`bg-[#0d1424] p-3.5 rounded-xl border ${borderColor} space-y-2.5`}>
            <div className="flex items-center justify-between pb-1.5 border-b border-white/5">
              <div className="flex items-center space-x-2">
                {team.logo && <img src={team.logo} alt="" className="w-6 h-6 object-contain" />}
                <div>
                  <h5 className={`font-bold ${color} text-xs truncate max-w-[160px]`}>{team.name || label}</h5>
                  <span className="text-[10px] text-slate-400 font-mono block">
                    {label} {team.position ? `· Puesto #${team.position}` : ''} {team.points != null ? `(${team.points} pts)` : ''}
                  </span>
                </div>
              </div>
              {Array.isArray(team.form) && team.form.length > 0 && (
                <div className="flex items-center space-x-1 font-mono text-[9px]">
                  {team.form.slice(-5).map((f, i) => (
                    <span
                      key={i}
                      className={`w-4 h-4 rounded font-bold flex items-center justify-center text-white ${
                        f === 'W' ? 'bg-emerald-600' : f === 'D' ? 'bg-amber-600' : 'bg-rose-600'
                      }`}
                    >
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="bg-[#121929] p-2 rounded-lg border border-white/5">
                <span className="text-slate-400 block text-[9.5px]">Partidos Jugados:</span>
                <span className="font-bold text-white">{team.gamesPlayed ?? 'N/D'}</span>
              </div>
              <div className="bg-[#121929] p-2 rounded-lg border border-white/5">
                <span className="text-slate-400 block text-[9.5px]">Goles Favor / Contra:</span>
                <span className="font-bold text-white">{team.goalsFor ?? 0} / {team.goalsAgainst ?? 0}</span>
              </div>
              <div className="bg-[#121929] p-2 rounded-lg border border-white/5">
                <span className="text-slate-400 block text-[9.5px]">Prom. Córners:</span>
                <span className="font-bold text-amber-300">{team.avgCorners != null ? `${team.avgCorners} 🚩` : 'En cálculo'}</span>
              </div>
              <div className="bg-[#121929] p-2 rounded-lg border border-white/5">
                <span className="text-slate-400 block text-[9.5px]">Prom. Tarjetas:</span>
                <span className="font-bold text-rose-400">{team.avgYellowCards != null ? `${team.avgYellowCards} 🟨` : 'En cálculo'}</span>
              </div>
            </div>

            {Array.isArray(team.keyPlayers) && team.keyPlayers.length > 0 && (
              <div className="pt-1.5 border-t border-white/5">
                <span className="text-[10px] text-slate-400 block mb-1 font-mono">Líderes / Jugadores destacados:</span>
                <div className="flex flex-wrap gap-1">
                  {team.keyPlayers.slice(0, 3).map((player, idx) => (
                    <span key={idx} className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-200 text-[10px] font-sans">
                      {player}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
