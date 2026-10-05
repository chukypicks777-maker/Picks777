import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, ArrowUpRight } from 'lucide-react';
import { SPORTS } from '../constants/sports.js';
import { SPORT_LEAGUES } from '../constants/leagues.js';
import LeagueSelector from './LeagueSelector';
import SportMatchAnalysis, { Probability } from './SportMatchAnalysis';

const summaries = {
  beisbol: 'Ganador, carreras por equipo, primer inning y total de innings 1 a 5.',
  tenis: 'Ganador del partido, primer y segundo set, y al menos un set por jugador.',
  basquetbol: 'Ganador y hándicaps positivos y negativos para ambos equipos.'
};
const statuses = { LIVE: 'En vivo', FINISHED: 'Finalizado', SCHEDULED: 'Programado', POSTPONED: 'Pospuesto', CANCELLED: 'Cancelado', SUSPENDED: 'Suspendido', DELAYED: 'Demorado', UNKNOWN: 'Sin confirmar' };
const day = value => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));

export default function SportsPage({ sport, enabled, onSessionExpired }) {
  const activeSport = SPORTS.find(item => item.id === sport);
  const leagues = useMemo(() => [{ id: 'all', name: sport === 'tenis' ? 'Todos los torneos' : 'Todas las Ligas', flag: '🌍' }, ...SPORT_LEAGUES[sport]], [sport]);
  const [league, setLeague] = useState('all'), [filter, setFilter] = useState('all'), [search, setSearch] = useState('');
  const [feed, setFeed] = useState({ matches: [], coverage: [] }), [loading, setLoading] = useState(enabled), [error, setError] = useState('');
  const [selected, setSelected] = useState(null), [revision, setRevision] = useState(0);
  const [detail, setDetail] = useState(null), [detailLoading, setDetailLoading] = useState(false), [detailError, setDetailError] = useState('');
  const reload = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let controller;
    let active = true;
    const load = async (initial = false) => {
      controller?.abort();
      controller = new AbortController();
      const request = controller;
      if (initial) setLoading(true);
      try {
        const response = await fetch(`/api/sports/${sport}`, { credentials: 'same-origin', signal: request.signal, cache: 'no-store' });
        const result = await response.json();
        if (!active || request.signal.aborted) return;
        if (response.status === 401 || (response.status === 403 && result.trialExpired)) { onSessionExpired?.(result); return; }
        setFeed({ matches: Array.isArray(result.matches) ? result.matches : [], coverage: result.coverage || [] });
        setError(response.ok && result.success ? '' : result.message || 'No se pudo consultar el calendario.');
      } catch {
        if (active && !request.signal.aborted) { setFeed({ matches: [], coverage: [] }); setDetail(null); setError('No se pudo actualizar el calendario. Revisa tu conexión y reintenta.'); }
      } finally { if (active && !request.signal.aborted) setLoading(false); }
    };
    load(true);
    const timer = setInterval(() => { if (!document.hidden) load(); }, 60000);
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { active = false; controller?.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [sport, enabled, revision, onSessionExpired]);

  useEffect(() => {
    if (!selected || !enabled) return;
    let controller;
    let active = true;
    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      const request = controller;
      setDetailLoading(true); setDetailError('');
      try {
        const response = await fetch(`/api/sports/${sport}/${encodeURIComponent(selected)}`, { credentials: 'same-origin', signal: request.signal, cache: 'no-store' });
        const result = await response.json();
        if (!active || request.signal.aborted) return;
        if (response.status === 401 || (response.status === 403 && result.trialExpired)) { onSessionExpired?.(result); return; }
        if (!response.ok || !result.success || !result.match) throw new Error(result.message || 'No se pudo actualizar el análisis.');
        setDetail(result.match);
        setFeed(previous => ({ ...previous, matches: previous.matches.map(match => match.id === result.match.id ? result.match : match) }));
      } catch (cause) { if (active && !request.signal.aborted) { setDetail(null); setDetailError(cause.message || 'No se pudo consultar el historial.'); } }
      finally { if (active && !request.signal.aborted) setDetailLoading(false); }
    };
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, 60000);
    return () => { active = false; controller?.abort(); clearInterval(timer); };
  }, [selected, sport, enabled, revision, onSessionExpired]);

  const counts = Object.fromEntries(leagues.map(item => [item.id, item.id === 'all' ? feed.matches.length : feed.matches.filter(match => match.leagueId === item.id).length]));
  const now = new Date(), tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const matches = feed.matches.filter(match => (league === 'all' || match.leagueId === league)
    && (filter === 'all' || (['LIVE', 'FINISHED'].includes(filter) ? match.status === filter : day(match.kickoff) === day(filter === 'today' ? now : tomorrow)))
    && (!search.trim() || `${match.homeTeam.name} ${match.awayTeam.name} ${match.tournamentName || ''}`.toLowerCase().includes(search.trim().toLowerCase())));
  const coverage = feed.coverage.filter(item => league === 'all' || item.leagueId === league);
  const missing = coverage.filter(item => item.status === 'unavailable' || item.status === 'degraded');
  const currentMatch = feed.matches.find(match => match.id === selected);
  const selectedMatch = currentMatch ? (detail?.id === selected && detail.status === currentMatch.status && detail.kickoff === currentMatch.kickoff
    ? { ...detail, ...currentMatch, analysis: detail.analysis } : currentMatch) : null;

  return <section role="tabpanel" id={`sport-panel-${sport}`} aria-labelledby={`sport-${sport}`} className="space-y-5 pb-6">
    <header className="flex items-start justify-between gap-4 py-2">
      <div><h1 className="text-xl sm:text-2xl font-bold">{activeSport.icon} {activeSport.name}</h1><p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-2xl leading-relaxed">{summaries[sport]}</p></div>
      <button type="button" onClick={reload} disabled={loading || !enabled} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl border border-white/10 bg-[#111a28] text-slate-400 hover:text-white disabled:opacity-40 cursor-pointer shrink-0" aria-label="Actualizar encuentros"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
    </header>
    <LeagueSelector leagues={leagues} selectedLeague={league} onSelectLeague={setLeague} matchCounts={counts} />
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="flex gap-1 overflow-x-auto no-scrollbar rounded-xl border border-white/10 bg-[#121620] p-1" aria-label="Filtrar encuentros">
        {[['all', 'Todos'], ['today', 'Hoy'], ['tomorrow', 'Mañana'], ['LIVE', 'En vivo'], ['FINISHED', 'Resultados']].map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`px-3 min-h-10 rounded-lg text-xs font-semibold shrink-0 cursor-pointer ${filter === value ? 'bg-white text-slate-950' : 'text-slate-400 hover:text-white'}`}>{label}</button>)}
      </div>
      <label className="relative flex-1"><span className="sr-only">Buscar {sport === 'tenis' ? 'jugador o torneo' : 'equipo'}</span><Search className="absolute left-3 top-3 text-slate-500" size={16} /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={sport === 'tenis' ? 'Buscar jugador o torneo…' : 'Buscar equipo…'} className="w-full min-h-11 pl-9 pr-3 rounded-xl border border-white/10 bg-[#121620] text-sm" /></label>
    </div>
    {missing.length > 0 && <p role="status" className="text-xs text-amber-300 bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">Cobertura limitada: {missing.map(item => item.name).join(', ')}. Algunos calendarios o datos no están disponibles.</p>}
    {error && <div role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">{error} <button type="button" onClick={reload} className="underline ml-2 cursor-pointer">Reintentar</button></div>}
    {loading ? <div role="status" className="py-16 text-center text-slate-400 text-sm">Consultando encuentros y estadísticas…</div> : !matches.length ? <div role="status" className="py-16 px-4 text-center rounded-2xl border border-white/10 bg-[#0d121c]"><p className="font-semibold">Sin encuentros disponibles para este filtro</p><p className="text-xs text-slate-500 mt-2">Los partidos aparecerán cuando la competición tenga un calendario publicado.</p></div> : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {matches.map(match => <article key={match.id} className="min-w-0 rounded-2xl border border-white/10 bg-[#0d121c] p-4 sm:p-5 space-y-4" aria-label={`${match.homeTeam.name} vs ${match.awayTeam.name}`}>
        <div className="flex justify-between items-center gap-2 text-[11px]"><span className="text-slate-400">{match.leagueFlag} {match.leagueName}</span><span className={`rounded-full px-2 py-1 shrink-0 ${match.status === 'LIVE' ? 'bg-rose-500/15 text-rose-300' : 'bg-white/5 text-slate-400'}`}>{statuses[match.status] || match.status}</span></div>
        {match.tournamentName && <p className="text-[11px] text-slate-500 truncate">{match.tournamentName}{match.round ? ` · ${match.round}` : ''}</p>}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {[match.homeTeam, match.awayTeam].map((team, index) => <React.Fragment key={team.id}>{index === 1 && <span className="text-xs font-mono text-slate-600">VS</span>}<div className="min-w-0 text-center space-y-2">{team.logo ? <img src={team.logo} alt="" className="w-10 h-10 object-contain mx-auto" loading="lazy" /> : <span aria-hidden="true" className="block text-2xl">{activeSport.icon}</span>}<p className="text-sm font-semibold break-words leading-snug">{team.name}</p></div></React.Fragment>)}
        </div>
        <p className="text-center text-[11px] text-slate-500">{new Date(match.kickoff).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })}{!match.timeTBD && ` · ${new Date(match.kickoff).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`}</p>
        {match.liveSupported === false && <p className="text-center text-[10px] text-amber-300">Calendario oficial · Sin marcador en vivo verificado</p>}
        {['LIVE', 'FINISHED'].includes(match.status) && <p className="text-center font-mono text-sm text-slate-300">{match.liveScore?.home ?? 'N/D'} – {match.liveScore?.away ?? 'N/D'}{sport === 'tenis' ? ' sets' : sport === 'beisbol' ? ' carreras' : ' puntos'}</p>}
        <div className="rounded-xl bg-[#111a28] p-3 space-y-2"><p className="text-[10px] uppercase tracking-wide text-slate-500">Ganador · Probabilidad previa</p><div className="flex justify-between text-sm gap-2"><span className="truncate text-slate-300">{match.homeTeam.shortName}</span><Probability value={match.analysis?.winner?.home} /></div>{match.allowsDraw && <div className="flex justify-between text-sm"><span className="text-slate-400">Empate</span><Probability value={match.analysis?.winner?.draw} /></div>}<div className="flex justify-between text-sm gap-2"><span className="truncate text-slate-300">{match.awayTeam.shortName}</span><Probability value={match.analysis?.winner?.away} /></div></div>
        <button type="button" onClick={() => setSelected(match.id)} className="flex justify-center items-center gap-2 min-h-11 w-full rounded-xl bg-sky-500/10 border border-sky-500/25 text-sky-300 font-semibold text-xs cursor-pointer hover:bg-sky-500/20">Ver análisis y mercados<ArrowUpRight size={15} /></button>
      </article>)}
    </div>}
    <p className="text-[11px] text-slate-500 leading-relaxed">Los porcentajes son estimaciones sin una tasa de aciertos validada. N/D indica falta de datos. Consulta automática cada minuto; el proveedor puede publicar con retraso. NPB y KBO muestran calendarios y resultados publicados, sin marcador en vivo verificado.</p>
    {selectedMatch && <SportMatchAnalysis match={selectedMatch} loading={detailLoading} error={detailError} onClose={() => { setSelected(null); setDetail(null); setDetailError(''); setDetailLoading(false); }} />}
  </section>;
}
