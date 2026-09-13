import React from 'react';

export default function LiveTicker({ matches = [] }) {
  const dynamicItems = React.useMemo(() => {
    if (!matches || matches.length === 0) {
      return [
        { type: 'LIVE', minute: "ESPN", match: "Consultando partidos y marcadores oficiales...", pick: "8 Ligas mundiales en directo", corners: "Datos Reales" }
      ];
    }

    const items = [];

    // 1. Live Matches first
    const liveMatches = matches.filter(m => m.status === 'LIVE');
    liveMatches.forEach(m => {
      items.push({
        type: 'LIVE',
        minute: m.liveMinute || "LIVE",
        match: `${m.homeTeam?.name || 'Local'} ${m.liveScore?.home ?? 0} - ${m.liveScore?.away ?? 0} ${m.awayTeam?.name || 'Visitante'}`,
        pick: `Pick IA: ${m.aiPick?.selection || 'En Juego'}`,
        corners: `${m.leagueName}`
      });
    });

    // 2. Upcoming matches today / tomorrow
    const upcoming = matches.filter(m => m.status === 'SCHEDULED').slice(0, 6);
    upcoming.forEach(m => {
      const timeStr = new Date(m.kickoff).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      items.push({
        type: 'PRE',
        minute: timeStr,
        match: `${m.homeTeam?.name || 'Local'} vs ${m.awayTeam?.name || 'Visitante'}`,
        pick: `Pick: ${m.aiPick?.selection || 'Ver Pronóstico'}`,
        corners: m.leagueName
      });
    });

    // 3. Banker Parlay Banner
    items.push({
      type: 'PARLAY',
      minute: 'AI VIP',
      match: 'Parlay Banquero Cuantitativo del Día',
      pick: 'Filtrado por Poisson & xG (Cuota Verificada)',
      corners: 'Seguridad Alta'
    });

    // 4. Recently finished matches
    const finished = matches.filter(m => m.status === 'FINISHED').slice(0, 4);
    finished.forEach(m => {
      items.push({
        type: 'FT',
        minute: 'FT',
        match: `${m.homeTeam?.name || 'Local'} ${m.finalScore?.home ?? 0} - ${m.finalScore?.away ?? 0} ${m.awayTeam?.name || 'Visitante'}`,
        pick: m.aiPick?.settlement === 'WON' ? '✅ Pronóstico Acertado' : `Pick: ${m.aiPick?.selection || 'Resultado'}`,
        corners: m.leagueName
      });
    });

    return items;
  }, [matches]);

  const tickerItems = dynamicItems;

  return (
    <div className="w-full bg-[#080b11] border-b border-white/5 py-1.5 px-4 overflow-hidden relative select-none">
      <div className="flex items-center space-x-8 animate-ticker whitespace-nowrap text-xs font-mono hover:[animation-play-state:paused]">
        {[...tickerItems, ...tickerItems].map((item, idx) => (
          <div key={idx} className="inline-flex items-center space-x-2 text-slate-300">
            
            {/* Status indicator */}
            {item.type === 'LIVE' ? (
              <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                <span>LIVE {item.minute}</span>
              </span>
            ) : item.type === 'FT' ? (
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                FT
              </span>
            ) : item.type === 'PARLAY' ? (
              <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold">
                PARLAY
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-white/10 text-[10px] font-bold">
                {item.minute}
              </span>
            )}

            {/* Match info */}
            <span className="font-semibold text-white font-sans text-xs">
              {item.match}
            </span>

            {/* Pick detail */}
            <span className="text-slate-400 text-xs font-sans">
              • {item.pick}
            </span>

            <span className="text-slate-700 mx-2">•</span>
          </div>
        ))}
      </div>
    </div>
  );
}
