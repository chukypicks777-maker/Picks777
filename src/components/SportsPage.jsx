import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Search, Crown } from 'lucide-react';
import { SPORTS } from '../constants/sports.js';
import { SPORT_LEAGUES } from '../constants/leagues.js';
import LeagueSelector from './LeagueSelector';
import SportMatchAnalysis from './SportMatchAnalysis';
import SportMatchCard from './SportMatchCard';
import AutonomousAiBar from './AutonomousAiBar';
import useSportsFeed from '../hooks/useSportsFeed.js';
import useSportsHydration from '../hooks/useSportsHydration.js';
import { readSportDetail, saveSportDetail, sportMatchVersion, requestSports, mergeSportDetail } from '../utils/sportsClient.js';
import { computeMatchFingerprint } from '../utils/analysisCache.js';
import { TelegramIcon, WhatsAppIcon, InstagramIcon } from './SocialIcons';
import { useSocialLinks, getSocialLink } from '../utils/socialSettings';

const dayFormatter = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
const day = value => dayFormatter.format(new Date(value));
const emptyMatches = [];

export default function SportsPage({ sport, enabled, sessionKey = '', oddsFormat = 'decimal', currency = 'USD', isOwner = false, activeModelInfo = null, onToast, onSessionExpired }) {
  const activeSport = SPORTS.find(item => item.id === sport);
  const socialLinks = useSocialLinks();
  const leagues = useMemo(() => [{ id: 'all', name: sport === 'tenis' ? 'Todos los torneos' : 'Todas las Ligas', flag: '🌍' }, ...SPORT_LEAGUES[sport]], [sport]);
  const [league, setLeague] = useState('all'), [filter, setFilter] = useState('all'), [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null), [revision, setRevision] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false), [detailError, setDetailError] = useState('');
  const [category, setCategory] = useState('all'), [bankerFeed, setBankerFeed] = useState(null), [bankerLoading, setBankerLoading] = useState(false), [bankerError, setBankerError] = useState('');
  const [manualAiId, setManualAiId] = useState(null), [queueAiId, setQueueAiId] = useState(null), [aiError, setAiError] = useState('');
  const [modalAiLoading, setModalAiLoading] = useState(false);
  const modalAiAttempts = useRef(new Set()), aiJobRef = useRef(null);
  useEffect(() => { aiJobRef.current = manualAiId || queueAiId; }, [manualAiId, queueAiId]);
  const manualAiRequest = useRef(null);
  const { feed, pending, patchMatch, patchMatches } = useSportsFeed({ sport, enabled, sessionKey, revision, onSessionExpired });
  const hydration = useSportsHydration({ sport, enabled, sessionKey, revision, matches: feed.matches, patchMatches, onSessionExpired });
  const loading = pending.length > 0;
  const feedRef = useRef(feed), expiredRef = useRef(onSessionExpired), displayMatchesRef = useRef(emptyMatches);
  const detailController = useRef(null), detailRequests = useRef(new Map());
  useEffect(() => { feedRef.current = feed; expiredRef.current = onSessionExpired; }, [feed, onSessionExpired]);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  const rankingScope = `${sport}:${league}:${filter}:${search}`;
  const applyDetail = useCallback((original, detail) => {
    patchMatch(original, detail);
    setBankerFeed(previous => previous ? { ...previous, matches: previous.matches.map(current => current.id === original.id ? mergeSportDetail(current, original, detail) : current) } : previous);
  }, [patchMatch]);
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

  useEffect(() => () => { manualAiRequest.current?.abort(); }, [sport, enabled, sessionKey, isOwner]);

  const handleAiAnalyzed = useCallback((id, detail, report, original) => {
    if (!original) return;
    applyDetail(original, saveSportDetail(sessionKey, sport, original, detail));
  }, [sessionKey, sport, applyDetail]);

  const retryAi = useCallback(async match => {
    if (!isOwner || !enabled || manualAiRequest.current || aiJobRef.current) return;
    const controller = new AbortController(); manualAiRequest.current = controller;
    setManualAiId(match.id); setAiError('');
    try {
      const { response, result } = await requestSports(`/api/sports/${sport}/${encodeURIComponent(match.id)}/ai-analysis?league=${match.leagueId}`, {
        method: 'POST', body: { forceRefresh: true }, signal: controller.signal, timeoutMs: 55000
      });
      if (controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403 && result.trialExpired) { expiredRef.current?.(result); return; }
      if (!response.ok || !result.success || result.match?.id !== match.id || !result.report) throw new Error(result.message || 'No se pudo consultar la IA.');
      const detail = result.match;
      handleAiAnalyzed(match.id, detail, result.report, match);
      if (!result.report.aiAvailable) setAiError(result.report.aiStatus || 'La IA no devolvió un informe verificable.');
      onToast?.(result.report.aiAvailable ? 'Informe de IA verificado y actualizado.' : 'Se conserva el cálculo estadístico; la IA no devolvió un informe verificable.');
    } catch (error) { if (!controller.signal.aborted) setAiError(error.message); }
    finally { if (manualAiRequest.current === controller) { manualAiRequest.current = null; setManualAiId(null); } }
  }, [sport, isOwner, enabled, handleAiAnalyzed, onToast]);

  useEffect(() => {
    if (!enabled || category !== 'bankers') return;
    const controller = new AbortController(); let active = true, busy = false, initialized = false;
    const load = async () => {
      await Promise.resolve();
      if (!active || busy) return;
      if (!initialized) { initialized = true; setBankerFeed(null); setBankerError(''); }
      busy = true; setBankerLoading(true);
      const params = new URLSearchParams({ category: 'bankers', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
      if (league !== 'all') params.set('league', league);
      if (['LIVE', 'FINISHED'].includes(filter)) params.set('status', filter);
      if (['today', 'tomorrow'].includes(filter)) params.set('timeframe', filter);
      if (search.trim()) params.set('search', search.trim());
      try {
        const { response, result } = await requestSports(`/api/sports/${sport}?${params}`, { signal: controller.signal, timeoutMs: 55000 });
        if (!active) return;
        if (response.status === 401 || response.status === 403 && result.trialExpired) { expiredRef.current?.(result); return; }
        if (!response.ok || !result.success || !Array.isArray(result.matches)) throw new Error(result.message || 'No se pudo calcular Banqueros.');
        setBankerFeed({ ...result, rankingScope }); setBankerError('');
      } catch (error) { if (active) { setBankerFeed(null); setBankerError(error.message); } }
      finally { busy = false; if (active) setBankerLoading(false); }
    };
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, 60000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, [sport, enabled, category, league, filter, search, revision, rankingScope]);

  const fetchDetail = useCallback(async original => {
    const controller = detailController.current;
    if (!enabled || !original || !controller || controller.signal.aborted) return null;
    const cached = readSportDetail(sessionKey, sport, original);
    if (cached) { applyDetail(original, cached); return cached; }
    const key = sportMatchVersion(original), requests = detailRequests.current;
    if (requests.has(key)) return requests.get(key);
    const task = (async () => {
      const { response, result } = await requestSports(`/api/sports/${sport}/${encodeURIComponent(original.id)}?league=${original.leagueId}`, { signal: controller.signal });
      if (controller.signal.aborted) return null;
      if (response.status === 401 || response.status === 403 && result.trialExpired) { expiredRef.current?.(result); return null; }
      if (!response.ok || !result.success || result.match?.id !== original.id) throw new Error(result.message || 'No se pudo actualizar el análisis.');
      const saved = saveSportDetail(sessionKey, sport, original, result.match);
      applyDetail(original, saved);
      return saved;
    })();
    requests.set(key, task);
    try { return await task; } finally { requests.delete(key); }
  }, [sport, enabled, sessionKey, applyDetail]);

  useEffect(() => {
    if (!selected || !enabled) return;
    let active = true;
    let busy = false;
    const modalController = new AbortController();
    const scopeController = detailController.current;
    const abortModal = () => modalController.abort();
    scopeController?.signal.addEventListener('abort', abortModal, { once: true });
    const load = async () => {
      if (busy) return;
      busy = true;
      let attemptedFingerprint;
      setDetailLoading(true); setDetailError('');
      try {
        const detail = await fetchDetail(displayMatchesRef.current.find(match => match.id === selected) || feedRef.current.matches.find(match => match.id === selected));
        if (active) setDetailLoading(false);
        if (!active || !detail || detail.aiReport || aiJobRef.current) return;
        const fingerprint = computeMatchFingerprint(detail);
        if (modalAiAttempts.current.has(fingerprint)) return;
        modalAiAttempts.current.add(fingerprint);
        attemptedFingerprint = fingerprint;
        setModalAiLoading(true);
        const { response, result } = await requestSports(`/api/sports/${sport}/${encodeURIComponent(detail.id)}/ai-analysis?league=${detail.leagueId}`, {
          method: 'POST', body: { forceRefresh: false }, signal: modalController.signal, timeoutMs: 55000
        });
        if (!active || modalController.signal.aborted) return;
        if (response.status === 401 || response.status === 403 && result.trialExpired) { expiredRef.current?.(result); return; }
        if (!response.ok) throw new Error(result.message || 'No se pudo consultar el informe de IA.');
        if (result.success && result.report && result.match?.id === detail.id) {
          handleAiAnalyzed(detail.id, result.match, result.report, detail);
        }
      } catch (cause) {
        if (attemptedFingerprint) modalAiAttempts.current.delete(attemptedFingerprint);
        if (active && !modalController.signal.aborted) setDetailError(cause.message || 'No se pudo consultar el historial.');
      }
      finally { busy = false; if (active) { setDetailLoading(false); setModalAiLoading(false); } }
    };
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, 60000);
    return () => { active = false; modalController.abort(); scopeController?.signal.removeEventListener('abort', abortModal); clearInterval(timer); };
  }, [selected, enabled, fetchDetail, revision, sport, handleAiAnalyzed]);

  const counts = useMemo(() => {
    const result = Object.fromEntries(leagues.map(item => [item.id, 0]));
    for (const match of feed.matches) { result.all++; result[match.leagueId] = (result[match.leagueId] || 0) + 1; }
    return result;
  }, [leagues, feed.matches]);
  const now = new Date(), tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const todayKey = day(now), tomorrowKey = day(tomorrow);
  const filteredMatches = useMemo(() => feed.matches.filter(match => (league === 'all' || match.leagueId === league)
    && (filter === 'all' || (['LIVE', 'FINISHED'].includes(filter) ? match.status === filter : day(match.kickoff) === (filter === 'today' ? todayKey : tomorrowKey)))
    && (!search.trim() || `${match.homeTeam.name} ${match.awayTeam.name} ${match.tournamentName || ''}`.toLowerCase().includes(search.trim().toLowerCase()))), [feed.matches, league, filter, search, todayKey, tomorrowKey]);
  const matches = category === 'bankers' ? bankerFeed?.rankingScope === rankingScope ? bankerFeed.matches : emptyMatches : filteredMatches;
  useEffect(() => { displayMatchesRef.current = matches; }, [matches]);
  const coverage = feed.coverage.filter(item => league === 'all' || item.leagueId === league);
  const missing = coverage.filter(item => item.status === 'unavailable' || item.status === 'degraded');
  const error = !loading && feed.coverage.length > 0 && feed.coverage.every(item => item.status === 'unavailable') ? feed.coverage.find(item => item.error)?.error || 'No se pudo consultar el calendario. Revisa la conexión y reintenta.' : '';
  const selectedMatch = bankerFeed?.matches.find(match => match.id === selected) || feed.matches.find(match => match.id === selected);

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
    <div className="flex items-center gap-2 font-mono text-xs overflow-x-auto no-scrollbar" aria-label="Categoría de pronósticos"><span className="text-slate-500 shrink-0">Categoría:</span>{[['all', 'Todos los Mercados'], ['bankers', 'Banqueros']].map(([value, name]) => <button key={value} type="button" aria-pressed={category === value} onClick={() => { setCategory(value); setSelected(null); }} className={`shrink-0 inline-flex gap-1.5 items-center min-h-11 px-3 rounded-lg border cursor-pointer transition-colors ${category === value ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-bold' : 'bg-[#121824] border-white/10 text-slate-400 hover:text-white'}`}>{value === 'bankers' && <Crown size={13} />}{name}</button>)}</div>
    {isOwner && enabled && matches.length > 0 && <AutonomousAiBar sport={sport} sessionKey={sessionKey} matches={matches} onMatchAnalyzed={handleAiAnalyzed} activeModelInfo={activeModelInfo} onToast={onToast} isOwner={isOwner} onAnalyzing={setQueueAiId} externalBusy={Boolean(manualAiId)} />}
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><h2 className="text-sm sm:text-base font-bold">{category === 'bankers' ? 'Top 10 Banqueros · Ganadores' : 'Partidos & Pronósticos Cuantitativos'}</h2><span className="text-[10px] font-mono text-emerald-400 border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 rounded-full">{matches.length} encuentros</span></div><p className="text-[10px] font-mono text-slate-500">Formato: <strong className="text-slate-300">{oddsFormat === 'american' ? 'AMERICANO' : oddsFormat === 'fractional' ? 'FRACCIONARIO' : 'DECIMAL'}</strong> · Moneda: <strong className="text-slate-300">{currency}</strong></p></div>
    {category === 'bankers' && <p className="text-[11px] text-slate-400">Ganadores próximos de mayor a menor probabilidad estimada. Solo se incluyen encuentros con datos suficientes; hasta 10 selecciones.{bankerFeed?.ranking && ` ${bankerFeed.ranking.examined} encuentros revisados, ${bankerFeed.ranking.available} con ganador estimable.`}</p>}
    {missing.length > 0 && !error && <p role="status" className="text-xs text-amber-300 bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">Cobertura limitada: {missing.map(item => item.name).join(', ')}. Algunos calendarios o datos no están disponibles. <button type="button" onClick={reload} className="underline cursor-pointer">Reintentar</button></p>}
    {error && <div role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">{error} <button type="button" onClick={reload} className="underline ml-2 cursor-pointer">Reintentar</button></div>}
    {bankerError && category === 'bankers' && <div role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">{bankerError} <button type="button" onClick={reload} className="underline ml-2 cursor-pointer">Reintentar</button></div>}
    {aiError && isOwner && <p role="alert" className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-300">{aiError}</p>}
    {loading && <p role="status" className="flex gap-2 items-center text-xs text-sky-300"><RefreshCw size={13} className="animate-spin shrink-0" />Consultando encuentros y estadísticas{sport === 'tenis' ? '…' : ` · ${pending.map(id => SPORT_LEAGUES[sport].find(league => league.id === id)?.name).join(', ')}`}</p>}
    {bankerLoading && category === 'bankers' && <p role="status" className="flex gap-2 items-center text-xs text-sky-300"><RefreshCw size={13} className="animate-spin" />Calculando el Top 10 con los registros de todos los encuentros próximos…</p>}
    {hydration.pending > 0 && <p role="status" className="text-[11px] text-sky-300">Consultando estadísticas en segundo plano · {hydration.pending} pendientes</p>}
    {hydration.failed > 0 && <p role="status" className="text-xs text-amber-300">No se pudo completar el historial de {hydration.failed} encuentros. <button type="button" onClick={reload} className="underline cursor-pointer">Reintentar estadísticas</button></p>}
    {!matches.length ? (!(category === 'bankers' ? bankerLoading : loading) && <div role="status" className="py-16 px-4 text-center rounded-2xl border border-white/10 bg-[#0d121c]"><p className="font-semibold">Sin encuentros disponibles para este filtro</p><p className="text-xs text-slate-500 mt-2">{category === 'bankers' ? 'No hay ganadores próximos con datos suficientes en esta selección.' : 'Los partidos aparecerán cuando la competición tenga un calendario publicado.'}</p></div>) : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {matches.map(match => <SportMatchCard key={match.id} match={match} oddsFormat={oddsFormat} onOpen={setSelected} isOwner={isOwner} onRetryAi={retryAi} analyzing={manualAiId === match.id || queueAiId === match.id} aiBusy={Boolean(manualAiId || queueAiId)} bankerRank={category === 'bankers' ? match.bankerRank : null} />)}
    </div>}
    <p className="text-[11px] text-slate-500 leading-relaxed">Momio teórico: calculado desde la probabilidad; no es una oferta de la casa. N/D indica falta de datos. Precisión predictiva sin validar. Horarios en tu zona local y consulta automática cada minuto; el proveedor puede publicar con retraso.{sport === 'beisbol' && ' NPB y KBO no tienen marcador en vivo verificado.'}</p>
    {selectedMatch && <SportMatchAnalysis match={selectedMatch} oddsFormat={oddsFormat} loading={detailLoading} error={detailError} isOwner={isOwner} onRetryAi={() => retryAi(selectedMatch)} aiLoading={Boolean(manualAiId || queueAiId || modalAiLoading)} onClose={() => { setSelected(null); setDetailError(''); setDetailLoading(false); setModalAiLoading(false); }} />}
  </section>;
}
