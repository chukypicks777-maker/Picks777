import React, { useState, useEffect, useRef, useCallback } from 'react';
import Navbar from './components/Navbar';
import LiveTicker from './components/LiveTicker';
import AuthGateModal from './components/AuthGateModal';
import CommunityBanner from './components/CommunityBanner';
import LeagueSelector from './components/LeagueSelector';
import DateFilterTabs from './components/DateFilterTabs';
import HeroFeaturedMatch from './components/HeroFeaturedMatch';
import MatchCard from './components/MatchCard';
import MatchDetailModal from './components/MatchDetailModal';
import ParlayBuilderDrawer from './components/ParlayBuilderDrawer';
import AdminDashboardModal from './components/AdminDashboardModal';
import StatsCenterModal from './components/StatsCenterModal';
import FooterCommunityShowcase from './components/FooterCommunityShowcase';
import { sounds } from './utils/audioEffects';
import { Layers, Radio, Zap, AlertCircle } from 'lucide-react';

export default function App() {
  // Auth state
  const [auth, setAuth] = useState(() => {
    try {
      const saved = localStorage.getItem('deportepicks_auth');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Settings states
  const [currency, setCurrency] = useState(() => localStorage.getItem('deportepicks_curr') || 'USD');
  const [oddsFormat, setOddsFormat] = useState(() => localStorage.getItem('deportepicks_odds') || 'decimal');

  // Filters
  const [selectedLeague, setSelectedLeague] = useState('all');
  const [timeframe, setTimeframe] = useState('all');
  const [matchStatusFilter, setMatchStatusFilter] = useState('all'); // 'all' | 'LIVE' | 'FINISHED'
  const [searchQuery, setSearchQuery] = useState('');
  const [marketFilter, setMarketFilter] = useState('all');

  // Match Data & Modals
  const [matches, setMatches] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [matchError, setMatchError] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showParlayDrawer, setShowParlayDrawer] = useState(false);
  const [parlayLegs, setParlayLegs] = useState([]);
  const [toastMessage, setToastMessage] = useState('');

  // Auto-polling interval reference
  const pollingRef = useRef(null);

  // Check session on mount
  useEffect(() => {
    let active = true;
    async function verifySession() {
      try {
        const res = await fetch('/api/auth/check-session', {
          method: 'POST',
          credentials: 'same-origin'
        });
        const data = await res.json();
        if (!active) return;
        if (data.success && data.user) {
          setAuth(data);
          localStorage.setItem('deportepicks_auth', JSON.stringify(data));
          if (data.trialExpired) {
            setShowUpgradeModal(true);
          }
        } else if (!data.valid) {
          setAuth(null);
          localStorage.removeItem('deportepicks_auth');
        }
      } catch {}
    }
    verifySession();
    return () => { active = false; };
  }, []);

  // Global listeners for trial/session expiry events
  useEffect(() => {
    const handleTrialExpired = () => {
      setAuth(prev => ({ ...(prev || {}), valid: false, trialExpired: true }));
      setShowUpgradeModal(true);
    };
    const handleSessionExpired = () => {
      setAuth(null);
      localStorage.removeItem('deportepicks_auth');
    };

    window.addEventListener('picks-trial-expired', handleTrialExpired);
    window.addEventListener('picks-session-expired', handleSessionExpired);
    return () => {
      window.removeEventListener('picks-trial-expired', handleTrialExpired);
      window.removeEventListener('picks-session-expired', handleSessionExpired);
    };
  }, []);

  const fetchMatches = useCallback(async () => {
    try {
      setLoadingMatches(true);
      setMatchError('');
      const params = new URLSearchParams();
      if (selectedLeague !== 'all') params.append('league', selectedLeague);
      if (timeframe !== 'all') params.append('timeframe', timeframe);
      if (matchStatusFilter !== 'all') params.append('status', matchStatusFilter);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      params.append('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');

      const res = await fetch(`/api/matches?${params.toString()}`, {
        credentials: 'same-origin'
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 403 && errData.trialExpired) {
          setAuth(prev => ({ ...(prev || {}), valid: false, trialExpired: true }));
          setShowUpgradeModal(true);
        } else if (res.status === 401) {
          setAuth(null);
          localStorage.removeItem('deportepicks_auth');
        } else {
          setMatchError(errData.message || 'Error al consultar los partidos en el servidor.');
        }
        return;
      }

      const data = await res.json();
      if (data.success && Array.isArray(data.matches)) {
        setMatches(data.matches);
        setMatchError('');
      } else {
        setMatchError(data.message || 'No se pudieron procesar los partidos.');
      }
    } catch (err) {
      console.error('Error fetching matches:', err);
      setMatchError('Error de conexión al consultar el feed de partidos en vivo.');
    } finally {
      setLoadingMatches(false);
    }
  }, [selectedLeague, timeframe, matchStatusFilter, searchQuery]);

  const syncLiveMatchesSilent = useCallback(async () => {
    try {
      const res = await fetch('/api/matches/live-sync', {
        credentials: 'same-origin'
      });
      const data = await res.json();
      if (data.success && data.matches) {
        setMatches(prev => {
          return prev.map(m => {
            const updated = data.matches.find(u => u.id === m.id);
            return updated ? { ...m, ...updated } : m;
          });
        });
      }
    } catch {}
  }, []);

  // Persist currency & oddsFormat
  useEffect(() => {
    localStorage.setItem('deportepicks_curr', currency);
  }, [currency]);

  useEffect(() => {
    localStorage.setItem('deportepicks_odds', oddsFormat);
  }, [oddsFormat]);

  // Load matches on filter changes or when auth session becomes valid
  useEffect(() => {
    let active = true;
    if (auth?.valid && !auth?.trialExpired) {
      (async () => {
        if (active) {
          await fetchMatches();
        }
      })();
    }
    return () => {
      active = false;
    };
  }, [fetchMatches, auth?.valid, auth?.trialExpired, auth?.user?.id]);

  // Real-time live polling (every 25 seconds)
  useEffect(() => {
    pollingRef.current = setInterval(() => {
      syncLiveMatchesSilent();
    }, 25000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [syncLiveMatchesSilent]);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await fetchMatches();
      showToast('Feed de datos en vivo sincronizado.');
    } finally {
      setTimeout(() => setIsSyncing(false), 600);
    }
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleAuthenticated = (authData) => {
    setAuth(authData);
    localStorage.setItem('deportepicks_auth', JSON.stringify(authData));
    const name = authData.user?.name || authData.user?.username || (authData.isAdmin ? 'Administrador' : 'Usuario');
    if (authData.trialExpired) {
      showToast('⚠️ Tu período de prueba de 3 días ha vencido.');
      setShowUpgradeModal(true);
    } else {
      if (authData.isAdmin) {
        showToast('👑 Modo Administrador Owner Activado');
      } else if (authData.user?.hasCode || authData.role === 'vip_user') {
        showToast(`✅ ¡Bienvenido, ${name}! Membresía VIP Concedida`);
      } else {
        showToast(`🎉 ¡Bienvenido, ${name}! Tu prueba de 3 días está activa`);
      }
      setShowUpgradeModal(false);
      // Immediately load matches now that session is active!
      fetchMatches();
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch {}
    setAuth(null);
    localStorage.removeItem('deportepicks_auth');
    showToast('Sesión finalizada.');
  };

  const handleAddToParlay = (leg) => {
    const exists = parlayLegs.some(l => l.matchId === leg.matchId && l.selection === leg.selection);
    if (exists) {
      showToast('Esta selección ya está en tu Parlay.');
      return;
    }
    const updated = [...parlayLegs, leg];
    setParlayLegs(updated);
    setShowParlayDrawer(true);
    showToast(`Añadido: ${leg.selection}`);
  };

  const handleRemoveParlayLeg = (index) => {
    const updated = parlayLegs.filter((_, i) => i !== index);
    setParlayLegs(updated);
  };

  const handleLoadDailyBanker = async () => {
    try {
      const res = await fetch('/api/parlays/daily-ai', { credentials: 'same-origin' });
      const data = await res.json();
      if (data.success && data.bankerParlay) {
        setParlayLegs(data.bankerParlay.legs || []);
        setShowParlayDrawer(true);
        showToast('Parlay Banquero IA del Día cargado.');
      }
    } catch {}
  };

  // Filter by market if active
  const filteredMatches = matches.filter(m => {
    if (marketFilter === 'safe') return (m.probabilities?.confidence || 0) >= 85;
    if (marketFilter === 'btts') return (m.probabilities?.bttsYes || 0) >= 60;
    if (marketFilter === 'over') return (m.probabilities?.over25 || 0) >= 60;
    if (marketFilter === 'corners') return (m.probabilities?.cornerOver95 || 0) >= 60;
    return true;
  });

  const liveMatchesCount = matches.filter(m => m.status === 'LIVE').length;
  const featuredMatch = matches.find(m => m.isFeatured && m.status !== 'FINISHED') || matches[0];

  const leagueMatchCounts = {
    total: matches.length,
    inglaterra: matches.filter(m => m.leagueId === 'inglaterra').length,
    espana: matches.filter(m => m.leagueId === 'espana').length,
    mexico: matches.filter(m => m.leagueId === 'mexico').length,
    mls: matches.filter(m => m.leagueId === 'mls').length,
    italia: matches.filter(m => m.leagueId === 'italia').length,
    francia: matches.filter(m => m.leagueId === 'francia').length,
    champions: matches.filter(m => m.leagueId === 'champions').length,
    leagues_cup: matches.filter(m => m.leagueId === 'leagues_cup').length,
  };

  return (
    <div className="min-h-screen bg-[#080b11] text-slate-100 flex flex-col font-sans">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-4 z-50 bg-[#111827] border border-white/10 text-slate-200 px-4 py-2.5 rounded-xl shadow-xl font-mono text-xs flex items-center space-x-2">
          <Zap className="w-3.5 h-3.5 text-sky-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Access Gate Modal */}
      {(!auth || !auth.valid || auth.trialExpired || showUpgradeModal) && (
        <AuthGateModal
          auth={auth}
          onAuthenticated={(data) => {
            handleAuthenticated(data);
            if (data.valid && !data.trialExpired) {
              setShowUpgradeModal(false);
            }
          }}
          onClose={(auth?.valid && !auth?.trialExpired) ? () => setShowUpgradeModal(false) : null}
        />
      )}

      {/* Navbar */}
      <Navbar
        auth={auth}
        onOpenAdmin={() => setShowAdminModal(true)}
        onOpenStats={() => setShowStatsModal(true)}
        onOpenParlay={() => setShowParlayDrawer(true)}
        onOpenUpgrade={() => setShowUpgradeModal(true)}
        onLogout={handleLogout}
        currency={currency}
        setCurrency={setCurrency}
        oddsFormat={oddsFormat}
        setOddsFormat={setOddsFormat}
        parlayCount={parlayLegs.length}
        isSyncing={isSyncing}
        onManualSync={handleManualSync}
      />

      {/* Live Ticker */}
      <LiveTicker matches={matches} />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4">
        
        {/* Community VIP Channels (Telegram, WhatsApp, Instagram) */}
        <CommunityBanner />

        {/* League Selector Carousel */}
        <LeagueSelector
          selectedLeague={selectedLeague}
          onSelectLeague={setSelectedLeague}
          matchCounts={leagueMatchCounts}
        />

        {/* Featured Spotlight Match */}
        {selectedLeague === 'all' && timeframe === 'all' && matchStatusFilter === 'all' && !searchQuery && featuredMatch && (
          <HeroFeaturedMatch
            match={featuredMatch}
            onOpenMatch={setSelectedMatch}
            onAddToParlay={handleAddToParlay}
            oddsFormat={oddsFormat}
          />
        )}

        {/* Filters */}
        <DateFilterTabs
          timeframe={timeframe}
          setTimeframe={setTimeframe}
          matchStatusFilter={matchStatusFilter}
          setMatchStatusFilter={setMatchStatusFilter}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          marketFilter={marketFilter}
          setMarketFilter={setMarketFilter}
          liveCount={liveMatchesCount}
        />

        {/* Matches Grid */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm md:text-base text-white flex items-center space-x-2">
              <span>Partidos & Pronósticos Cuantitativos</span>
              <span className="text-xs font-mono font-normal text-slate-400">
                ({filteredMatches.length} encuentros)
              </span>
            </h3>
            <span className="text-xs font-mono text-slate-400">
              Formato: <strong>{oddsFormat.toUpperCase()}</strong> • Moneda: <strong>{currency}</strong>
            </span>
          </div>

          {loadingMatches ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-56 terminal-card rounded-xl animate-pulse bg-[#0d121c]" />
              ))}
            </div>
          ) : matchError ? (
            <div className="text-center py-12 terminal-card rounded-2xl border border-rose-500/30 bg-rose-500/5 my-4">
              <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-white mb-1">
                No se pudieron consultar los partidos en vivo
              </h4>
              <p className="text-xs font-mono text-rose-300 mb-4 max-w-md mx-auto">
                {matchError}
              </p>
              <button
                type="button"
                onClick={() => fetchMatches()}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl text-xs font-mono transition cursor-pointer shadow-lg shadow-emerald-500/20"
              >
                Reintentar Conexión
              </button>
            </div>
          ) : filteredMatches.length === 0 ? (
            <div className="text-center py-16 terminal-card rounded-2xl">
              <Radio className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-white mb-1">
                No hay partidos para el criterio seleccionado
              </h4>
              <p className="text-xs font-mono text-slate-400 mb-4">
                Prueba seleccionando otra liga o limpiando los filtros.
              </p>
              <button
                onClick={() => { setSelectedLeague('all'); setTimeframe('all'); setMatchStatusFilter('all'); setSearchQuery(''); setMarketFilter('all'); }}
                className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-lg text-xs font-mono transition cursor-pointer"
              >
                Restablecer Filtros
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMatches.map(m => (
                <MatchCard
                  key={m.id}
                  match={m}
                  onOpenModal={setSelectedMatch}
                  onAddToParlay={handleAddToParlay}
                  oddsFormat={oddsFormat}
                />
              ))}
            </div>
          )}
        </div>

        {/* Community VIP Showcase with Reference Image and Tipsters */}
        <FooterCommunityShowcase />

      </main>

      {/* Floating Parlay Drawer Launcher */}
      {!showParlayDrawer && parlayLegs.length > 0 && (
        <button
          onClick={() => { sounds.playClick(); setShowParlayDrawer(true); }}
          className="fixed bottom-6 right-6 z-40 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-xl flex items-center space-x-2 cursor-pointer text-xs font-mono transition"
        >
          <Layers className="w-4 h-4" />
          <span>Ver Parlay Ticket ({parlayLegs.length})</span>
        </button>
      )}

      {/* Modals */}
      {selectedMatch && (
        <MatchDetailModal
          match={selectedMatch}
          onClose={() => setSelectedMatch(null)}
          onAddToParlay={handleAddToParlay}
          oddsFormat={oddsFormat}
        />
      )}

      <ParlayBuilderDrawer
        isOpen={showParlayDrawer}
        onClose={() => setShowParlayDrawer(false)}
        legs={parlayLegs}
        onRemoveLeg={handleRemoveParlayLeg}
        onClearAll={() => setParlayLegs([])}
        onLoadDailyBanker={handleLoadDailyBanker}
        currency={currency}
        oddsFormat={oddsFormat}
      />

      {showAdminModal && (
        <AdminDashboardModal onClose={() => setShowAdminModal(false)} />
      )}

      {showStatsModal && (
        <StatsCenterModal onClose={() => setShowStatsModal(false)} />
      )}

      {/* Footer */}
      <footer className="w-full bg-[#07090f] border-t border-white/5 py-6 px-4 text-center text-xs font-mono text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-slate-300">DEPORTEPICKS AI VIP</span>
            <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] text-slate-300 font-bold">v1.0.0</span>
            <span>•</span>
            <span>Plataforma de Análisis Cuantitativo para Apuestas</span>
          </div>
          <div className="text-slate-400 text-[11px]">
            Liga MX • MLS • Premier • LaLiga • Serie A • Ligue 1 • Champions League • Leagues Cup
          </div>
        </div>
      </footer>

    </div>
  );
}
