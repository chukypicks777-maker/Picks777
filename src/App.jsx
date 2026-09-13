import { Component, useCallback, useEffect, useState } from 'react';
import { Activity, RefreshCw, Search } from 'lucide-react';
import AuthGateModal from './components/AuthGateModal';
import Navbar from './components/Navbar';
import LeagueSelector from './components/LeagueSelector';
import MatchCard from './components/MatchCard';
import MatchDetailModal from './components/MatchDetailModal';
import LiveTicker from './components/LiveTicker';
import StatsCenterModal from './components/StatsCenterModal';
import AdminDashboardModal from './components/AdminDashboardModal';
import ParlayBuilderDrawer from './components/ParlayPanel';
import { api } from './utils/api';
import { ClockContext } from './utils/clock';

class ErrorBoundary extends Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="metric max-w-md w-full p-6 text-center space-y-4">
            <h3 className="font-bold text-lg text-rose-300">Aviso del sistema</h3>
            <p className="text-xs text-slate-300">
              {this.state.error?.message || 'Error temporal al abrir el partido. Intenta de nuevo.'}
            </p>
            <button
              className="primary text-xs mx-auto py-2 px-4"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                this.props.onReset?.();
              }}
            >
              Cerrar y continuar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const saved = (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
export default function App() {
  const [auth, setAuth] = useState(null);
  const [checking, setChecking] = useState(true);
  const [currency, setCurrency] = useState(() => saved('deportepicks_curr', 'USD'));
  const [oddsFormat, setOddsFormat] = useState(() => saved('deportepicks_odds', 'decimal'));
  const [league, setLeague] = useState('all');
  const [timeframe, setTimeframe] = useState('today');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [feed, setFeed] = useState({ matches: [], coverage: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(null);
  const [legs, setLegs] = useState([]);
  const [toast, setToast] = useState('');
  const [now, setNow] = useState(Date.now);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const clearSession = useCallback(() => { setAuth(null); setSelected(null); setModal(null); setLegs([]); setFeed({ matches: [], coverage: [] }); }, []);
  useEffect(() => {
    const controller = new AbortController();
    api('/api/auth/check-session', { method: 'POST', body: '{}', signal: controller.signal })
      .then(data => { if (data.valid) setAuth(data); })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    window.addEventListener('picks-session-expired', clearSession);
    return () => { controller.abort(); window.removeEventListener('picks-session-expired', clearSession); };
  }, [clearSession]);
  useEffect(() => {
    try { localStorage.setItem('deportepicks_curr', currency); localStorage.setItem('deportepicks_odds', oddsFormat); localStorage.removeItem('deportepicks_auth'); } catch { /* Preferences are optional. */ }
  }, [currency, oddsFormat]);
  useEffect(() => {
    if (!auth) return;
    const controller = new AbortController();
    let busy = false;
    async function load() {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const params = new URLSearchParams({ league, timeframe, status, timezone });
        const data = await api(`/api/matches?${params}`, { signal: controller.signal });
        setFeed(data); setError('');
      } catch (e) {
        if (!controller.signal.aborted) { setError(e.message); setFeed({ matches: [], coverage: [] }); }
      } finally { busy = false; if (!controller.signal.aborted) setLoading(false); }
    }
    load();
    const timer = setInterval(load, 60000);
    document.addEventListener('visibilitychange', load);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', load); };
  }, [auth, league, timeframe, status, timezone, refresh]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 5000); return () => clearTimeout(timer); }, [toast]);
  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); clearSession(); }
    catch (e) { setToast(e.message); }
  }
  function addLeg(leg) {
    if (legs.some(l => l.matchId === leg.matchId)) return setToast('Solo una selección por partido: los mercados del mismo evento son dependientes.');
    if (legs.length >= 20 || !Number.isFinite(leg.odds) || leg.odds <= 1) return setToast('Cuota no disponible para esta selección.');
    setLegs(previous => [...previous, leg]); setModal('parlay'); setSelected(null);
  }
  async function daily() {
    try {
      const data = await api('/api/parlays/daily-ai');
      if (!data.bankerParlay) return data.message;
      setLegs(data.bankerParlay.legs); setModal('parlay');
      return 'Selecciones cargadas. Revisa las cuotas antes de apostar.';
    } catch (e) { return e.message; }
  }
  if (checking) return <main className="min-h-screen grid place-items-center" role="status">Comprobando sesión…</main>;
  if (!auth) return <AuthGateModal onAuthenticated={setAuth} />;
  const matches = feed.matches.filter(m => `${m.homeTeam.name} ${m.awayTeam.name}`.toLowerCase().includes(search.toLowerCase()));
  const allLive = feed.liveMatches || feed.matches.filter(m => m.status === 'LIVE');
  const liveCount = allLive.length;
  const counts = Object.fromEntries(feed.coverage.map(c => [c.leagueId, c.count]));
  counts.total = feed.coverage.reduce((sum, c) => sum + c.count, 0);
  const unavailable = feed.coverage.filter(c => c.status === 'unavailable');
  return <ClockContext.Provider value={now}><div className="min-h-screen flex flex-col">
    <a href="#partidos" className="skip-link">Saltar a partidos</a>
    <Navbar auth={auth} currency={currency} setCurrency={setCurrency} oddsFormat={oddsFormat} setOddsFormat={setOddsFormat} onLogout={logout} onOpenAdmin={() => setModal('admin')} onOpenStats={() => setModal('stats')} onOpenParlay={() => setModal('parlay')} parlayCount={legs.length} />
    <LiveTicker matches={allLive} onSelectMatch={setSelected} />
    <main id="partidos" className="max-w-7xl w-full mx-auto px-4 sm:px-7 py-8 flex-1">
      <section className="relative overflow-hidden rounded-3xl border border-sky-500/20 bg-gradient-to-br from-sky-950/60 via-[#0c1420] to-[#080d15] p-7 sm:p-10 mb-7 shadow-2xl">
        <div className="flex items-center gap-2 text-sky-400 font-mono text-xs font-bold uppercase tracking-widest mb-3">
          <Activity size={15} /> 8 Ligas Oficiales · Inteligencia Predictiva con IA
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight max-w-3xl leading-tight text-white">
          Terminal Institucional de Apuestas.<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-teal-300 to-emerald-400">
            Datos y Análisis 100% Reales.
          </span>
        </h1>
        <p className="text-slate-400 mt-4 max-w-2xl leading-relaxed text-sm">
          Partidos en vivo, estadísticas oficiales de ESPN, modelo Poisson, expected goals (xG) y análisis táctico generado por IA en tiempo real.
        </p>
        <div className="flex flex-wrap gap-3.5 mt-7 text-xs font-medium">
          <span className="metric px-3.5 py-2 bg-white/5 border border-white/10 rounded-xl text-sky-200">
            {matches.length} partidos en esta vista
          </span>
          <span className="metric px-3.5 py-2 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
            {liveCount} en vivo en directo
          </span>
          <span className="metric px-3.5 py-2 bg-white/5 border border-white/10 rounded-xl text-slate-300">
            Zona horaria: {timezone}
          </span>
        </div>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3"><p className="text-xs text-slate-400">Fuente oficial: ESPN API · Sincronización continua cada 60 s.</p><button className="control text-xs" disabled={loading} onClick={() => setRefresh(v => v + 1)}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />{loading ? 'Consultando…' : 'Actualizar Datos'}</button></div>
      {unavailable.length > 0 && <p className="notice mb-3">Sin cobertura disponible ahora: {unavailable.map(c => c.name).join(', ')}. No se sustituyen con ejemplos.</p>}
      <LeagueSelector selectedLeague={league} onSelectLeague={setLeague} matchCounts={counts} />
      <div className="flex flex-wrap gap-3 items-end my-5"><label className="text-xs text-slate-400">Fecha<select className="field mt-1" value={timeframe} onChange={e => setTimeframe(e.target.value)}><option value="today">Hoy</option><option value="tomorrow">Mañana</option><option value="all">Ayer y próximos 7 días</option></select></label><label className="text-xs text-slate-400">Estado<select className="field mt-1" value={status} onChange={e => setStatus(e.target.value)}><option value="all">Todos los estados</option><option value="LIVE">En vivo</option><option value="SCHEDULED">Programados</option><option value="FINISHED">Finalizados</option><option value="POSTPONED">Pospuestos</option></select></label><label className="text-xs text-slate-400 flex-1 min-w-48">Buscar equipo<div className="relative mt-1"><input className="field pr-10" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre del equipo" /><Search className="absolute right-3 top-3" size={16} /></div></label></div>
      {error && <p className="notice-error mb-5" role="alert">{error} <button className="underline" onClick={() => setRefresh(v => v + 1)}>Reintentar</button></p>}
      {loading && !feed.matches.length ? <div role="status" className="grid md:grid-cols-3 gap-5">{[1, 2, 3].map(i => <div key={i} className="metric h-80 animate-pulse">Consultando partidos…</div>)}</div> : matches.length ? <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">{matches.map(m => <MatchCard key={m.id} match={m} oddsFormat={oddsFormat} onOpenModal={setSelected} onAddToParlay={addLeg} />)}</div> : !error && <section className="metric text-center py-16"><h2 className="text-xl font-semibold">No hay partidos para estos filtros</h2><p className="text-slate-400 mt-3">Prueba otra fecha o liga. La ausencia de encuentros no se rellena con datos ficticios.</p></section>}
      <p className="text-xs text-slate-500 leading-relaxed mt-8">{feed.notice} Las probabilidades son estimaciones experimentales, no precisión histórica. La moneda solo cambia la unidad del simulador; no convierte divisas.</p>
    </main>
    <footer className="border-t border-white/10 p-6 text-center text-xs text-slate-500">DEPORTEPICKS · Solo +18 · No aceptamos apuestas ni pagos. Puedes perder todo lo apostado. Juega con responsabilidad.</footer>
    <ErrorBoundary onReset={() => setSelected(null)}>
      {selected && <MatchDetailModal key={selected.id} match={selected} onClose={() => setSelected(null)} onAddToParlay={addLeg} oddsFormat={oddsFormat} />}
    </ErrorBoundary>
    {modal === 'stats' && <StatsCenterModal onClose={() => setModal(null)} />}
    {modal === 'admin' && auth.isAdmin && <AdminDashboardModal onClose={() => setModal(null)} />}
    {modal === 'parlay' && <ParlayBuilderDrawer isOpen onClose={() => setModal(null)} legs={legs} onRemoveLeg={index => setLegs(previous => previous.filter((_, i) => i !== index))} onClearAll={() => setLegs([])} onLoadDailyBanker={daily} currency={currency} oddsFormat={oddsFormat} />}
    {toast && <p role="status" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[100] rounded-xl bg-slate-800 border border-white/20 px-5 py-3 shadow-xl max-w-lg w-[90%] text-sm">{toast}</p>}
  </div></ClockContext.Provider>;
}
