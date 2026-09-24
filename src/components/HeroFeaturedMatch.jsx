import { percent, roundDistribution } from '../utils/probability';
import React, { useState } from 'react';
import { Plus, Eye, Clock, Zap, Target } from 'lucide-react';
import { formatOdds } from '../utils/oddsFormatter';
import { sounds } from '../utils/audioEffects';
import TiltCard from './TiltCard';
import NumberCounter from './NumberCounter';
import RadarScanner from './RadarScanner';
import { getTop3Opportunities, getCoherentPredictedScore, getEffectiveOdds } from '../utils/mathProbabilities';

export default function HeroFeaturedMatch({ 
  match, 
  onOpenMatch, 
  onAddToParlay, 
  oddsFormat = 'decimal' 
}) {
  const [isScanning, setIsScanning] = useState(false);

  if (!match) return null;

  const baseProbs = match.model?.probabilities || match.probabilities || {};
  const outcomes = roundDistribution({ homeWin: baseProbs.homeWin, draw: baseProbs.draw, awayWin: baseProbs.awayWin });
  const rawOpportunities = getTop3Opportunities(match);
  const parlayCandidates = rawOpportunities
    .map(pick => {
      const effectiveOdds = getEffectiveOdds(pick);
      return effectiveOdds ? { ...pick, odds: effectiveOdds } : null;
    })
    .filter(Boolean);
  const homeProb = percent(outcomes.homeWin);
  const drawProb = percent(outcomes.draw);
  const awayProb = percent(outcomes.awayWin);

  return (
    <div className="mb-8">
      {isScanning ? (
        <RadarScanner 
          matchTitle={`${match.homeTeam?.name || 'Local'} vs ${match.awayTeam?.name || 'Visita'}`}
          onScanComplete={() => setIsScanning(false)}
        />
      ) : (
        <TiltCard 
          maxTilt={5} 
          scale={1.01} 
          role="button"
          tabIndex={0}
          onClick={() => {
            sounds.playClick();
            onOpenMatch(match);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              sounds.playClick();
              onOpenMatch(match);
            }
          }}
          className="rounded-2xl border border-sky-500/20 bg-[#0c111a] shadow-[0_10px_35px_rgba(0,0,0,0.6)] cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-400/50"
        >
          <div className="p-3.5 sm:p-5 md:p-7 relative overflow-hidden">
            
            {/* Header Info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 mb-4 sm:mb-6">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-mono">
                {match.status === 'LIVE' ? (
                  <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 bg-rose-500/20 text-rose-400 border border-rose-500/40 rounded-md font-bold flex items-center space-x-1.5 shadow-[0_0_12px_rgba(244,63,94,0.3)] shrink-0">
                    <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-rose-400 live-dot"></span>
                    <span>EN VIVO {match.liveMinute}</span>
                  </span>
                ) : match.status === 'FINISHED' ? (
                  <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-md font-bold shrink-0">
                    FINALIZADO (FT)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 bg-sky-500/15 text-sky-300 border border-sky-500/25 rounded-md font-medium flex items-center space-x-1 shrink-0">
                    <Clock className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-sky-400 shrink-0" />
                    <span>{new Date(match.kickoff).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
                  </span>
                )}

                <span className="text-slate-300 font-sans font-semibold shrink-0">
                  {match.leagueFlag} {match.leagueName}
                </span>
                {match.venue && (
                  <>
                    <span className="text-slate-600 hidden sm:inline">•</span>
                    <span className="text-slate-400 truncate max-w-[130px] sm:max-w-none">{match.venue}</span>
                  </>
                )}
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto shrink-0 pt-1.5 sm:pt-0 border-t sm:border-t-0 border-white/5">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsScanning(true);
                  }}
                  className="px-2 sm:px-2.5 py-1 bg-sky-500/10 hover:bg-sky-500/20 active:scale-95 text-sky-300 border border-sky-500/30 rounded-lg text-[11px] sm:text-xs font-mono flex items-center space-x-1 transition cursor-pointer shrink-0"
                >
                  <Target className="w-3.5 h-3.5 animate-pulse text-sky-400 shrink-0" />
                  <span>Radar Scanner</span>
                </button>
                {match.referee && (
                  <div className="text-[11px] sm:text-xs font-mono text-slate-400 truncate max-w-[150px] sm:max-w-none text-right min-w-0 flex-1 sm:flex-initial">
                    Árbitro: <strong className="text-slate-200">{match.referee}</strong>
                  </div>
                )}
              </div>
            </div>

            {/* Teams Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-center">
              
              {/* Teams Matchup (7 cols) */}
              <div className="lg:col-span-7 flex flex-col justify-center">
                <div className="flex items-center justify-between sm:justify-around gap-1.5 sm:gap-4 py-1 sm:py-2">
                  
                  {/* Home Team */}
                  <div className="flex flex-col items-center text-center space-y-1 sm:space-y-2 flex-1 min-w-0">
                    <img
                      src={match.homeTeam?.logo}
                      alt={match.homeTeam?.name}
                      className="w-10 h-10 sm:w-14 sm:h-14 md:w-16 md:h-16 object-contain filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] transition-transform hover:scale-105 shrink-0"
                    />
                    <div className="w-full px-0.5 sm:px-1">
                      <h4 className="font-bold text-xs sm:text-sm md:text-lg text-white truncate">
                        {match.homeTeam?.name}
                      </h4>
                      <p className="text-[9.5px] sm:text-xs font-mono text-slate-400 truncate">
                        Local{match.homeTeam?.position ? ` • #${match.homeTeam.position} (${match.homeTeam.points ?? 0} pts)` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-0.5 sm:gap-1 mt-0.5 sm:mt-1 justify-center shrink-0 max-w-full">
                      {(match.homeTeam?.form || []).map((f, i) => (
                        <span
                          key={i}
                          className={`w-3 h-3 sm:w-4 sm:h-4 text-[7.5px] sm:text-[9px] font-bold font-mono rounded flex items-center justify-center shrink-0 ${
                            f === 'W' ? 'bg-emerald-600 text-white' : f === 'D' ? 'bg-amber-600 text-white' : 'bg-rose-600 text-white'
                          }`}
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Score Center */}
                  <div className="flex flex-col items-center justify-center px-1 sm:px-3 shrink-0">
                    <div className="bg-[#141a27] border border-white/10 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl text-center shadow-inner">
                      <span className="text-[8px] sm:text-[10px] font-mono text-slate-400 uppercase tracking-wider block whitespace-nowrap">
                        <span className="sm:hidden">{match.status === 'LIVE' ? 'En Vivo' : match.status === 'FINISHED' ? 'Final' : 'Marcador IA'}</span>
                        <span className="hidden sm:inline">{match.status === 'LIVE' ? 'Marcador en Vivo' : match.status === 'FINISHED' ? 'Resultado Final' : 'Marcador IA'}</span>
                      </span>
                      <span className="text-sm sm:text-xl md:text-2xl font-black font-mono text-white tracking-wider whitespace-nowrap">
                        {match.status === 'LIVE' 
                          ? `${match.liveScore?.home ?? match.finalScore?.home ?? 0} - ${match.liveScore?.away ?? match.finalScore?.away ?? 0}`
                          : match.status === 'FINISHED'
                          ? `${match.finalScore?.home ?? match.liveScore?.home ?? 0} - ${match.finalScore?.away ?? match.liveScore?.away ?? 0}`
                          : getCoherentPredictedScore(match)}
                      </span>
                    </div>
                  </div>

                  {/* Away Team */}
                  <div className="flex flex-col items-center text-center space-y-1 sm:space-y-2 flex-1 min-w-0">
                    <img
                      src={match.awayTeam?.logo}
                      alt={match.awayTeam?.name}
                      className="w-10 h-10 sm:w-14 sm:h-14 md:w-16 md:h-16 object-contain filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] transition-transform hover:scale-105 shrink-0"
                    />
                    <div className="w-full px-0.5 sm:px-1">
                      <h4 className="font-bold text-xs sm:text-sm md:text-lg text-white truncate">
                        {match.awayTeam?.name}
                      </h4>
                      <p className="text-[9.5px] sm:text-xs font-mono text-slate-400 truncate">
                        Visita{match.awayTeam?.position ? ` • #${match.awayTeam.position} (${match.awayTeam.points ?? 0} pts)` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-0.5 sm:gap-1 mt-0.5 sm:mt-1 justify-center shrink-0 max-w-full">
                      {(match.awayTeam?.form || []).map((f, i) => (
                        <span
                          key={i}
                          className={`w-3 h-3 sm:w-4 sm:h-4 text-[7.5px] sm:text-[9px] font-bold font-mono rounded flex items-center justify-center shrink-0 ${
                            f === 'W' ? 'bg-emerald-600 text-white' : f === 'D' ? 'bg-amber-600 text-white' : 'bg-rose-600 text-white'
                          }`}
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>

                </div>

                {/* Segmented Probabilities Bar with Counters */}
                <div className="mt-3 sm:mt-4 space-y-1.5">
                  <div className="flex justify-between text-[11px] sm:text-xs font-mono text-slate-300">
                    <span>Local: <strong><NumberCounter value={homeProb} suffix="%" /></strong></span>
                    <span>Empate: <strong><NumberCounter value={drawProb} suffix="%" /></strong></span>
                    <span>Visita: <strong><NumberCounter value={awayProb} suffix="%" /></strong></span>
                  </div>
                  <div className="h-2 sm:h-2.5 w-full bg-[#161c28] rounded-full overflow-hidden flex gap-0.5 p-0.5 border border-white/5">
                    <div style={{ width: `${homeProb}%` }} className="bg-sky-500 h-full rounded-l-full transition-all duration-700 shadow-[0_0_8px_rgba(56,189,248,0.5)]" />
                    <div style={{ width: `${drawProb}%` }} className="bg-slate-500 h-full transition-all duration-700" />
                    <div style={{ width: `${awayProb}%` }} className="bg-indigo-500 h-full rounded-r-full transition-all duration-700 shadow-[0_0_8px_rgba(129,140,248,0.5)]" />
                  </div>
                </div>

              </div>

              {/* AI Pick Box (5 cols) */}
              <div className="lg:col-span-5 bg-[#111724] border border-sky-500/30 rounded-xl p-3.5 sm:p-5 flex flex-col justify-between shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono text-sky-400 font-bold uppercase tracking-wide flex items-center space-x-1">
                      <Zap className="w-3.5 h-3.5 text-sky-400 fill-sky-400/20" />
                      <span>{match.aiPick?.type || 'Pick Principal'}</span>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-mono font-bold border border-sky-500/30">
                      {(() => {
                        const confRaw = match.aiPick?.confidence;
                        if (typeof confRaw === 'number') return `${Math.round(confRaw)}% Conf.`;
                        const parsed = parseFloat(String(confRaw || '').replace('%', ''));
                        return Number.isFinite(parsed) ? `${Math.round(parsed)}% Conf.` : (confRaw || '88% Conf.');
                      })()}
                    </span>
                  </div>

                  <h5 className="text-white font-bold text-sm md:text-base mb-2 font-sans">
                    {match.aiPick?.selection}
                  </h5>

                  <p className="text-xs text-slate-300 line-clamp-3 mb-4 leading-relaxed font-sans">
                    {match.aiPick?.summaryRationale}
                  </p>
                </div>

                <div className="space-y-3 pt-3 border-t border-white/5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-400">Cuota Recomendada:</span>
                    <span className="text-sky-300 font-bold text-sm">
                      {formatOdds(match.aiPick?.odds ?? match.aiPick?.estimatedOdds ?? parlayCandidates[0]?.odds, oddsFormat)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {match.status === 'FINISHED' ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          sounds.playClick();
                          onOpenMatch(match);
                        }}
                        className="py-2 px-3 bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-white/5 rounded-lg text-xs font-semibold transition flex items-center justify-center space-x-1 cursor-pointer"
                      >
                        <Clock className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Finalizado</span>
                      </button>
                    ) : (
                      <button disabled={!parlayCandidates.length}
                        onClick={(e) => {
                          e.stopPropagation();
                          sounds.playAddParlay();
                          const topOpportunity = parlayCandidates[0];
                          onAddToParlay(topOpportunity);
                        }}
                        className="py-2 px-3 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-semibold transition flex items-center justify-center space-x-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{parlayCandidates.length ? 'Al Parlay' : 'Sin cuota'}</span>
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        sounds.playClick();
                        onOpenMatch(match);
                      }}
                      className="py-2 px-3 bg-sky-400 hover:bg-sky-300 text-black font-bold rounded-lg text-xs transition flex items-center justify-center space-x-1 cursor-pointer shadow-[0_0_15px_rgba(56,189,248,0.4)]"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Ver Informe</span>
                    </button>
                  </div>
                </div>

              </div>

            </div>

          </div>
        </TiltCard>
      )}
    </div>
  );
}
