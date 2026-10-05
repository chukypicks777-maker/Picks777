import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Search, ArrowUpRight, Clock, MapPin } from 'lucide-react';
import { SPORTS } from '../constants/sports.js';
import { SPORT_LEAGUES } from '../constants/leagues.js';
import LeagueSelector from './LeagueSelector';
import SportMatchAnalysis, { MarketValue, WinnerBar } from './SportMatchAnalysis';
import TeamForm from './TeamForm';
import useSportsFeed from '../hooks/useSportsFeed.js';
import { readSportDetail, saveSportDetail, sportMatchVersion, requestSports } from '../utils/sportsClient.js';
import { formatMatchSchedule } from '../utils/matchSchedule.js';
import { TelegramIcon, WhatsAppIcon, InstagramIcon } from './SocialIcons';
import { useSocialLinks, getSocialLink } from '../utils/socialSettings';

const statuses = { LIVE: 'En vivo', FINISHED: 'Finalizado', SCHEDULED: 'Programado', POSTPONED: 'Pospuesto', CANCELLED: 'Cancelado', SUSPENDED: 'Suspendido', DELAYED: 'Demorado', UNKNOWN: 'Sin confirmar' };
const day = value => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));

export default function SportsPage({ sport, enabled, sessionKey = '', oddsFormat = 'decimal', onSessionExpired }) {
  const activeSport = SPORTS.find(item => item.id === sport);
  const socialLinks = useSocialLinks();
  const leagues = useMemo(() => [{ id: 'all', name: sport === 'tenis' ? 'Todos los torneos' : 'Todas las Ligas', flag: '🌍' }, ...SPORT_LEAGUES[sport]], [sport]);
  const [league, setLeague] = useState('all'), [filter, setFilter] = useState('all'), [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null), [revision, setRevision] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false), [detailError, setDetailError] = useState('');
  const { feed, pending, patchMatch } = useSportsFeed({ sport, enabled, sessionKey, revision, onSessionExpired });
  const loading = pending.length > 0;
  const feedRef = useRef(feed), expiredRef = useRef(onSessionExpired), cardGridRef = useRef(null);
  const detailController = useRef(null), detailRequests = useRef(new Map());
  useEffect(() => { feedRef.current = feed; expiredRef.current = onSessionExpired; }, [feed, onSessionExpired]);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    window.addEventListener('picks-refresh-sports', reload);
    return () => window.removeEventListener('picks-refresh-sports', reload);
  }, [reload]);

  useEffect(() => {
    const controller = new AbortController();
    detailController.current = controller;
    detailRequests.current = new Map();
    return () => controller.abort();
  }, [sport, enabled, sessionKey, revision]);

  const fetchDetail = useCallback(async original => {
    const controller = detailController.current;
    if (!enabled || !original || !controller || controller.signal.aborted) return null;
    const cached = readSportDetail(sessionKey, sport, original);
    if (cached) { patchMatch(original, cached); return cached; }
    const key = sportMatchVersion(original), requests = detailRequests.current;
    if (requests.has(key)) return requests.get(key);
    const task = (async () => {
      const { response, result } = await requestSports(`/api/sports/${sport}/${encodeURIComponent(original.id)}?league=${original.leagueId}`, { signal: controller.signal });
      if (controller.signal.aborted) return null;
      if (response.status === 401 || response.status === 403 && result.trialExpired) { expiredRef.current?.(result); return null; }
      if (!response.ok || !result.success || result.match?.id !== original.id) throw new Error(result.message || 'No se pudo actualizar el análisis.');
      saveSportDetail(sessionKey, sport, original, result.match);
      patchMatch(original, result.match);
      return result.match;
    })();
    requests.set(key, task);
    try { return await task; } finally { requests.delete(key); }
  }, [sport, enabled, sessionKey, patchMatch]);

  useEffect(() => {
    if (!selected || !enabled) return;
    let active = true;
    let busy = false;
    const load = async () => {
      if (busy) return;
      busy = true;
      setDetailLoading(true); setDetailError('');
      try {
        await fetchDetail(feedRef.current.matches.find(match => match.id === selected));
      } catch (cause) { if (active && !detailController.current?.signal.aborted) setDetailError(cause.message || 'No se pudo consultar el historial.'); }
      finally { busy = false; if (active) setDetailLoading(false); }
    };
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, 60000);
    return () => { active = false; clearInterval(timer); };
  }, [selected, enabled, fetchDetail, revision]);

  const counts = Object.fromEntries(leagues.map(item => [item.id, item.id === 'all' ? feed.matches.length : feed.matches.filter(match => match.leagueId === item.id).length]));
  const now = new Date(), tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const matches = feed.matches.filter(match => (league === 'all' || match.leagueId === league)
    && (filter === 'all' || (['LIVE', 'FINISHED'].includes(filter) ? match.status === filter : day(match.kickoff) === day(filter === 'today' ? now : tomorrow)))
    && (!search.trim() || `${match.homeTeam.name} ${match.awayTeam.name} ${match.tournamentName || ''}`.toLowerCase().includes(search.trim().toLowerCase())));
  const coverage = feed.coverage.filter(item => league === 'all' || item.leagueId === league);
  const missing = coverage.filter(item => item.status === 'unavailable' || item.status === 'degraded');
  const error = !loading && feed.coverage.length > 0 && feed.coverage.every(item => item.status === 'unavailable') ? feed.coverage.find(item => item.error)?.error || 'No se pudo consultar el calendario. Revisa la conexión y reintenta.' : '';
  const selectedMatch = feed.matches.find(match => match.id === selected);
  const cardVersions = matches.map(match => `${sportMatchVersion(match)}:${Boolean(match.detailLoadedAt)}`).join('|');

  useEffect(() => {
    if (!enabled) return;
    let active = true, running = 0;
    const queue = [], seen = new Set();
    const candidates = feedRef.current.matches;
    const pump = () => {
      while (active && running < 2 && queue.length) {
        const match = queue.shift();
        running++;
        fetchDetail(match).catch(() => {}).finally(() => { running--; pump(); });
      }
    };
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const id = entry.target.dataset.matchId;
        if (!entry.isIntersecting || seen.has(id)) continue;
        seen.add(id);
        const match = candidates.find(item => item.id === id);
        if (match && (sport !== 'beisbol' || match.leagueId === 'mlb')) queue.push(match);
      }
      pump();
    }, { rootMargin: '150px' });
    cardGridRef.current?.querySelectorAll('[data-match-id]').forEach(card => observer.observe(card));
    return () => { active = false; observer.disconnect(); };
  }, [cardVersions, enabled, sport, fetchDetail, revision]);

  return <section role="tabpanel" id={`sport-panel-${sport}`} aria-labelledby={`sport-${sport}`} className="space-y-5 pb-6">
    <header className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0 space-y-3"><h1 className="text-xl sm:text-2xl font-bold">{activeSport.icon} {activeSport.name}</h1>
        <nav aria-label="Comunidades de Picks777" className="flex flex-wrap gap-2">
          {[["telegram", "Telegram", TelegramIcon, 'text-sky-300'], ["whatsapp", "WhatsApp", WhatsAppIcon, 'text-emerald-300'], ["instagram", "Instagram", InstagramIcon, 'text-pink-300']].map(([id, label, Icon, color]) => <a key={id} href={getSocialLink(socialLinks, id).url} target="_blank" rel="noopener noreferrer" className={`inline-flex gap-1.5 items-center min-h-11 px-2.5 rounded-xl border border-white/10 bg-[#111a28] text-[11px] font-semibold hover:bg-white/5 ${color}`}><Icon className="w-3.5 h-3.5" />{label}</a>)}
        </nav>
      </div>
      <button type="button" onClick={reload} disabled={loading || !enabled} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl border border-white/10 bg-[#111a28] text-slate-400 hover:text-white disabled:opacity-40 cursor-pointer shrink-0" aria-label="Actualizar encuentros"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
    </header>
    <LeagueSelector leagues={leagues} selectedLeague={league} onSelectLeague={setLeague} matchCounts={counts} />
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="flex gap-1 overflow-x-auto no-scrollbar rounded-xl border border-white/10 bg-[#121620] p-1" aria-label="Filtrar encuentros">
        {[['all', 'Todos'], ['today', 'Hoy'], ['tomorrow', 'Mañana'], ['LIVE', 'En vivo'], ['FINISHED', 'Resultados']].map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`px-3 min-h-10 rounded-lg text-xs font-semibold shrink-0 cursor-pointer ${filter === value ? 'bg-white text-slate-950' : 'text-slate-400 hover:text-white'}`}>{label}</button>)}
      </div>
      <label className="relative flex-1"><span className="sr-only">Buscar {sport === 'tenis' ? 'jugador o torneo' : 'equipo'}</span><Search className="absolute left-3 top-3 text-slate-500" size={16} /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={sport === 'tenis' ? 'Buscar jugador o torneo…' : 'Buscar equipo…'} className="w-full min-h-11 pl-9 pr-3 rounded-xl border border-white/10 bg-[#121620] text-sm" /></label>
    </div>
    {missing.length > 0 && !error && <p role="status" className="text-xs text-amber-300 bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">Cobertura limitada: {missing.map(item => item.name).join(', ')}. Algunos calendarios o datos no están disponibles. <button type="button" onClick={reload} className="underline cursor-pointer">Reintentar</button></p>}
    {error && <div role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">{error} <button type="button" onClick={reload} className="underline ml-2 cursor-pointer">Reintentar</button></div>}
    {loading && <p role="status" className="flex gap-2 items-center text-xs text-sky-300"><RefreshCw size={13} className="animate-spin shrink-0" />Consultando encuentros y estadísticas{sport === 'tenis' ? '…' : ` · ${pending.map(id => SPORT_LEAGUES[sport].find(league => league.id === id)?.name).join(', ')}`}</p>}
    {!matches.length ? (!loading && <div role="status" className="py-16 px-4 text-center rounded-2xl border border-white/10 bg-[#0d121c]"><p className="font-semibold">Sin encuentros disponibles para este filtro</p><p className="text-xs text-slate-500 mt-2">Los partidos aparecerán cuando la competición tenga un calendario publicado.</p></div>) : <div ref={cardGridRef} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {matches.map(match => <article key={match.id} data-match-id={match.id} className="relative min-w-0 rounded-2xl border border-sky-500/20 bg-gradient-to-b from-[#101725] to-[#0b101a] p-4 sm:p-5 space-y-4 cursor-pointer hover:border-sky-500/50 focus-within:ring-2 focus-within:ring-sky-400 transition-colors" aria-label={`${match.homeTeam.name} vs ${match.awayTeam.name}`}>
        <div className="flex justify-between items-center gap-2 text-[11px]"><span className="text-slate-400">{match.leagueFlag} {match.leagueName}</span><span className={`rounded-full px-2 py-1 shrink-0 ${match.status === 'LIVE' ? 'bg-rose-500/15 text-rose-300' : 'bg-white/5 text-slate-400'}`}>{statuses[match.status] || match.status}</span></div>
        {match.tournamentName && <p className="text-[11px] text-slate-500 truncate">{match.tournamentName}{match.round ? ` · ${match.round}` : ''}</p>}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {[match.homeTeam, match.awayTeam].map((team, index) => <React.Fragment key={team.id}>{index === 1 && <span className="text-xs font-mono text-slate-600">VS</span>}<div className="min-w-0 text-center space-y-2">{team.logo ? <img src={team.logo} alt="" className="w-12 h-12 object-contain mx-auto" loading="lazy" /> : <span aria-hidden="true" className="block text-3xl">{activeSport.icon}</span>}<p className="text-sm font-semibold break-words leading-snug">{team.name}</p>{['beisbol', 'basquetbol'].includes(sport) && <TeamForm team={team.name} records={match.analysis?.form?.[index === 0 ? 'home' : 'away']} loading={sport === 'basquetbol' && !match.detailLoadedAt} />}</div></React.Fragment>)}
        </div>
        <div className="flex justify-center items-center gap-1.5 rounded-lg border border-sky-500/20 bg-sky-500/10 px-2 py-2 text-[11px] text-sky-300"><Clock size={13} className="shrink-0" /><time dateTime={match.kickoff} title={`Hora local · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`}>{formatMatchSchedule(match.kickoff, { timeTBD: match.timeTBD })}</time></div>
        {match.venue && <p className="flex justify-center items-center gap-1 text-[10px] text-slate-500"><MapPin size={12} className="shrink-0" /><span className="truncate">{match.venue}</span></p>}
        {match.liveSupported === false && <p className="text-center text-[10px] text-amber-300">Calendario oficial · Sin marcador en vivo verificado</p>}
        {['LIVE', 'FINISHED'].includes(match.status) && <p className="text-center font-mono text-sm text-slate-300">{match.liveScore?.home ?? 'N/D'} – {match.liveScore?.away ?? 'N/D'}{sport === 'tenis' ? ' sets' : sport === 'beisbol' ? ' carreras' : ' puntos'}</p>}
        <div className="rounded-xl bg-[#111a28] p-3 space-y-3"><p className="text-[10px] uppercase tracking-wide text-slate-500">Ganador · Probabilidad previa y momio</p>{[['home', match.homeTeam], ...(match.allowsDraw ? [['draw', { shortName: 'Empate' }]] : []), ['away', match.awayTeam]].map(([side, team]) => <div key={side} className="flex justify-between items-center text-sm gap-2"><span className="min-w-0 break-words text-slate-300">{team.shortName || team.name}</span><MarketValue value={match.analysis?.winner?.[side]} publishedOdds={match.odds?.[side === 'draw' ? 'draw' : `${side}Win`]} oddsFormat={oddsFormat} /></div>)}<WinnerBar values={match.analysis?.winner} />{match.oddsProvider && <p className="text-[10px] text-slate-500">Momios publicados · {match.oddsProvider}</p>}</div>
        <button type="button" onClick={() => setSelected(match.id)} className="flex justify-center items-center gap-2 min-h-11 w-full rounded-xl bg-sky-500/10 border border-sky-500/25 text-sky-300 font-semibold text-xs cursor-pointer hover:bg-sky-500/20"><span aria-hidden="true" className="absolute inset-0 rounded-2xl" />Ver análisis y mercados<ArrowUpRight size={15} /></button>
      </article>)}
    </div>}
    <p className="text-[11px] text-slate-500 leading-relaxed">Momio teórico: calculado desde la probabilidad; no es una oferta de la casa. N/D indica falta de datos. Precisión predictiva sin validar. Horarios en tu zona local y consulta automática cada minuto; el proveedor puede publicar con retraso.{sport === 'beisbol' && ' NPB y KBO no tienen marcador en vivo verificado.'}</p>
    {selectedMatch && <SportMatchAnalysis match={selectedMatch} oddsFormat={oddsFormat} loading={detailLoading} error={detailError} onClose={() => { setSelected(null); setDetailError(''); setDetailLoading(false); }} />}
  </section>;
}
