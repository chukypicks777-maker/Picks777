import { percent, roundDistribution } from '../utils/probability';
import React from 'react';
import { Plus, Eye, Clock, CheckCircle2, Zap, Sparkles, Lock, Crown } from 'lucide-react';
import { formatOdds } from '../utils/oddsFormatter';
import { sounds } from '../utils/audioEffects';
import TiltCard from './TiltCard';
import NumberCounter from './NumberCounter';
import { getBestBankerPick, getTop3Opportunities, getEffectiveOdds } from '../utils/mathProbabilities';

export default function MatchCard({ 
  match, 
  onOpenModal, 
  onAddToParlay, 
  oddsFormat = 'decimal',
  bankerRank = null,
  isLocked = false,
  onUnlockVip = null
}) {
  const base = match.model?.probabilities || match.probabilities || {};
  const p = { ...base, ...roundDistribution({ homeWin: base.homeWin, draw: base.draw, awayWin: base.awayWin }) };
  const rawOpportunities = getTop3Opportunities(match);
  const parlayCandidates = rawOpportunities
    .map(pick => {
      const effectiveOdds = getEffectiveOdds(pick);
      return effectiveOdds ? { ...pick, odds: effectiveOdds } : null;
    })
    .filter(Boolean);
  const homeProb = percent(p.homeWin), drawProb = percent(p.draw), awayProb = percent(p.awayWin);
  const getGP = t => {
    if (!t) return null;
    if (Number.isFinite(t.gamesPlayed)) return t.gamesPlayed;
    if (t.homeRecord && Number.isFinite(t.homeRecord.w + t.homeRecord.d + t.homeRecord.l)) return t.homeRecord.w + t.homeRecord.d + t.homeRecord.l;
    if (t.awayRecord && Number.isFinite(t.awayRecord.w + t.awayRecord.d + t.awayRecord.l)) return t.awayRecord.w + t.awayRecord.d + t.awayRecord.l;
    if (t.record && Number.isFinite(t.record.w + t.record.d + t.record.l)) return t.record.w + t.record.d + t.record.l;
    return null;
  };

  const home = match.homeTeam || {};
  const away = match.awayTeam || {};
  const homeGP = getGP(home);
  const awayGP = getGP(away);

  // Derivación matemática Poisson cuando existen estadísticas de temporada (mínimo 5 partidos)
  const seasonPoisson = (() => {
    if (Number.isFinite(homeGP) && homeGP >= 5 && Number.isFinite(awayGP) && awayGP >= 5 &&
        Number.isFinite(home.goalsFor) && home.goalsFor >= 0 && Number.isFinite(home.goalsAgainst) && home.goalsAgainst >= 0 &&
        Number.isFinite(away.goalsFor) && away.goalsFor >= 0 && Number.isFinite(away.goalsAgainst) && away.goalsAgainst >= 0) {
      const lambda = (home.goalsFor / homeGP + away.goalsAgainst / awayGP) / 2;
      const mu = (away.goalsFor / awayGP + home.goalsAgainst / homeGP) / 2;
      const totalLambda = lambda + mu;
      if (lambda > 0 && mu > 0 && lambda <= 10 && mu <= 10 && totalLambda <= 20) {
        const p0 = Math.exp(-totalLambda);
        const p1 = totalLambda * p0;
        const p2 = (totalLambda * totalLambda / 2) * p0;
        const pHome = 1 - Math.exp(-lambda);
        const pAway = 1 - Math.exp(-mu);
        return {
          over15: Math.round((1 - p0 - p1) * 100),
          over25: Math.round((1 - p0 - p1 - p2) * 100),
          bttsYes: Math.round(pHome * pAway * 100)
        };
      }
    }
    return null;
  })();

  const over15Prob = percent(p.over15) ?? percent(match.model?.probabilities?.over15) ?? percent(match.probabilities?.over15) ?? seasonPoisson?.over15 ?? null;
  const over25Prob = percent(p.over25) ?? percent(match.model?.probabilities?.over25) ?? percent(match.probabilities?.over25) ?? seasonPoisson?.over25 ?? null;
  const bttsProb = percent(p.bttsYes) ?? percent(match.model?.probabilities?.bttsYes) ?? percent(match.probabilities?.bttsYes) ?? seasonPoisson?.bttsYes ?? null;
  const bankerPick = getBestBankerPick(match);
  const isBankerMode = bankerRank != null;
  const displayPick = bankerPick?.selection || 'Sin datos suficientes';
  const displayOdds = bankerPick?.odds ?? getEffectiveOdds(bankerPick);
  const displayProb = bankerPick?.probability;
  const confidenceScore = displayProb;
  const formatMatchTime = (iso) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <TiltCard 
      maxTilt={6} 
      scale={1.018}
      role="button"
      tabIndex={0}
      onClick={() => {
        if (isLocked) {
          sounds.playClick();
          onUnlockVip?.();
        } else {
          sounds.playClick();
          onOpenModal(match);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (isLocked) {
            sounds.playClick();
            onUnlockVip?.();
          } else {
            sounds.playClick();
            onOpenModal(match);
          }
        }
      }}
      className="terminal-card rounded-xl p-4 flex flex-col justify-between border border-white/10 hover:border-sky-500/40 cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-400/50"
    >
      <div className={`flex flex-col justify-between h-full transition duration-300 ${isLocked ? 'filter blur-[4px] select-none pointer-events-none opacity-25' : ''}`}>
        <div>
          {/* Card Header: League & Match Status / Time */}
          <div className="flex items-center justify-between text-xs mb-3 pb-2.5 border-b border-white/5 gap-2">
            <div className="flex items-center space-x-1.5 text-slate-300 font-sans min-w-0">
              <span className="shrink-0">{match.leagueFlag}</span>
              <span className="font-medium text-xs truncate max-w-[140px] sm:max-w-[160px]">
                {match.leagueName}
              </span>
            </div>

            <div className="flex items-center space-x-1 font-mono text-[11px] shrink-0">
              {match.status === 'LIVE' ? (
                <span className="flex items-center space-x-1 text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                  <span>{match.minute ? `${match.minute}'` : 'EN VIVO'}</span>
                </span>
              ) : match.status === 'FINISHED' ? (
                <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  FINALIZADO
                </span>
              ) : (
                <span className="text-slate-400 flex items-center space-x-1">
                  <Clock className="w-3 h-3 text-slate-500" />
                  <span>{formatMatchTime(match.kickoff)}</span>
                </span>
              )}
            </div>
          </div>

          {/* Teams and Logos */}
          <div className="space-y-2 mb-3">
            {/* Home Team */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center space-x-2 min-w-0">
                <img
                  src={match.homeTeam?.logo}
                  alt={match.homeTeam?.name}
                  className="w-5 h-5 object-contain shrink-0"
                />
                <span className="font-semibold text-xs text-white truncate">
                  {match.homeTeam?.name}
                </span>
              </div>
              <div className="flex items-center space-x-2 font-mono text-xs shrink-0">
                {match.status === 'LIVE' || match.status === 'FINISHED' ? (
                  <span className="font-bold text-white text-sm">
                    {match.status === 'LIVE' ? match.liveScore?.home ?? match.finalScore?.home ?? 0 : match.finalScore?.home ?? match.liveScore?.home ?? 0}
                  </span>
                ) : (
                  <span className="text-slate-400 text-[11px]">
                    {formatOdds(match.odds?.homeWin, oddsFormat)}
                  </span>
                )}
              </div>
            </div>

            {/* Away Team */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center space-x-2 min-w-0">
                <img
                  src={match.awayTeam?.logo}
                  alt={match.awayTeam?.name}
                  className="w-5 h-5 object-contain shrink-0"
                />
                <span className="font-semibold text-xs text-white truncate">
                  {match.awayTeam?.name}
                </span>
              </div>
              <div className="flex items-center space-x-2 font-mono text-xs shrink-0">
                {match.status === 'LIVE' || match.status === 'FINISHED' ? (
                  <span className="font-bold text-white text-sm">
                    {match.status === 'LIVE' ? match.liveScore?.away ?? match.finalScore?.away ?? 0 : match.finalScore?.away ?? match.liveScore?.away ?? 0}
                  </span>
                ) : (
                  <span className="text-slate-400 text-[11px]">
                    {formatOdds(match.odds?.awayWin, oddsFormat)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Win Probabilities Bar (1 X 2) */}
          <div className="mb-3">
            <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1">
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
                {displayProb}% Prob.
              </span>
            </div>
          )}

          {/* Quick Stats Pills: Goles Over (+1.5, +2.5) y Ambos Anotan (BTTS) */}
          <div className="grid grid-cols-3 gap-1.5 mb-3 text-center text-[10px] font-mono">
            <div className="bg-[#121824] p-1.5 rounded border border-white/5">
              <span className="text-slate-400 block text-[9px] truncate">+1.5 Over</span>
              <span className="font-bold text-sky-300"><NumberCounter value={over15Prob} suffix="%" /></span>
            </div>
            <div className="bg-[#121824] p-1.5 rounded border border-white/5">
              <span className="text-slate-400 block text-[9px] truncate">+2.5 Over</span>
              <span className="font-bold text-emerald-400"><NumberCounter value={over25Prob} suffix="%" /></span>
            </div>
            <div className="bg-[#121824] p-1.5 rounded border border-white/5">
              <span className="text-slate-400 block text-[9px] truncate" title="Ambos Anotan (BTTS)">Ambos Anotan</span>
              <span className="font-bold text-amber-300"><NumberCounter value={bttsProb} suffix="%" /></span>
            </div>
          </div>

          {/* Pick Recommendation Capsule */}
          <div className="bg-[#121824] border border-sky-500/20 rounded-lg p-2.5 mb-3">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[9.5px] font-mono font-bold text-sky-400 uppercase tracking-wide flex items-center space-x-1">
                <Zap className="w-2.5 h-2.5 fill-sky-400" />
                <span>{isBankerMode || confidenceScore >= 80 ? 'Pick Banquero IA' : 'Pronóstico IA'}</span>
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

            {/* Justificación por IA de por qué es el seguro (tendencias de goles y datos de temporada) */}
            <div className="mt-2 pt-2 border-t border-white/10 flex items-start space-x-1.5 text-[10px] text-emerald-300/90 font-mono leading-snug">
              <Sparkles className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
              <p className="line-clamp-2">
                <strong className="text-emerald-400 font-sans">Base del cálculo: </strong>
                {isBankerMode
                  ? (bankerPick?.rationale || match.aiPick?.summaryRationale || 'Sin datos suficientes para justificar una selección.')
                  : (match.aiPick?.summaryRationale || bankerPick?.rationale || 'Sin datos suficientes para justificar una selección.')}
              </p>
            </div>
          </div>

        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
          {match.status === 'FINISHED' ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                sounds.playClick();
                onOpenModal(match);
              }}
              className="py-2 px-2 bg-slate-800/80 hover:bg-slate-700 active:scale-95 text-slate-300 border border-white/5 rounded-lg text-xs font-medium transition flex items-center justify-center space-x-1 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Finalizado</span>
            </button>
          ) : (
            <button
              disabled={!parlayCandidates.length}
              onClick={(e) => {
                e.stopPropagation();
                sounds.playAddParlay();
                const topOpportunity = parlayCandidates[0];
                onAddToParlay(topOpportunity);
              }}
              className={`py-2 px-2 rounded-lg text-xs font-medium transition flex items-center justify-center space-x-1 ${
                parlayCandidates.length
                  ? 'bg-emerald-600/20 hover:bg-emerald-600/30 active:scale-95 text-emerald-300 border border-emerald-500/40 cursor-pointer shadow-[0_0_10px_rgba(16,185,129,0.15)]'
                  : 'bg-slate-800/40 text-slate-500 border border-white/5 cursor-not-allowed opacity-60'
              }`}
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{parlayCandidates.length ? '+ Al Parlay' : 'Sin cuota'}</span>
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              sounds.playClick();
              onOpenModal(match);
            }}
            className="py-2 px-2 bg-sky-400 hover:bg-sky-300 active:scale-95 text-black rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1 cursor-pointer shadow-[0_0_10px_rgba(56,189,248,0.3)]"
          >
            <Eye className="w-3.5 h-3.5 shrink-0" />
            <span>Detalle</span>
          </button>
        </div>
      </div>

      {/* VIP Locked Overlay */}
      {isLocked && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-4 text-center bg-[#090d16]/88 backdrop-blur-[3px] border border-amber-500/35 rounded-xl shadow-2xl">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/25 to-amber-600/10 border border-amber-500/40 flex items-center justify-center mb-2 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
            <Lock className="w-5 h-5 text-amber-400" />
          </div>

          <div className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-mono font-bold mb-1.5">
            <Crown className="w-3 h-3 text-amber-400" />
            <span>SOLO ACCESO VIP • PICK #{bankerRank}</span>
          </div>

          <h5 className="text-xs sm:text-sm font-bold text-white font-sans mb-1">
            Pick Banquero Exclusivo
          </h5>
          <p className="text-[10px] text-slate-300 max-w-[210px] mb-3 leading-tight font-sans">
            Desbloquea este pick y el TOP 10 completo de máxima seguridad con tu Pase VIP.
          </p>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              sounds.playClick();
              onUnlockVip?.();
            }}
            className="px-3.5 py-1.5 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold font-mono text-[11px] rounded-lg shadow-[0_0_15px_rgba(245,158,11,0.35)] transition transform hover:scale-[1.03] cursor-pointer flex items-center space-x-1"
          >
            <Sparkles className="w-3 h-3 text-slate-950" />
            <span>Desbloquear con VIP</span>
          </button>
        </div>
      )}

    </TiltCard>
  );
}
