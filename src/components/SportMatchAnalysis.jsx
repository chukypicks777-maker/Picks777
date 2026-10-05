import React from 'react';
import Modal from './Modal';

export function Probability({ value }) {
  const available = typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
  return <span className={`font-mono font-bold tabular-nums ${available ? 'text-emerald-300' : 'text-slate-500'}`}>{available ? `${Number(value.toFixed(1))}%` : 'N/D'}</span>;
}

function Outcomes({ title, values, home, away, draw = false }) {
  return <section className="rounded-xl border border-white/10 bg-[#111a28] p-4 space-y-3" aria-label={title}>
    <h3 className="text-sm font-bold text-white">{title}</h3>
    {[[home, values?.home], ...(draw ? [['Empate', values?.draw]] : []), [away, values?.away]].map(([name, value], index) => <div key={index} className="flex items-center justify-between gap-4 text-sm">
      <span className="min-w-0 break-words text-slate-300">{name}</span><Probability value={value} />
    </div>)}
  </section>;
}

function RunTable({ title, lines = [] }) {
  return <section className="rounded-xl border border-white/10 overflow-hidden bg-[#111a28]" aria-label={title}>
    <h3 className="p-4 text-sm font-bold border-b border-white/10">{title}</h3>
    <table className="w-full text-xs sm:text-sm">
      <thead className="text-slate-400 bg-white/[0.03]"><tr><th scope="col" className="p-3 text-left">Carreras</th><th scope="col" className="p-3 text-right">Más de</th><th scope="col" className="p-3 text-right">Menos de</th></tr></thead>
      <tbody className="divide-y divide-white/5">{lines.map(row => <tr key={row.line}><th scope="row" className="p-3 text-left font-mono font-semibold text-slate-300">{row.line}</th><td className="p-3 text-right"><Probability value={row.over} /></td><td className="p-3 text-right"><Probability value={row.under} /></td></tr>)}</tbody>
    </table>
  </section>;
}

function BinaryMarket({ title, values }) {
  return <section className="rounded-xl border border-white/10 bg-[#111a28] p-4 space-y-3" aria-label={title}>
    <h3 className="text-sm font-bold">{title}</h3>
    <div className="grid grid-cols-2 gap-3 text-sm"><div className="flex justify-between gap-2"><span className="text-slate-400">Sí</span><Probability value={values?.yes} /></div><div className="flex justify-between gap-2"><span className="text-slate-400">No</span><Probability value={values?.no} /></div></div>
  </section>;
}

function HandicapTable({ title, lines = [] }) {
  return <section className="rounded-xl border border-white/10 overflow-hidden bg-[#111a28]" aria-label={title}>
    <h3 className="p-4 text-sm font-bold border-b border-white/10 break-words">{title}</h3>
    <table className="w-full text-sm"><thead className="text-slate-400 bg-white/[0.03]"><tr><th scope="col" className="p-3 text-left">Hándicap</th><th scope="col" className="p-3 text-right">Probabilidad</th></tr></thead>
      <tbody className="divide-y divide-white/5">{lines.map(row => <tr key={row.line}><th scope="row" className="p-3 text-left font-mono font-semibold text-slate-300">{row.line > 0 ? '+' : ''}{row.line}</th><td className="p-3 text-right"><Probability value={row.probability} /></td></tr>)}</tbody>
    </table>
  </section>;
}

export default function SportMatchAnalysis({ match, onClose, loading = false, error = '' }) {
  const a = match.analysis || {};
  const home = match.homeTeam.name, away = match.awayTeam.name;
  return <Modal title="Análisis del encuentro" onClose={onClose}>
    <div className="space-y-5">
      <header className="space-y-2">
        <p className="text-xs text-slate-400">{match.leagueFlag} {match.leagueName}{match.tournamentName ? ` · ${match.tournamentName}` : ''}</p>
        <h2 className="text-lg sm:text-xl font-bold break-words">{home} <span className="text-slate-500 font-normal">vs</span> {away}</h2>
        <p className="text-xs text-sky-300">Probabilidades previas al partido</p>
      </header>
      {loading && <p role="status" className="text-xs text-sky-300">Consultando historial de ambos equipos…</p>}
      {error && <p role="alert" className="text-xs text-amber-300">{error}</p>}
      <Outcomes title="Ganador del encuentro" values={a.winner} home={home} away={away} draw={Boolean(match.allowsDraw)} />
      {a.notice && <p role="status" className="text-xs text-slate-400 leading-relaxed">{a.notice}</p>}

      {match.sport === 'beisbol' && <>
        <div className="grid sm:grid-cols-2 gap-3"><BinaryMarket title={`${home} anota al menos una carrera`} values={a.scoresRun?.home} /><BinaryMarket title={`${away} anota al menos una carrera`} values={a.scoresRun?.away} /></div>
        <p className="text-xs text-slate-400">Carreras por equipo · Partido completo, incluidos extra innings</p>
        <div className="grid sm:grid-cols-2 gap-3"><RunTable title={`Carreras · ${home}`} lines={a.teamRuns?.home} /><RunTable title={`Carreras · ${away}`} lines={a.teamRuns?.away} /></div>
        <Outcomes title="Primer inning · 1X2" values={a.firstInning} home={home} away={away} draw />
        <RunTable title="Innings 1 a 5 · Total de carreras de ambos equipos" lines={a.firstFive} />
        {a.inningSampleSize && <p className="text-xs text-slate-400">Registros por equipo · Primer inning: {a.inningSampleSize.first.home} / {a.inningSampleSize.first.away} · Innings 1 a 5: {a.inningSampleSize.five.home} / {a.inningSampleSize.five.away}. Sin 5 registros por equipo, el mercado indica N/D.</p>}
      </>}

      {match.sport === 'tenis' && <>
        <div className="grid sm:grid-cols-2 gap-3"><Outcomes title="Ganador del primer set" values={a.firstSet} home={home} away={away} /><Outcomes title="Ganador del segundo set" values={a.secondSet} home={home} away={away} /></div>
        <div className="grid sm:grid-cols-2 gap-3"><BinaryMarket title={`${home} gana al menos un set`} values={a.winsSet?.home} /><BinaryMarket title={`${away} gana al menos un set`} values={a.winsSet?.away} /></div>
        <p className="text-xs text-slate-400">Al mejor de {a.maxSets || match.maxSets || 3} sets · Primer y segundo set comparten estimación bajo el modelo.</p>
      </>}

      {match.sport === 'basquetbol' && <>
        <div className="rounded-xl bg-sky-500/5 border border-sky-500/20 p-3 text-xs text-sky-200 leading-relaxed">El hándicap positivo suma puntos al equipo; el negativo los resta. La probabilidad indica que el equipo gana después de aplicar ese ajuste.</div>
        <div className="grid sm:grid-cols-2 gap-3"><HandicapTable title={`Hándicap · ${home}`} lines={a.handicaps?.home} /><HandicapTable title={`Hándicap · ${away}`} lines={a.handicaps?.away} /></div>
      </>}

      <details className="rounded-xl bg-[#0b121e] border border-white/10 p-4 text-xs text-slate-400 space-y-3">
        <summary className="cursor-pointer text-slate-200 font-semibold">Datos y método de cálculo</summary>
        <p className="leading-relaxed">{a.method}</p>
        <p>Muestra: {home} {a.sampleSize?.home ?? 0} partidos · {away} {a.sampleSize?.away ?? 0} partidos.</p>
        {a.setSampleSize && <p>Sets observados: {home} {a.setSampleSize.home} · {away} {a.setSampleSize.away}.</p>}
        <p>Fuente: <a href={match.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline text-sky-300">{match.source}</a> · Consultado {match.fetchedAt ? new Date(match.fetchedAt).toLocaleString('es') : 'N/D'}.</p>
        <p>La hora de consulta no confirma cuándo actualizó el proveedor. Las probabilidades se calculan a partir de registros; su precisión predictiva todavía no está validada.</p>
      </details>
    </div>
  </Modal>;
}
