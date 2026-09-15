import React from 'react';
import { Plus, Eye, Clock, CheckCircle2, Zap } from 'lucide-react';
import { formatOdds } from '../utils/oddsFormatter';
import { sounds } from '../utils/audioEffects';
import TiltCard from './TiltCard';
import NumberCounter from './NumberCounter';
import { getBestBankerPick } from '../utils/mathProbabilities';

export default function MatchCard({ 
  match, 
  onOpenModal, 
  onAddToParlay, 
  oddsFormat = 'decimal',
  bankerRank = null
}) {
  const homeProb = match.probabilities?.homeWin || 50;
  const drawProb = match.probabilities?.draw || 25;
  const awayProb = match.probabilities?.awayWin || 25;
  const bttsProb = match.probabilities?.bttsYes || 55;
  const over25Prob = match.probabilities?.over25 || 60;
  const under25Prob = match.probabilities?.under25 != null ? match.probabilities.under25 : (100 - over25Prob);
  const confidenceScore = match.probabilities?.confidence || match.aiPick?.probability || Math.round(Math.max(homeProb, awayProb, over25Prob, under25Prob, 65));
  
  const bankerPick = getBestBankerPick(match);
  const isBankerMode = bankerRank != null;
  const displayPick = isBankerMode ? bankerPick.selection : (match.aiPick?.selection || bankerPick.selection);
  const displayOdds = isBankerMode ? bankerPick.odds : (match.aiPick?.odds || match.odds?.homeWin || bankerPick.odds);
  const displayProb = isBankerMode ? bankerPick.safetyScore : confidenceScore;

  const formatMatchTime = (iso) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <TiltCard 
      maxTilt={6} 
      scale={1.018}
      className="terminal-card rounded-xl p-4 flex flex-col justify-between border border-white/10 hover:border-sky-500/40"
    >
      <div>
        {/* Card Header: League & Match Status / Time */}
        <div className="flex items-center justify-between text-xs mb-3 pb-2.5 border-b border-white/5">
          <div className="flex items-center space-x-1.5 text-slate-300 font-sans">
            <span>{match.leagueFlag}</span>
            <span className="font-medium text-xs truncate max-w-[150px]">
              {match.leagueName}
            </span>
          </div>

          <div>
            {match.status === 'LIVE' ? (
              <span className="px-2 py-0.5 bg-rose-500/20 text-rose-400 border border-rose-500/40 rounded text-[10px] font-mono font-bold flex items-center space-x-1 shadow-[0_0_8px_rgba(244,63,94,0.3)]">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 live-dot"></span>
                <span>{match.liveMinute}</span>
              </span>
            ) : match.status === 'FINISHED' ? (
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-mono font-bold">
                FT Final
              </span>
            ) : (
              <span className="px-2 py-0.5 bg-[#141b28] text-slate-400 rounded text-[10px] font-mono border border-white/5 flex items-center space-x-1">
                <Clock className="w-3 h-3 text-sky-400" />
                <span>{formatMatchTime(match.kickoff)}</span>
              </span>
            )}
          </div>
        </div>

        {/* Teams Matchup Rows */}
        <div className="space-y-2.5 mb-3.5">
          
          {/* Home Team */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5 flex-1 min-w-0">
              <img
                src={match.homeTeam?.logo}
                alt={match.homeTeam?.name}
                className="w-6 h-6 object-contain shrink-0 filter drop-shadow"
              />
              <span className="font-semibold text-xs text-white truncate">
                {match.homeTeam?.name}
              </span>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              {match.status === 'LIVE' ? (
                <span className="text-base font-black font-mono text-white">
                  {match.liveScore?.home ?? 0}
                </span>
              ) : match.status === 'FINISHED' ? (
                <span className="text-base font-black font-mono text-white">
                  {match.finalScore?.home ?? 0}
                </span>
              ) : null}
              <span className="px-2 py-0.5 bg-[#141b28] border border-white/5 rounded text-xs font-mono font-semibold text-sky-300">
                {formatOdds(match.odds?.homeWin, oddsFormat)}
              </span>
            </div>
          </div>

          {/* Away Team */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5 flex-1 min-w-0">
              <img
                src={match.awayTeam?.logo}
                alt={match.awayTeam?.name}
                className="w-6 h-6 object-contain shrink-0 filter drop-shadow"
              />
              <span className="font-semibold text-xs text-white truncate">
                {match.awayTeam?.name}
              </span>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              {match.status === 'LIVE' ? (
                <span className="text-base font-black font-mono text-white">
                  {match.liveScore?.away ?? 0}
                </span>
              ) : match.status === 'FINISHED' ? (
                <span className="text-base font-black font-mono text-white">
                  {match.finalScore?.away ?? 0}
                </span>
              ) : null}
              <span className="px-2 py-0.5 bg-[#141b28] border border-white/5 rounded text-xs font-mono font-semibold text-sky-300">
                {formatOdds(match.odds?.awayWin, oddsFormat)}
              </span>
            </div>
          </div>

        </div>

        {/* Probabilities Segment Bar */}
        <div className="space-y-1 mb-3">
          <div className="flex justify-between text-[10px] font-mono text-slate-400">
            <span>1: <strong><NumberCounter value={homeProb} suffix="%" /></strong></span>
            <span>X: <strong><NumberCounter value={drawProb} suffix="%" /></strong></span>
            <span>2: <strong><NumberCounter value={awayProb} suffix="%" /></strong></span>
          </div>
          <div className="h-1.5 w-full bg-[#161c28] rounded-full overflow-hidden flex gap-0.5">
            <div style={{ width: `${homeProb}%` }} className="bg-sky-500 h-full rounded-l-full transition-all duration-500 shadow-[0_0_6px_rgba(56,189,248,0.4)]" />
            <div style={{ width: `${drawProb}%` }} className="bg-slate-500 h-full transition-all duration-500" />
            <div style={{ width: `${awayProb}%` }} className="bg-indigo-500 h-full rounded-r-full transition-all duration-500 shadow-[0_0_6px_rgba(129,140,248,0.4)]" />
          </div>
        </div>

        {/* Banker Rank Banner if in Banker Mode */}
        {bankerRank != null && (
          <div className="mb-2.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-emerald-500/20 via-sky-500/15 to-transparent border border-emerald-500/35 flex items-center justify-between font-mono text-[10px]">
            <span className="font-bold text-emerald-300 flex items-center space-x-1">
              <span>💎 TOP #{bankerRank} BANQUERO</span>
            </span>
            <span className="text-sky-300 font-bold">
              {displayProb}% Seguridad
            </span>
          </div>
        )}

        {/* Quick Stats Pills: BTTS, +2.5 Over & -2.5 Under */}
        <div className="grid grid-cols-3 gap-1 mb-3 text-center text-[10px] font-mono">
          <div className="bg-[#121824] p-1.5 rounded border border-white/5">
            <span className="text-slate-400 block text-[9px]">BTTS</span>
            <span className="font-bold text-amber-300">{bttsProb}%</span>
          </div>
          <div className="bg-[#121824] p-1.5 rounded border border-white/5">
            <span className="text-slate-400 block text-[9px]">+2.5 Over</span>
            <span className="font-bold text-emerald-400">{over25Prob}%</span>
          </div>
          <div className="bg-[#121824] p-1.5 rounded border border-white/5">
            <span className="text-slate-400 block text-[9px]">-2.5 Under</span>
            <span className="font-bold text-sky-300">{under25Prob}%</span>
          </div>
        </div>

        {/* Pick Recommendation Capsule */}
        <div className="bg-[#121824] border border-sky-500/20 rounded-lg p-2.5 mb-3">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[9.5px] font-mono font-bold text-sky-400 uppercase tracking-wide flex items-center space-x-1">
              <Zap className="w-2.5 h-2.5 fill-sky-400" />
              <span>{isBankerMode || confidenceScore >= 80 ? '💎 Pick Banquero IA' : 'Pronóstico IA'}</span>
            </span>
            {match.aiPick?.settlement === 'WON' ? (
              <span className="text-[9.5px] font-mono text-emerald-400 font-bold flex items-center space-x-0.5">
                <CheckCircle2 className="w-3 h-3" />
                <span>ACERTADO</span>
              </span>
            ) : (
              <span className="text-[9.5px] font-mono text-slate-400">
                {displayProb}% Conf.
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-white truncate">
              {displayPick}
            </p>
            <span className="text-[11px] font-mono font-bold text-emerald-400 shrink-0 ml-1.5">
              @{formatOdds(displayOdds, oddsFormat)}
            </span>
          </div>
        </div>

      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
        <button
          onClick={(e) => {
            e.stopPropagation();
            sounds.playAddParlay();
            onAddToParlay({
              matchId: match.id,
              matchTitle: `${match.homeTeam?.name || 'Local'} vs ${match.awayTeam?.name || 'Visita'}`,
              league: match.leagueName,
              selection: displayPick,
              odds: displayOdds,
              probability: displayProb
            });
          }}
          className="py-1.5 px-2 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-medium transition flex items-center justify-center space-x-1 cursor-pointer"
        >
          <Plus className="w-3 h-3" />
          <span>Al Parlay</span>
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            sounds.playClick();
            onOpenModal(match);
          }}
          className="py-1.5 px-2 bg-sky-400 hover:bg-sky-300 text-black rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1 cursor-pointer shadow-[0_0_10px_rgba(56,189,248,0.3)]"
        >
          <Eye className="w-3 h-3" />
          <span>Detalle</span>
        </button>
      </div>

    </TiltCard>
  );
}
