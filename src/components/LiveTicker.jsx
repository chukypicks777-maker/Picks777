import { isFresh } from '../utils/api';
import { useClock } from '../utils/clock';
import { Radio } from 'lucide-react';

export default function LiveTicker({ matches = [], onSelectMatch }) {
  const now = useClock();
  const live = matches.filter(m => m.status === 'LIVE' && isFresh(m, now));

  return (
    <section aria-label="Marcadores en vivo" className="border-b border-rose-500/20 bg-gradient-to-r from-rose-950/30 via-[#0d121c] to-rose-950/30 px-4 py-2.5 overflow-x-auto no-scrollbar scrollbar-none">
      <div className="flex items-center gap-6 text-xs whitespace-nowrap max-w-7xl mx-auto">
        <div className="flex items-center gap-2 text-rose-400 font-bold uppercase tracking-wider text-[11px] shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
          </span>
          <Radio size={13} className="animate-pulse" />
          <span>VIVO ({live.length})</span>
        </div>

        {live.length ? (
          <div className="flex items-center gap-6">
            {live.map(m => (
              <button
                key={m.id}
                onClick={() => onSelectMatch?.(m)}
                className="inline-flex items-center gap-2.5 px-3 py-1 rounded-lg bg-white/5 border border-white/10 hover:border-rose-500/40 hover:bg-rose-500/10 transition-all cursor-pointer text-left shrink-0"
              >
                <span className="text-[10px] font-mono font-bold text-rose-400 bg-rose-500/20 px-1.5 py-0.5 rounded">
                  {m.liveMinute || 'EN JUEGO'}
                </span>
                <span className="text-slate-300 font-medium">{m.homeTeam.shortName || m.homeTeam.name}</span>
                <strong className="font-mono text-sm text-white px-1 bg-black/40 rounded">
                  {m.liveScore.home ?? 0} - {m.liveScore.away ?? 0}
                </strong>
                <span className="text-slate-300 font-medium">{m.awayTeam.shortName || m.awayTeam.name}</span>
                <span className="text-[10px] text-slate-500">{m.leagueFlag}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-slate-400 text-xs flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
            Sin partidos en juego ahora · Todos los horarios y próximos encuentros disponibles a continuación.
          </p>
        )}
      </div>
    </section>
  );
}

