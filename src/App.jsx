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
import { Layers, Radio, Zap, AlertCircle, Crown } from 'lucide-react';
import { getMatchSafetyScore, getBestBankerPick, getTop3Opportunities } from './utils/mathProbabilities';

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
  const getInitialMarketFromPath = () => {
    if (typeof window === 'undefined') return 'all';
    const p = window.location.pathname.toLowerCase();
    if (p === '/boost' || p.startsWith('/boost/')) return 'safe';
    if (p === '/goal' || p.startsWith('/goal/')) return 'goal';
    return 'all';
  };

  const getInitialBankerSub = () => {
    if (typeof window === 'undefined') return 'highest_safety';
    try {
      const p = window.location.pathname.toLowerCase();
      if (p === '/boost' || p.startsWith('/boost/')) {
        const sub = new URLSearchParams(window.location.search).get('sub');
        if (['highest_safety', 'recent', 'live', 'all_profit'].includes(sub)) {
          return sub;
        }
      }
    } catch {}
    return 'highest_safety';
  };

  const getInitialGoalSub = () => {
    if (typeof window === 'undefined') return 'all_goals';
    try {
      const p = window.location.pathname.toLowerCase();
      if (p === '/goal' || p.startsWith('/goal/')) {
        const sub = new URLSearchParams(window.location.search).get('sub');
        if (['all_goals', 'over25', 'under25', 'btts', 'halves'].includes(sub)) {
          return sub;
        }
      }
    } catch {}
    return 'all_goals';
  };

  const [marketFilter, setMarketFilter] = useState(getInitialMarketFromPath);
  const [bankerSubFilter, setBankerSubFilter] = useState(getInitialBankerSub);
  const [goalSubFilter, setGoalSubFilter] = useState(getInitialGoalSub);

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
  const feedRequest = useRef(null);

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

  const navigateTo = useCallback((market, subFilter = null) => {
    sounds.playClick();
    setMarketFilter(market);
    let targetSub = subFilter;
    if (market === 'safe' || market === 'boost') {
      if (subFilter) setBankerSubFilter(subFilter);
      targetSub = subFilter || bankerSubFilter;
    } else if (market === 'goal') {
      if (subFilter) setGoalSubFilter(subFilter);
      targetSub = subFilter || goalSubFilter;
    }
    let targetPath = '/';
    if (market === 'safe' || market === 'boost') {
      targetPath = targetSub && targetSub !== 'highest_safety' ? `/boost?sub=${targetSub}` : '/boost';
    } else if (market === 'goal') {
      targetPath = targetSub && targetSub !== 'all_goals' ? `/goal?sub=${targetSub}` : '/goal';
    }
    if (typeof window !== 'undefined' && (window.location.pathname + window.location.search) !== targetPath) {
      window.history.pushState(null, '', targetPath);
    }
  }, [bankerSubFilter, goalSubFilter]);

  useEffect(() => {
    const handlePopState = () => {
      const p = window.location.pathname.toLowerCase();
      const search = new URLSearchParams(window.location.search);
      const sub = search.get('sub');
      if (p === '/boost' || p.startsWith('/boost/')) {
        setMarketFilter('safe');
        if (sub && ['highest_safety', 'recent', 'live', 'all_profit'].includes(sub)) {
          setBankerSubFilter(sub);
        } else {
          setBankerSubFilter('highest_safety');
        }
      } else if (p === '/goal' || p.startsWith('/goal/')) {
        setMarketFilter('goal');
        if (sub && ['all_goals', 'over25', 'under25', 'btts', 'halves'].includes(sub)) {
          setGoalSubFilter(sub);
        } else {
          setGoalSubFilter('all_goals');
        }
      } else {
        setMarketFilter('all');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const fetchMatches = useCallback(async () => {
    feedRequest.current?.abort();
    const controller = new AbortController();
    feedRequest.current = controller;
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
        signal: controller.signal,
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
      if (controller.signal.aborted) return;
      if (data.success && Array.isArray(data.matches)) {
        setMatches(data.matches);
        setMatchError('');
      } else {
        setMatchError(data.message || 'No se pudieron procesar los partidos.');
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error('Error fetching matches:', err);
      setMatchError('Error de conexión al consultar el feed de partidos en vivo.');
    } finally {
      if (feedRequest.current === controller) setLoadingMatches(false);
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
        setSelectedMatch(prev => {
          if (!prev) return null;
          const updated = data.matches.find(u => u.id === prev.id);
          return updated ? { ...prev, ...updated } : prev;
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
      feedRequest.current?.abort();
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

  const handleAddToParlay = (legOrLegs) => {
    const items = Array.isArray(legOrLegs) ? legOrLegs : [legOrLegs];
    let addedCount = 0;
    const updated = [...parlayLegs];

    for (const leg of items) {
      if (!leg?.matchId || !leg.selection || !Number.isFinite(leg.odds) || leg.odds <= 1 || leg.odds > 1000 || updated.length >= 20) continue;
      const exists = updated.some(l => l.matchId === leg.matchId);
      if (!exists) {
        updated.push(leg);
        addedCount++;
      }
    }

    if (addedCount === 0) {
      setShowParlayDrawer(true);
      showToast('Se requiere una cuota publicada y solo una selección por partido.');
      return;
    }

    setParlayLegs(updated);
    setShowParlayDrawer(true);
    if (items.length > 1) {
      showToast(`🔥 Añadidas ${addedCount} mejores oportunidades al Parlay`);
    } else {
      showToast(`Añadido: ${items[0].selection}`);
    }
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
  let filteredMatches = matches.filter(m => {
    if (!m) return false;
    // Si no está seleccionada la pestaña de 'Resultados' (FINISHED),
    // no mezclar partidos pasados/finalizados con los partidos activos o próximos para apostar
    if (matchStatusFilter !== 'FINISHED' && m.status === 'FINISHED') return false;
    if (marketFilter === 'safe' || marketFilter === 'boost') {
      if (bankerSubFilter === 'live') {
        return m.status === 'LIVE';
      }
      return true;
    }
    if (marketFilter === 'goal') {
      const p = m.model?.probabilities || m.probabilities || {};
      const over25 = p.over25 ?? 0;
      const btts = p.bttsYes ?? 0;
      const under25 = p.under25 ?? (100 - over25);
      if (goalSubFilter === 'over25') return over25 >= 50;
      if (goalSubFilter === 'under25') return under25 >= 50;
      if (goalSubFilter === 'btts') return btts >= 50;
      if (goalSubFilter === 'halves') return Boolean(m.halfGoals || m.model?.halfStats || m.details?.halves);
      return (p.over15 ?? 0) > 0 || over25 > 0 || btts > 0;
    }
    if (marketFilter === 'btts') return (m.probabilities?.bttsYes || 0) >= 55;
    if (marketFilter === 'over') return (m.probabilities?.over25 || 0) >= 55;
    if (marketFilter === 'under') return (m.probabilities?.under25 || (100 - (m.probabilities?.over25 || 50))) >= 50;
    return true;
  });

  // When 'safe' or 'boost' (Picks Banqueros) is active, apply sub-filter sorting and ranking
  if (marketFilter === 'safe' || marketFilter === 'boost') {
    if (bankerSubFilter === 'all_profit') {
      // Mayor ganancia: ordenar por cuota (odds) del pick banquero descendente sin importar la fecha
      filteredMatches = [...filteredMatches].sort((a, b) => {
        const pickA = getBestBankerPick(a);
        const pickB = getBestBankerPick(b);
        const oddsA = Number(pickA?.odds || a.odds?.homeWin || 1.25);
        const oddsB = Number(pickB?.odds || b.odds?.homeWin || 1.25);
        if (oddsB !== oddsA) return oddsB - oddsA;
        return getMatchSafetyScore(b) - getMatchSafetyScore(a);
      });
    } else if (bankerSubFilter === 'recent') {
      // Recientes / Próximos: ordenar cronológicamente (más cercanos a jugarse primero)
      const getMatchTime = m => {
        if (!m) return 0;
        const raw = m.kickoff || m.date || m.timestamp;
        if (!raw) return 0;
        const t = new Date(raw).getTime();
        return Number.isFinite(t) ? t : 0;
      };
      filteredMatches = [...filteredMatches].sort((a, b) => {
        const timeA = getMatchTime(a);
        const timeB = getMatchTime(b);
        if (timeA && timeB && timeA !== timeB) return timeA - timeB;
        return getMatchSafetyScore(b) - getMatchSafetyScore(a);
      });
    } else {
      // 'highest_safety' (default) o 'live': ordenados de mayor a menor seguridad
      filteredMatches = [...filteredMatches].sort((a, b) => getMatchSafetyScore(b) - getMatchSafetyScore(a));
    }
    // Máximo de 10 mejores picks banqueros oficiales
    filteredMatches = filteredMatches.slice(0, 10);
  }

  // When 'goal' is active, apply goal sub-filter sorting
  if (marketFilter === 'goal') {
    if (goalSubFilter === 'over25') {
      filteredMatches = [...filteredMatches].sort((a, b) => {
        const pA = a.model?.probabilities?.over25 || a.probabilities?.over25 || 0;
        const pB = b.model?.probabilities?.over25 || b.probabilities?.over25 || 0;
        return pB - pA;
      });
    } else if (goalSubFilter === 'under25') {
      filteredMatches = [...filteredMatches].sort((a, b) => {
        const pA = a.model?.probabilities?.under25 || (100 - (a.probabilities?.over25 || 50));
        const pB = b.model?.probabilities?.under25 || (100 - (b.probabilities?.over25 || 50));
        return pB - pA;
      });
    } else if (goalSubFilter === 'btts') {
      filteredMatches = [...filteredMatches].sort((a, b) => {
        const pA = a.model?.probabilities?.bttsYes || a.probabilities?.bttsYes || 0;
        const pB = b.model?.probabilities?.bttsYes || b.probabilities?.bttsYes || 0;
        return pB - pA;
      });
    } else {
      filteredMatches = [...filteredMatches].sort((a, b) => {
        const pA = (a.probabilities?.over15 || 0) + (a.probabilities?.over25 || 0);
        const pB = (b.probabilities?.over15 || 0) + (b.probabilities?.over25 || 0);
        return pB - pA;
      });
    }
  }

  const isVipUser = Boolean(
    auth?.isAdmin || 
    auth?.role === 'owner' || 
    auth?.role === 'vip' || 
    auth?.role === 'vip_user' || 
    auth?.user?.plan === 'VIP' || 
    auth?.user?.plan === 'Owner' ||
    auth?.user?.hasCode ||
    auth?.code
  );

  const handleAddTopBoostsToParlay = () => {
    sounds.playClick();
    const topPicks = [];
    for (const m of filteredMatches) {
      if (!isVipUser && topPicks.length >= 3) break;
      const opps = getTop3Opportunities(m);
      const pickWithOdds = opps.find(p => p && Number.isFinite(p.odds) && p.odds > 1);
      if (pickWithOdds) {
        topPicks.push(pickWithOdds);
      }
    }
    if (topPicks.length > 0) {
      handleAddToParlay(topPicks);
    } else {
      showToast('No hay picks con cuotas disponibles para añadir automáticamente.');
    }
  };

  const liveMatchesCount = matches.filter(m => m && m.status === 'LIVE').length;
  const featuredMatch = matches.find(m => m && m.isFeatured && m.status !== 'FINISHED') || matches.find(m => m && m.status !== 'FINISHED') || matches[0] || null;

  const leagueMatchCounts = {
    total: matches.length,
    inglaterra: matches.filter(m => m?.leagueId === 'inglaterra').length,
    espana: matches.filter(m => m?.leagueId === 'espana').length,
    mexico: matches.filter(m => m?.leagueId === 'mexico').length,
    mls: matches.filter(m => m?.leagueId === 'mls').length,
    italia: matches.filter(m => m?.leagueId === 'italia').length,
    francia: matches.filter(m => m?.leagueId === 'francia').length,
    champions: matches.filter(m => m?.leagueId === 'champions').length,
    leagues_cup: matches.filter(m => m?.leagueId === 'leagues_cup').length,
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
        marketFilter={marketFilter}
        onNavigate={navigateTo}
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
          liveCount={liveMatchesCount}
        />

        {/* Matches Grid */}
        <div className="mb-12">
          {/* Banner Exclusivo de Picks Banqueros / Boost cuando el filtro está activo */}
          {(marketFilter === 'safe' || marketFilter === 'boost') && (
            <div className="mb-5 p-4 rounded-2xl bg-gradient-to-r from-emerald-500/20 via-[#0d1522] to-sky-500/20 border border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.15)] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-xl">⚡</span>
                    <h4 className="font-black text-sm md:text-base text-white uppercase tracking-wider font-sans">
                      Super Boosts & Picks Banqueros — {bankerSubFilter === 'highest_safety' ? 'Más Asegurados (Máxima Probabilidad)' : bankerSubFilter === 'recent' ? 'Recientes / Próximos' : bankerSubFilter === 'live' ? 'En Vivo' : 'Mayor Ganancia (Sin Filtro de Fecha)'}
                    </h4>
                  </div>
                  <p className="text-xs text-emerald-300/90 font-mono">
                    {bankerSubFilter === 'highest_safety' && `Selección cuantitativa de máxima confianza y menor varianza. Priorizados de mayor a menor probabilidad (${filteredMatches.length} pronósticos clasificados).`}
                    {bankerSubFilter === 'recent' && `Partidos programados por fecha y horario de inicio más próximos (${filteredMatches.length} pronósticos listos para jugar).`}
                    {bankerSubFilter === 'live' && `Partidos en disputa activa en tiempo real con líneas banqueras en juego (${filteredMatches.length} encuentros en vivo).`}
                    {bankerSubFilter === 'all_profit' && `Maximizador de rendimiento: picks banqueros ordenados por mayor cuota y retorno sin importar la fecha (${filteredMatches.length} pronósticos clasificados).`}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleAddTopBoostsToParlay}
                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-mono text-xs font-bold shadow-[0_0_15px_rgba(16,185,129,0.35)] transition cursor-pointer flex items-center space-x-1.5"
                  >
                    <span>🔥</span>
                    <span>Añadir Top Boosts al Parlay</span>
                  </button>
                  <span className="px-3 py-1.5 rounded-xl bg-emerald-500/30 text-emerald-200 border border-emerald-500/50 font-mono text-xs font-bold shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                    {filteredMatches.length} PICKS BANQUEROS
                  </span>
                </div>
              </div>

              {/* Sub-filtros para Picks Banqueros */}
              <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-emerald-500/20">
                <span className="text-xs font-mono text-slate-300 mr-1 font-bold">Filtro Banquero:</span>
                <button
                  onClick={() => {
                    sounds.playClick();
                    setBankerSubFilter('highest_safety');
                    if (typeof window !== 'undefined') window.history.replaceState(null, '', '/boost');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition cursor-pointer flex items-center space-x-1.5 ${
                    bankerSubFilter === 'highest_safety'
                      ? 'bg-emerald-500 text-slate-950 font-bold shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                      : 'bg-[#121824] text-slate-300 hover:bg-emerald-500/20 border border-white/10'
                  }`}
                >
                  <span>🛡️ Más Asegurados</span>
                </button>
                <button
                  onClick={() => {
                    sounds.playClick();
                    setBankerSubFilter('recent');
                    if (typeof window !== 'undefined') window.history.replaceState(null, '', '/boost?sub=recent');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition cursor-pointer flex items-center space-x-1.5 ${
                    bankerSubFilter === 'recent'
                      ? 'bg-sky-500 text-slate-950 font-bold shadow-[0_0_12px_rgba(14,165,233,0.4)]'
                      : 'bg-[#121824] text-slate-300 hover:bg-sky-500/20 border border-white/10'
                  }`}
                >
                  <span>⏱️ Recientes / Próximos</span>
                </button>
                <button
                  onClick={() => {
                    sounds.playClick();
                    setBankerSubFilter('live');
                    if (matchStatusFilter === 'FINISHED') setMatchStatusFilter('all');
                    if (typeof window !== 'undefined') window.history.replaceState(null, '', '/boost?sub=live');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition cursor-pointer flex items-center space-x-1.5 ${
                    bankerSubFilter === 'live'
                      ? 'bg-rose-500 text-white font-bold shadow-[0_0_12px_rgba(244,63,94,0.4)]'
                      : 'bg-[#121824] text-slate-300 hover:bg-rose-500/20 border border-white/10'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse inline-block mr-0.5" />
                  <span>🔴 En Vivo</span>
                  {liveMatchesCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.2 text-[10px] bg-rose-600 text-white rounded-full">
                      {liveMatchesCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => {
                    sounds.playClick();
                    setBankerSubFilter('all_profit');
                    if (timeframe !== 'all') setTimeframe('all');
                    if (typeof window !== 'undefined') window.history.replaceState(null, '', '/boost?sub=all_profit');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition cursor-pointer flex items-center space-x-1.5 ${
                    bankerSubFilter === 'all_profit'
                      ? 'bg-amber-400 text-slate-950 font-bold shadow-[0_0_12px_rgba(251,191,36,0.4)]'
                      : 'bg-[#121824] text-slate-300 hover:bg-amber-400/20 border border-white/10'
                  }`}
                >
                  <span>💰 Mayor Ganancia (Sin Filtro de Fecha)</span>
                </button>
              </div>

              {/* Aviso para usuarios invitados / prueba de 3 días (no VIP) */}
              {!isVipUser && (
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs font-mono">
                  <div className="flex items-center space-x-2">
                    <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      <strong>Acceso Invitado / Prueba (3 Días):</strong> Tienes acceso a los 3 mejores picks banqueros de hoy. Los picks #4 al #10 están reservados para miembros VIP.
                    </span>
                  </div>
                  <button
                    onClick={() => { sounds.playClick(); setShowUpgradeModal(true); }}
                    className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold rounded-lg text-xs font-mono shrink-0 cursor-pointer shadow-[0_0_12px_rgba(245,158,11,0.35)] transition"
                  >
                    👑 Desbloquear VIP
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Banner Exclusivo de Goal Hub cuando el filtro de goles está activo */}
          {marketFilter === 'goal' && (
            <div className="mb-5 p-4 rounded-2xl bg-gradient-to-r from-sky-500/20 via-[#0d1522] to-indigo-500/20 border border-sky-500/40 shadow-[0_0_30px_rgba(14,165,233,0.15)] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-xl">⚽</span>
                    <h4 className="font-black text-sm md:text-base text-white uppercase tracking-wider font-sans">
                      Goal Predictor Hub — {goalSubFilter === 'all_goals' ? 'Todos los Mercados de Goles' : goalSubFilter === 'over25' ? 'Mayor Probabilidad Over 2.5' : goalSubFilter === 'under25' ? 'Mayor Probabilidad Under 2.5' : goalSubFilter === 'btts' ? 'Ambos Equipos Anotan (BTTS)' : 'Goles por Mitad'}
                    </h4>
                  </div>
                  <p className="text-xs text-sky-300/90 font-mono">
                    {goalSubFilter === 'all_goals' && `Análisis cuantitativo de anotaciones y tendencias ofensivas (${filteredMatches.length} partidos con líneas de goles activas).`}
                    {goalSubFilter === 'over25' && `Partidos con más de 50% de probabilidad estimada de superar la línea de 2.5 goles (${filteredMatches.length} partidos filtrados).`}
                    {goalSubFilter === 'under25' && `Partidos con perfil táctico cerrado y alta probabilidad de menos de 2.5 goles (${filteredMatches.length} partidos filtrados).`}
                    {goalSubFilter === 'btts' && `Partidos donde ambos equipos poseen alta frecuencia de marcar (${filteredMatches.length} partidos con BTTS Sí ≥ 50%).`}
                    {goalSubFilter === 'halves' && `Métricas y proyecciones de goles desglosadas por primer y segundo tiempo (${filteredMatches.length} partidos con datos de mitad).`}
                  </p>
                </div>
                <span className="px-3 py-1.5 rounded-xl bg-sky-500/30 text-sky-200 border border-sky-500/50 font-mono text-xs font-bold shadow-[0_0_15px_rgba(14,165,233,0.3)]">
                  {filteredMatches.length} PARTIDOS GOAL HUB
                </span>
              </div>

              {/* Sub-filtros de Goles */}
              <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-sky-500/20">
                <span className="text-xs font-mono text-slate-300 mr-1 font-bold">Mercado de Goles:</span>
                <button
                  onClick={() => {
                    sounds.playClick();
                    setGoalSubFilter('all_goals');
                    if (typeof window !== 'undefined') window.history.replaceState(null, '', '/goal');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition cursor-pointer flex items-center space-x-1.5 ${
                    goalSubFilter === 'all_goals'
                      ? 'bg-sky-500 text-slate-950 font-bold shadow-[0_0_12px_rgba(14,165,233,0.4)]'
                      : 'bg-[#121824] text-slate-300 hover:bg-sky-500/20 border border-white/10'
                  }`}
                >
                  <span>🔥 Todos los Goles</span>
                </button>
                <button
                  onClick={() => {
                    sounds.playClick();
                    setGoalSubFilter('over25');
                    if (typeof window !== 'undefined') window.history.replaceState(null, '', '/goal?sub=over25');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition cursor-pointer flex items-center space-x-1.5 ${
                    goalSubFilter === 'over25'
                      ? 'bg-emerald-500 text-slate-950 font-bold shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                      : 'bg-[#121824] text-slate-300 hover:bg-emerald-500/20 border border-white/10'
                  }`}
                >
                  <span>📈 +2.5 Over</span>
                </button>
                <button
                  onClick={() => {
                    sounds.playClick();
                    setGoalSubFilter('under25');
                    if (typeof window !== 'undefined') window.history.replaceState(null, '', '/goal?sub=under25');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition cursor-pointer flex items-center space-x-1.5 ${
                    goalSubFilter === 'under25'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                      : 'bg-[#121824] text-slate-300 hover:bg-amber-500/20 border border-white/10'
                  }`}
                >
                  <span>📉 -2.5 Under</span>
                </button>
                <button
                  onClick={() => {
                    sounds.playClick();
                    setGoalSubFilter('btts');
                    if (typeof window !== 'undefined') window.history.replaceState(null, '', '/goal?sub=btts');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition cursor-pointer flex items-center space-x-1.5 ${
                    goalSubFilter === 'btts'
                      ? 'bg-purple-500 text-white font-bold shadow-[0_0_12px_rgba(168,85,247,0.4)]'
                      : 'bg-[#121824] text-slate-300 hover:bg-purple-500/20 border border-white/10'
                  }`}
                >
                  <span>🤝 Ambos Anotan</span>
                </button>
                <button
                  onClick={() => {
                    sounds.playClick();
                    setGoalSubFilter('halves');
                    if (typeof window !== 'undefined') window.history.replaceState(null, '', '/goal?sub=halves');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition cursor-pointer flex items-center space-x-1.5 ${
                    goalSubFilter === 'halves'
                      ? 'bg-indigo-500 text-white font-bold shadow-[0_0_12px_rgba(99,102,241,0.4)]'
                      : 'bg-[#121824] text-slate-300 hover:bg-indigo-500/20 border border-white/10'
                  }`}
                >
                  <span>⏱️ Goles por Mitad</span>
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm md:text-base text-white flex items-center space-x-2">
              <span>
                {(marketFilter === 'safe' || marketFilter === 'boost')
                  ? '⚡ Ranking de Picks Banqueros & Boost'
                  : marketFilter === 'goal'
                  ? '⚽ Goal Predictor Hub — Pronósticos de Goles'
                  : 'Partidos & Pronósticos Cuantitativos'}
              </span>
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
                onClick={() => { setSelectedLeague('all'); setTimeframe('all'); setMatchStatusFilter('all'); setSearchQuery(''); setMarketFilter('all'); setBankerSubFilter('highest_safety'); setGoalSubFilter('all_goals'); window.history.pushState(null, '', '/'); }}
                className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-lg text-xs font-mono transition cursor-pointer"
              >
                Restablecer Filtros
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMatches.map((m, idx) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  onOpenModal={setSelectedMatch}
                  onAddToParlay={handleAddToParlay}
                  oddsFormat={oddsFormat}
                  bankerRank={(marketFilter === 'safe' || marketFilter === 'boost') ? idx + 1 : null}
                  isLocked={(marketFilter === 'safe' || marketFilter === 'boost') && !isVipUser && idx >= 3}
                  onUnlockVip={() => setShowUpgradeModal(true)}
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
