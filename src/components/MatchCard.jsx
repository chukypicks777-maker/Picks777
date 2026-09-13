import { Eye, Plus, Clock, Sparkles } from 'lucide-react';
import { formatOdds } from '../utils/oddsFormatter';
import { percent, dateTime } from '../utils/api';
import { useClock } from '../utils/clock';

export default function MatchCard({ match, onOpenModal, onAddToParlay, oddsFormat = 'decimal' }) {
  const now = useClock();
  const canAdd = match.aiPick && Number.isFinite(match.aiPick.odds) && match.aiPick.odds > 1 && Date.parse(match.kickoff) > now;
  const isLive = match.status === 'LIVE';
  const isFinished = match.status === 'FINISHED';

  return (
    <article className="terminal-card rounded-2xl p-5 flex flex-col gap-4.5 hover:border-sky-500/40 hover:shadow-lg hover:shadow-sky-950/20 transition-all duration-200 border border-white/[0.08] bg-[#0c121d]">
      {/* Header */}
      <div className="flex justify-between items-center text-xs">
        <span className="font-semibold text-slate-300 flex items-center gap-1.5">
          <span>{match.leagueFlag}</span>
          <span>{match.leagueName}</span>
        </span>
        <span className={`px-2 py-0.5 rounded-full font-mono text-[11px] font-bold ${
          isLive
            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse'
            : isFinished
              ? 'bg-slate-800 text-slate-400'
              : 'bg-white/5 text-slate-400'
        }`}>
          {isLive ? `EN VIVO ${match.liveMinute || ''}` : isFinished ? 'FINAL' : match.statusDetail || 'PROGRAMADO'}
        </span>
      </div>

      {/* Teams and Scores */}
      <div className="space-y-3 py-1">
        {[match.homeTeam, match.awayTeam].map((team, i) => (
          <div key={team?.id || i} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {team?.logo ? (
                <img src={team.logo} alt="" loading="lazy" className="w-7 h-7 object-contain shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold shrink-0">
                  {team?.name?.slice(0, 2).toUpperCase() || 'EQ'}
                </div>
              )}
              <h3 className="font-semibold text-sm truncate text-white">{team?.name || 'Equipo'}</h3>
            </div>
            {(isLive || isFinished) && (
              <strong className="font-mono text-xl text-white px-2 py-0.5 bg-black/40 rounded border border-white/10 shrink-0">
                {match.liveScore?.[i ? 'away' : 'home'] ?? 0}
              </strong>
            )}
          </div>
        ))}
      </div>

      {/* Date / Time */}
      <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-white/5">
        <span className="flex items-center gap-1.5">
          <Clock size={13} className="text-slate-500" />
          <span>{dateTime(match.kickoff)}</span>
        </span>
        {match.venue && <span className="truncate max-w-[150px] text-slate-500">{match.venue}</span>}
      </div>

      {/* Odds Row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ['1 Local', 'homeWin'],
          ['X Empate', 'draw'],
          ['2 Visita', 'awayWin']
        ].map(([label, key]) => (
          <div key={key} className="rounded-lg bg-white/[0.04] p-2 border border-white/5 hover:border-white/10 transition-colors">
            <span className="block text-[11px] text-slate-400 font-medium">{label}</span>
            <strong className="font-mono text-sm text-sky-200 mt-0.5 block">
              {formatOdds(match.odds?.[key], oddsFormat)}
            </strong>
            <span className="block text-[10px] text-slate-500 mt-0.5">
              {percent(match.probabilities?.[key])}
            </span>
          </div>
        ))}
      </div>

      {/* AI Pick Box */}
      <div className="bg-gradient-to-br from-sky-950/40 to-slate-900/60 border border-sky-500/20 rounded-xl p-3 flex-1">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-[10px] uppercase tracking-wider font-bold text-sky-300 flex items-center gap-1">
            <Sparkles size={11} />
            <span>{match.aiPick ? 'Pick Principal de la IA' : 'Inteligencia DeportePicks'}</span>
          </p>
          {match.model?.predictedScore && (
            <span className="text-[10px] font-mono text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 font-bold">
              Marcador: {match.model.predictedScore}
            </span>
          )}
        </div>
        <p className="text-xs font-semibold text-slate-200 line-clamp-2">
          {match.aiPick?.selection || (
            match.odds?.homeWin
              ? 'Pronóstico y análisis táctico disponibles al abrir el partido.'
              : 'Información oficial de ESPN · Cuotas pendientes de publicación.'
          )}
        </p>
        {Number.isFinite(match.probabilities?.bttsYes) && (
          <p className="text-[11px] text-slate-400 mt-1.5 flex gap-3 font-mono">
            <span>BTTS: {percent(match.probabilities.bttsYes)}</span>
            <span>+2.5 Goles: {percent(match.probabilities.over25)}</span>
          </p>
        )}
      </div>

      {/* Source Info */}
      <div className="text-[11px] text-slate-500 flex justify-between items-center">
        <a className="hover:text-sky-300 underline" href={match.sourceUrl} target="_blank" rel="noreferrer">
          ESPN Oficial
        </a>
        <span>Cuotas: {match.oddsProvider || 'Mercado'}</span>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          className="control flex-1 justify-center text-xs py-2 disabled:opacity-40"
          disabled={!canAdd}
          onClick={() => onAddToParlay({
            matchId: match.id,
            matchTitle: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
            league: match.leagueName,
            ...match.aiPick,
            oddsFetchedAt: match.oddsFetchedAt
          })}
        >
          <Plus size={14} />
          <span>Parlay</span>
        </button>
        <button
          className="primary flex-1 justify-center text-xs py-2"
          onClick={() => onOpenModal(match)}
        >
          <Eye size={14} />
          <span>Análisis IA</span>
        </button>
      </div>
    </article>
  );
}

