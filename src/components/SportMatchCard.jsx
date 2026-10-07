import React from 'react';
import { Clock, Eye, Sparkles, RotateCw, CheckCircle2, Zap, Trophy, Plus } from 'lucide-react';
import { formatMatchSchedule } from '../utils/matchSchedule.js';
import { sportWinnerPick, sportCardMarkets, sportParlayLeg } from '../utils/sportPicks.js';
import { formatOdds } from '../utils/oddsFormatter.js';
import { MarketValue, Probability, WinnerBar } from './SportMatchAnalysis';
import SportIdentity from './SportIdentity';
import TeamForm from './TeamForm';
import { useClock } from '../utils/clock';

const statuses = { LIVE: 'EN VIVO', FINISHED: 'FINALIZADO', SCHEDULED: 'PROGRAMADO', POSTPONED: 'POSPUESTO', CANCELLED: 'CANCELADO', SUSPENDED: 'SUSPENDIDO', UNKNOWN: 'SIN CONFIRMAR' };

function SportMatchCard({ match, oddsFormat, onOpen, onToggleParlay, isInParlay = false, analyzing = false, bankerRank = null }) {
  const now = useClock();
  const displayStatus = match.liveSupported === false && match.status === 'SCHEDULED' && Date.parse(match.kickoff) <= now ? 'UNKNOWN' : match.status;
  const a = match.analysis || {}, pick = sportWinnerPick(match), report = match.aiReport;
  const leg = sportParlayLeg(match);
  const aiVerified = report?.aiAvailable === true && report?.dataGrounded === true;
  return <article data-match-id={match.id} aria-label={`${match.homeTeam.name} vs ${match.awayTeam.name}`}
    style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 450px', ...(bankerRank === 1 ? { borderColor: 'rgba(251, 191, 36, 0.4)' } : {}) }}
    className={`relative terminal-card min-w-0 text-xs rounded-xl p-4 flex flex-col border hover:border-sky-500/40 focus-within:ring-1 focus-within:ring-sky-400/50 ${bankerRank === 1 ? 'border-amber-400/40' : 'border-white/10'}`}>
    <div className="flex items-center justify-between gap-2 text-[11px] mb-3 pb-2.5 border-b border-white/5">
      <span className="min-w-0 truncate text-slate-300 font-semibold">{match.leagueFlag} {match.leagueName}</span>
      <span className={`shrink-0 text-[10px] font-mono ${displayStatus === 'LIVE' ? 'text-rose-400' : displayStatus === 'FINISHED' ? 'text-emerald-400' : 'text-slate-400'}`}>{statuses[displayStatus] || displayStatus}</span>
    </div>
    {bankerRank && <div className="flex items-center justify-between mb-2 font-mono text-[10px] text-amber-300"><span className="inline-flex items-center gap-1 rounded border border-amber-400/25 bg-amber-400/10 px-2 py-1"><Trophy size={11} />#{bankerRank} BANQUERO</span><span>Ganador · Previa</span></div>}
    <p className="flex items-center justify-center gap-1.5 text-[11px] text-sky-300 mb-3"><Clock size={12} /><time dateTime={match.kickoff} title={`Hora local · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`}>{formatMatchSchedule(match.kickoff, { timeTBD: match.timeTBD })}</time></p>
    {match.tournamentName && <p className="text-[10px] text-slate-500 mb-2 truncate" title={match.tournamentName}>{match.tournamentName}{match.round ? ` · ${match.round}` : ''}</p>}
    {analyzing ? <p role="status" className="flex items-center gap-1.5 text-[10px] font-mono text-sky-300 bg-sky-500/10 border border-sky-500/25 rounded-lg px-2 py-1 mb-2"><RotateCw size={12} className="animate-spin" />CONSULTANDO IA…</p>
      : aiVerified ? <p className="flex items-center justify-between gap-2 text-[9px] font-mono text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-2 py-1 mb-2"><span className="inline-flex gap-1 items-center"><CheckCircle2 size={11} />HECHOS PRIORIZADOS POR IA</span><span className="truncate" title={report.modelUsed}>{report.modelUsed}</span></p>
      : <p className="text-[9px] font-mono text-slate-500 mb-2">CÁLCULO ESTADÍSTICO{report ? ' · IA SIN RESULTADO VERIFICADO' : ' · INFORME IA PENDIENTE'}</p>}
    <div className="space-y-2.5 mb-3">
      {['home', 'away'].map(side => { const team = match[`${side}Team`]; return <div key={side} className="flex items-center justify-between gap-2">
        <div className="flex gap-2 items-center min-w-0"><SportIdentity key={`${team.id}:${team.logo}`} team={team} /><div className="min-w-0"><p className="font-semibold text-xs text-white break-words leading-snug">{team.name}</p>
          {match.sport !== 'tenis' && <TeamForm team={team.name} records={a.form?.[side]} compact loading={match.sport === 'basquetbol' && !match.detailLoadedAt} />}</div></div>
        <MarketValue value={a.winner?.[side]} publishedOdds={match.allowsDraw && !(Number(match.odds?.draw) > 1) ? null : match.odds?.[`${side}Win`]} oddsFormat={oddsFormat} />
      </div>; })}
    </div>
    {match.allowsDraw && <div className="flex justify-between items-center mb-3 text-[11px] text-slate-400"><span>Empate</span><MarketValue value={a.winner?.draw} publishedOdds={match.odds?.draw} oddsFormat={oddsFormat} /></div>}
    <div className="mb-3"><WinnerBar values={a.winner} /></div>
    <p className="text-[9px] text-slate-400 mb-1">{a.probabilitySource === 'published-odds' ? 'Ganador · Mercado sin margen' : 'Ganador · Modelo sin calibración de aciertos'}</p>
    {match.allowsDraw && <p className="text-[9px] text-amber-300 mb-2">Tres resultados: local, empate y visita. No equivale a un moneyline de dos resultados.</p>}
    {['LIVE', 'FINISHED'].includes(match.status) && <p className="text-center text-xs font-mono text-slate-300 mb-3">{match.liveScore?.home ?? 'N/D'} – {match.liveScore?.away ?? 'N/D'}{match.sport === 'tenis' ? ' sets' : match.sport === 'beisbol' ? ' carreras' : ' puntos'}</p>}
    <div className="grid grid-cols-3 gap-1.5 mb-3">{sportCardMarkets(match).map(market => <div key={market.label} className="rounded bg-[#121824] border border-white/5 p-2 text-center min-w-0"><p className="text-[9px] text-slate-400 break-words leading-snug min-h-7 mb-1" title={market.label}>{market.label}</p><span className="text-[11px]"><Probability value={market.value} /></span></div>)}</div>
    <section aria-label="Pick ganador" className={`rounded-lg p-2.5 mb-3 border ${aiVerified ? 'bg-[#0f1924] border-emerald-500/35' : 'bg-[#121824] border-sky-500/20'}`}>
      <div className="flex items-center justify-between gap-2 text-[9px] font-mono mb-1"><span className="flex items-center gap-1 text-sky-400 font-bold"><Zap size={11} />{bankerRank ? 'PICK BANQUERO' : 'PRONÓSTICO GANADOR'}</span><span className="text-slate-400">{pick ? `${pick.probability}% estimado` : 'N/D'}</span></div>
      <p className="text-xs font-semibold break-words leading-snug">{pick?.selection || 'Sin datos suficientes para un ganador'}</p>
      {pick && <p className="font-mono text-[10px] text-emerald-400 mt-1">{pick.oddsKind === 'published' ? `Momio ${formatOdds(pick.odds, oddsFormat)} · Publicado` : 'Sin cuota de una casa · Precio del modelo en el análisis'}</p>}
      <div className="pt-2 mt-2 border-t border-white/10 flex items-start gap-1.5 text-[10px] text-slate-400"><Sparkles size={11} className="shrink-0 mt-0.5 text-sky-400" /><p className="line-clamp-2">{aiVerified ? report.tacticalKeypoints?.[0] || report.analysisSections?.verdict : pick ? `Base estadística: ${a.probabilitySource === 'published-odds' ? 'ganador implícito en cuotas publicadas, sin margen.' : `${a.sampleSize?.home ?? 0} / ${a.sampleSize?.away ?? 0} partidos previos. Probabilidad estimada del ganador.`}` : a.notice || 'Faltan registros o cuotas suficientes.'}</p></div>
    </section>
    {match.venue && <p className="text-[10px] text-slate-500 truncate mb-2" title={match.venue}>{match.venue}</p>}
    {match.oddsProvider && <p className="text-[9px] text-slate-500 mb-2">Momios publicados · {match.oddsProvider}</p>}
    {match.liveSupported === false && <p className="text-[9px] text-amber-300 mb-2">Calendario oficial · Sin marcador en vivo verificado</p>}
    <div className="mt-auto pt-2 border-t border-white/5 grid grid-cols-2 gap-2">
      <button type="button" aria-pressed={isInParlay} disabled={!leg || !onToggleParlay} title={leg ? `${isInParlay ? 'Quitar' : 'Agregar'} ${leg.selection} ${isInParlay ? 'del' : 'al'} parlay` : 'Se requiere un encuentro próximo con ganador y momio disponibles'} onClick={() => { const currentLeg = sportParlayLeg(match); if (currentLeg) onToggleParlay?.(currentLeg); }} className={`relative z-20 min-h-10 px-2 rounded-lg border text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${isInParlay ? 'border-emerald-400/60 bg-emerald-500/25 text-emerald-200 hover:bg-rose-500/20' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'}`}>{isInParlay ? <CheckCircle2 size={12} /> : <Plus size={12} />}{isInParlay ? 'En Parlay' : 'Al Parlay'}</button>
      <button type="button" onClick={() => onOpen(match.id)} className="min-h-10 px-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-[11px] font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"><span aria-hidden="true" className="absolute inset-0 z-10 rounded-xl" /><Eye size={13} />Ver análisis y mercados</button>
    </div>
  </article>;
}
export default React.memo(SportMatchCard);
