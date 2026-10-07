import React from 'react';
import Modal from './Modal';
import { Clock, Sparkles, RotateCw, CheckCircle2 } from 'lucide-react';
import { formatOdds, marketQuote } from '../utils/oddsFormatter.js';
import { formatMatchSchedule } from '../utils/matchSchedule.js';
import TeamForm from './TeamForm';
import SportIdentity from './SportIdentity';

export function Probability({ value }) {
  const available = typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
  return <span className={`font-mono font-bold tabular-nums ${available ? 'text-emerald-300' : 'text-slate-500'}`}>{available ? `${Number(value.toFixed(1))}%` : 'N/D'}</span>;
}

export function MarketValue({ value, publishedOdds, oddsFormat = 'decimal', showTheoretical = false }) {
  const quote = marketQuote(publishedOdds, showTheoretical ? value : null);
  return <span className="inline-flex flex-col items-end gap-0.5 shrink-0"><Probability value={value} /><span className="text-[10px] sm:text-[11px] text-sky-300 font-mono tabular-nums whitespace-nowrap">{quote.kind === 'unavailable' ? 'Sin cuota publicada' : `${quote.kind === 'theoretical' ? 'Precio del modelo' : 'Momio'} ${formatOdds(quote.odds, oddsFormat)}`}</span>{quote.kind !== 'unavailable' && <span className="text-[9px] text-slate-500">{quote.kind === 'theoretical' ? 'No ofrecido por una casa' : quote.label}</span>}</span>;
}

export function WinnerBar({ values }) {
  const entries = [['home', 'bg-sky-400'], ['draw', 'bg-slate-500'], ['away', 'bg-violet-400']];
  if (!entries.some(([side]) => typeof values?.[side] === 'number')) return null;
  return <div aria-hidden="true" className="h-1.5 w-full bg-slate-800 rounded-full flex overflow-hidden gap-0.5">{entries.map(([side, color]) => <span key={side} className={`${color} h-full`} style={{ width: `${values?.[side] || 0}%` }} />)}</div>;
}

function Outcomes({ title, values, home, away, draw = false, odds = {}, oddsFormat }) {
  return <section className="rounded-xl border border-white/10 bg-[#111a28] p-4 space-y-3" aria-label={title}>
    <h3 className="text-sm font-bold text-white">{title}</h3>
    {[[home, values?.home, odds.homeWin], ...(draw ? [['Empate', values?.draw, odds.draw]] : []), [away, values?.away, odds.awayWin]].map(([name, value, quote], index) => <div key={index} className="flex items-center justify-between gap-4 text-sm">
      <span className="min-w-0 break-words text-slate-300">{name}</span><MarketValue value={value} publishedOdds={draw && !(Number(odds.draw) > 1) ? null : quote} oddsFormat={oddsFormat} showTheoretical />
    </div>)}
    <WinnerBar values={values} />
  </section>;
}

function RunTable({ title, lines = [], oddsFormat }) {
  return <section className="rounded-xl border border-white/10 overflow-hidden bg-[#111a28]" aria-label={title}>
    <h3 className="p-4 text-sm font-bold border-b border-white/10">{title}</h3>
    <table className="w-full text-xs sm:text-sm">
      <thead className="text-slate-400 bg-white/[0.03]"><tr><th scope="col" className="p-3 text-left">Carreras</th><th scope="col" className="p-3 text-right">Over</th><th scope="col" className="p-3 text-right">Under</th></tr></thead>
      <tbody className="divide-y divide-white/5">{lines.map(row => <tr key={row.line}><th scope="row" className="p-3 text-left font-mono font-semibold text-slate-300">{row.line}</th><td className="p-3 text-right"><MarketValue value={row.over} oddsFormat={oddsFormat} /></td><td className="p-3 text-right"><MarketValue value={row.under} oddsFormat={oddsFormat} /></td></tr>)}</tbody>
    </table>
  </section>;
}

function BinaryMarket({ title, values, oddsFormat }) {
  return <section className="rounded-xl border border-white/10 bg-[#111a28] p-4 space-y-3" aria-label={title}>
    <h3 className="text-sm font-bold">{title}</h3>
    <div className="grid grid-cols-2 gap-3 text-sm"><div className="flex justify-between gap-2"><span className="text-slate-400">Sí</span><MarketValue value={values?.yes} oddsFormat={oddsFormat} /></div><div className="flex justify-between gap-2"><span className="text-slate-400">No</span><MarketValue value={values?.no} oddsFormat={oddsFormat} /></div></div>
  </section>;
}

function HandicapTable({ title, lines = [], oddsFormat }) {
  return <section className="rounded-xl border border-white/10 overflow-hidden bg-[#111a28]" aria-label={title}>
    <h3 className="p-4 text-sm font-bold border-b border-white/10 break-words">{title}</h3>
    <table className="w-full text-sm"><thead className="text-slate-400 bg-white/[0.03]"><tr><th scope="col" className="p-3 text-left">Hándicap</th><th scope="col" className="p-3 text-right">Probabilidad / Momio</th></tr></thead>
      <tbody className="divide-y divide-white/5">{lines.map(row => <tr key={row.line}><th scope="row" className="p-3 text-left font-mono font-semibold text-slate-300">{row.line > 0 ? '+' : ''}{row.line}</th><td className="p-3 text-right"><MarketValue value={row.probability} oddsFormat={oddsFormat} /></td></tr>)}</tbody>
    </table>
  </section>;
}

export default function SportMatchAnalysis({ match, onClose, loading = false, error = '', oddsFormat = 'decimal', isOwner = false, onRetryAi, aiLoading = false }) {
  const a = match.analysis || {};
  const home = match.homeTeam.name, away = match.awayTeam.name;
  return <Modal title="Análisis del encuentro" onClose={onClose}>
    <div className="space-y-5">
      <header className="space-y-2">
        <p className="text-xs text-slate-400">{match.leagueFlag} {match.leagueName}{match.tournamentName ? ` · ${match.tournamentName}` : ''}</p>
        <h2 className="text-lg sm:text-xl font-bold break-words">{home} <span className="text-slate-500 font-normal">vs</span> {away}</h2>
        <p className="flex gap-1.5 items-center text-xs text-sky-300"><Clock size={14} /><time dateTime={match.kickoff}>{formatMatchSchedule(match.kickoff, { timeTBD: match.timeTBD })}</time></p>
        {match.venue && <p className="text-xs text-slate-500">{match.venue}</p>}
        <p className="text-xs text-sky-300">Probabilidades previas al partido</p>
        <div className="grid grid-cols-2 gap-3 pt-2">{[match.homeTeam, match.awayTeam].map(team => <div key={team.id} className="flex items-center gap-2 min-w-0 rounded-xl border border-white/10 bg-[#111a28] p-3"><SportIdentity key={`${team.id}:${team.logo}`} team={team} size="large" /><span className="text-xs font-semibold break-words min-w-0">{team.name}</span></div>)}</div>
      </header>
      {loading && <p role="status" className="text-xs text-sky-300">Consultando historial de ambos equipos…</p>}
      {error && <p role="alert" className="text-xs text-amber-300">{error}</p>}
      <section aria-label="Informe con IA" className={`rounded-xl border p-4 space-y-3 ${match.aiReport?.aiAvailable && match.aiReport?.dataGrounded ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-sky-500/20 bg-[#111a28]'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-1.5 text-sm font-bold"><Sparkles size={15} className="text-sky-400" />Informe con IA</h3>{isOwner && <button type="button" onClick={onRetryAi} disabled={aiLoading} className="min-h-9 px-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-300 text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"><RotateCw size={12} className={aiLoading ? 'animate-spin' : ''} />Reintentar con IA</button>}</div>
        {aiLoading && <p role="status" className="text-xs text-sky-300">Consultando hechos y estimaciones con el proveedor de IA…</p>}
        {match.aiReport?.aiAvailable && match.aiReport?.dataGrounded ? <>
          <p className="flex gap-1.5 items-center text-xs text-emerald-300"><CheckCircle2 size={13} />Hechos priorizados por IA · {match.aiReport.modelUsed}</p>
          <ul className="space-y-2 text-xs leading-relaxed text-slate-300">{(match.aiReport.tacticalKeypoints || []).map((fact, index) => <li key={index}>{fact}</li>)}</ul>
          <p className="text-[10px] text-slate-500">Generado {new Date(match.aiReport.analyzedAt || match.aiReport.generatedAt).toLocaleString('es')}. Las probabilidades y momios se calculan con registros; la IA prioriza los hechos del informe.</p>
        </> : <p className="text-xs text-slate-400 leading-relaxed">{match.aiReport?.aiStatus || 'Cálculo estadístico disponible. Todavía no hay un informe de IA confirmado para este encuentro.'}</p>}
      </section>
      {['beisbol', 'basquetbol'].includes(match.sport) && <section aria-label="Cómo llegan los equipos" className="rounded-xl border border-white/10 bg-[#111a28] p-4 space-y-4">
        <h3 className="text-sm font-bold">Cómo llegan los equipos</h3>
        <div className="grid grid-cols-2 gap-3 text-center">{[['home', home], ['away', away]].map(([side, name]) => <div key={side} className="min-w-0 space-y-2"><p className="text-xs font-semibold break-words">{name}</p><TeamForm team={name} records={a.form?.[side]} loading={loading} /></div>)}</div>
        <p className="text-[10px] text-slate-500">W: victoria · L: derrota · D: empate. Orden: más antiguo a más reciente.</p>
        <details className="text-xs text-slate-400"><summary className="cursor-pointer text-sky-300 min-h-8">Ver los resultados recientes</summary><p className="py-2 text-[10px]">Últimos resultados anteriores al partido en esta competición.</p><div className="mt-2 space-y-4">{[['home', home], ['away', away]].map(([side, name]) => <div key={side}><p className="font-semibold text-slate-200 mb-2">{name}</p>{a.form?.[side]?.length ? [...a.form[side]].reverse().map(game => <div key={game.id} className="flex justify-between gap-2 py-2 border-b border-white/5"><span>{new Date(game.date).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}{game.opponent ? ` · ${game.opponent}` : ''}</span><a href={game.sourceUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 font-mono text-sky-300 underline">{game.own}–{game.against} ({game.result})</a></div>) : <p>N/D</p>}</div>)}</div></details>
      </section>}
      <Outcomes title="Ganador del encuentro" values={a.winner} home={home} away={away} draw={Boolean(match.allowsDraw)} odds={match.odds} oddsFormat={oddsFormat} />
      <p className="text-xs text-sky-300">{a.probabilitySource === 'published-odds' ? 'Ganador: probabilidad implícita del mercado, sin margen de la casa.' : 'Ganador: estimación histórica; faltan cuotas completas para contrastar el mercado.'}</p>
      <p className="text-[11px] text-slate-400 leading-relaxed">Publicado: cuota de la fuente{match.oddsProvider ? ` (${match.oddsProvider})` : ''}; confirma su vigencia en la casa. Teórico: 100 dividido por la probabilidad estimada, sin margen; no es un momio ofrecido por una casa.</p>
      {a.notice && <p role="status" className="text-xs text-slate-400 leading-relaxed">{a.notice}</p>}

      {match.sport === 'beisbol' && <>
        <p className="text-xs text-slate-400">Carreras por equipo · Partido completo, incluidos extra innings</p>
        <div className="grid sm:grid-cols-2 gap-3"><RunTable title={`Carreras · ${home}`} lines={a.teamRuns?.home} oddsFormat={oddsFormat} /><RunTable title={`Carreras · ${away}`} lines={a.teamRuns?.away} oddsFormat={oddsFormat} /></div>
        <RunTable title="Totales extra innings" lines={a.totalRuns} oddsFormat={oddsFormat} />
        <p className="text-xs text-slate-400">Carreras de ambos equipos durante el partido completo, incluidos extra innings; no son únicamente las carreras de las entradas extra.</p>
        <Outcomes title="Primer inning · 1X2" values={a.firstInning} home={home} away={away} draw oddsFormat={oddsFormat} />
        <RunTable title="Innings 1 a 5 · Total de carreras de ambos equipos" lines={a.firstFive} oddsFormat={oddsFormat} />
        {a.inningSampleSize && <p className="text-xs text-slate-400">Registros por equipo · Primer inning: {a.inningSampleSize.first.home} / {a.inningSampleSize.first.away} · Innings 1 a 5: {a.inningSampleSize.five.home} / {a.inningSampleSize.five.away}. Sin 5 registros por equipo, el mercado indica N/D.</p>}
      </>}

      {match.sport === 'tenis' && <>
        <div className="grid sm:grid-cols-2 gap-3"><Outcomes title="Ganador del primer set" values={a.firstSet} home={home} away={away} oddsFormat={oddsFormat} /><Outcomes title="Ganador del segundo set" values={a.secondSet} home={home} away={away} oddsFormat={oddsFormat} /></div>
        <div className="grid sm:grid-cols-2 gap-3"><BinaryMarket title={`${home} gana al menos un set`} values={a.winsSet?.home} oddsFormat={oddsFormat} /><BinaryMarket title={`${away} gana al menos un set`} values={a.winsSet?.away} oddsFormat={oddsFormat} /></div>
        <p className="text-xs text-slate-400">Al mejor de {a.maxSets || match.maxSets || 3} sets · Primer y segundo set comparten estimación bajo el modelo.</p>
      </>}

      {match.sport === 'basquetbol' && <>
        <div className="rounded-xl bg-sky-500/5 border border-sky-500/20 p-3 text-xs text-sky-200 leading-relaxed">El hándicap positivo suma puntos al equipo; el negativo los resta. La probabilidad indica que el equipo gana después de aplicar ese ajuste.</div>
        <div className="grid sm:grid-cols-2 gap-3"><HandicapTable title={`Hándicap · ${home}`} lines={a.handicaps?.home} oddsFormat={oddsFormat} /><HandicapTable title={`Hándicap · ${away}`} lines={a.handicaps?.away} oddsFormat={oddsFormat} /></div>
      </>}

      <details className="rounded-xl bg-[#0b121e] border border-white/10 p-4 text-xs text-slate-400 space-y-3">
        <summary className="cursor-pointer text-slate-200 font-semibold">Datos y método de cálculo</summary>
        <p className="leading-relaxed">{a.method}</p>
        <p>Muestra: {home} {a.sampleSize?.home ?? 0} partidos · {away} {a.sampleSize?.away ?? 0} partidos.</p>
        {a.setSampleSize && <p>Sets observados: {home} {a.setSampleSize.home} · {away} {a.setSampleSize.away}.</p>}
        <p>Fuente: <a href={match.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline text-sky-300">{match.source}</a> · Consultado {match.fetchedAt ? new Date(match.fetchedAt).toLocaleString('es') : 'N/D'}.</p>
        {match.oddsSourceUrl && <p>Fuente de momios: <a href={match.oddsSourceUrl} target="_blank" rel="noopener noreferrer" className="underline text-sky-300">{match.oddsSource}</a> · Consultado {match.oddsFetchedAt ? new Date(match.oddsFetchedAt).toLocaleString('es') : 'N/D'}.</p>}
        <p>La hora de consulta no confirma cuándo actualizó el proveedor. Las probabilidades se calculan a partir de registros; su precisión predictiva todavía no está validada.</p>
      </details>
      {match.sport === 'beisbol' && <details className="rounded-xl bg-[#111a28] border border-sky-500/25 text-xs text-slate-400 overflow-hidden">
        <summary className="cursor-pointer text-sky-300 font-semibold p-4 min-h-11">¿Habrá extra innings?</summary>
        <div className="p-3 pt-0 space-y-3">
          <BinaryMarket title="Probabilidad de extra innings" values={a.extraInnings} oddsFormat={oddsFormat} />
          <p className="leading-relaxed">Muestra verificada: {a.extraInningsSampleSize?.home ?? 0} partidos de {home} y {a.extraInningsSampleSize?.away ?? 0} de {away}; {a.extraInningsSampleSize?.uniqueGames ?? 0} encuentros distintos, {a.extraInningsSampleSize?.extraGames ?? 0} con extra innings. Sin al menos 5 registros por equipo y duración reglamentaria publicada, N/D.</p>
        </div>
      </details>}
    </div>
  </Modal>;
}
