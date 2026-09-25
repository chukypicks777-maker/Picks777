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
import { getMatchSafetyScore, getBestBankerPick, getEffectiveOdds, getContextualPick } from './utils/mathProbabilities';

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
  const [oddsFormat, setOddsFormat] = useState(() => {
    try {
      const saved = (localStorage.getItem('oddsFormat') || localStorage.getItem('deportepicks_odds') || '').toLowerCase();
      if (saved === 'american' || saved === 'americano' || saved === 'us') return 'american';
      if (saved === 'fractional' || saved === 'fraccionario' || saved === 'fraction') return 'fractional';
      return 'decimal';
    } catch {
      return 'decimal';
    }
  });

  // Filters
  const [selectedLeague, setSelectedLeague] = useState('all');
  const [timeframe, setTimeframe] = useState('all');
  const [matchStatusFilter, setMatchStatusFilter] = useState('all'); // 'all' | 'LIVE' | 'FINISHED'
  const [searchQuery, setSearchQuery] = useState('');
  const [marketFilter, setMarketFilter] = useState(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      if (path.includes('banquero') || path.includes('safe')) return 'safe';
      if (path.includes('btts')) return 'btts';
      if (path.includes('over')) return 'over';
    }
    return 'all';
  });
  const [bankerSubFilter, setBankerSubFilter] = useState('highest_safety'); // 'highest_safety' | 'recent' | 'live' | 'all_profit'

  const handleNavigate = (filterId) => {
    sounds.playClick();
    setMarketFilter(filterId);
    if (filterId === 'safe') {
      window.history.pushState(null, '', '/banqueros');
    } else if (filterId === 'btts') {
      window.history.pushState(null, '', '/btts');
    } else if (filterId === 'over') {
      window.history.pushState(null, '', '/over');
    } else {
      window.history.pushState(null, '', '/');
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.toLowerCase();
      if (path.includes('banquero') || path.includes('safe')) setMarketFilter('safe');
      else if (path.includes('btts')) setMarketFilter('btts');
      else if (path.includes('over')) setMarketFilter('over');
      else setMarketFilter('all');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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
  const [currentEpoch, setCurrentEpoch] = useState(() => Date.now());

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
        setCurrentEpoch(Date.now());
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
        setCurrentEpoch(Date.now());
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
    try {
      localStorage.setItem('oddsFormat', oddsFormat);
      localStorage.setItem('deportepicks_odds', oddsFormat);
    } catch {}
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
    let replacedCount = 0;
    const updated = [...parlayLegs];

    for (const rawLeg of items) {
      if (!rawLeg?.matchId || !rawLeg.selection) continue;
      const leg = { ...rawLeg };
      if (!Number.isFinite(leg.odds) || leg.odds <= 1) {
        const est = getEffectiveOdds(leg);
        if (est && est > 1) leg.odds = est;
      }
      if (!Number.isFinite(leg.odds) || leg.odds <= 1 || leg.odds > 1000 || updated.length >= 20) continue;
      const existingIdx = updated.findIndex(l => l.matchId === leg.matchId);
      if (existingIdx >= 0) {
        if (updated[existingIdx].selection !== leg.selection) {
          updated[existingIdx] = leg;
          replacedCount++;
        }
      } else {
        updated.push(leg);
        addedCount++;
      }
    }

    if (addedCount === 0 && replacedCount === 0) {
      setShowParlayDrawer(true);
      showToast('Selección ya presente en el parlay o límite alcanzado.');
      return;
    }

    setParlayLegs(updated);
    setShowParlayDrawer(true);
    if (replacedCount > 0 && addedCount === 0) {
      showToast(`Actualizado: ${items[0].selection}`);
    } else if (items.length > 1) {
      showToast(`🔥 Añadidas ${addedCount} selecciones al Parlay`);
    } else {
      showToast(`Añadido: ${items[0].selection}`);
    }
  };

  const handleToggleParlay = (rawLeg) => {
    if (!rawLeg?.matchId || !rawLeg.selection) return;
    const existingIdx = parlayLegs.findIndex(l => l.matchId === rawLeg.matchId && l.selection === rawLeg.selection);
    if (existingIdx >= 0) {
      sounds.playClick();
      const updated = parlayLegs.filter((_, i) => i !== existingIdx);
      setParlayLegs(updated);
      showToast(`Eliminado del parlay: ${rawLeg.selection}`);
      return;
    }
    sounds.playAddParlay();
    handleAddToParlay(rawLeg);
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
    // no mezclar partidos pasados/finalizados o cancelados con los partidos activos o próximos para apostar
    if (matchStatusFilter !== 'FINISHED') {
      if (m.status === 'FINISHED' || m.status === 'POSTPONED' || m.status === 'CANCELLED' || m.status === 'ABANDONED') {
        return false;
      }
      // Evitar mostrar partidos programados que debieron iniciar hace más de 3.5 horas y no están en vivo (partidos pasados/desfasados)
      if (m.status === 'SCHEDULED' && m.kickoff) {
        const kTime = new Date(m.kickoff).getTime();
        if (Number.isFinite(kTime) && currentEpoch - kTime > 3.5 * 3600 * 1000) {
          return false;
        }
      }
    }
    if (marketFilter === 'safe') {
      if (bankerSubFilter === 'live') {
        return m.status === 'LIVE';
      }
      return true;
    }
    if (marketFilter === 'btts' || marketFilter === 'over' || marketFilter === 'under') {
      const pick = getContextualPick(m, marketFilter);
      return Boolean(pick && pick.probability >= 50);
    }
    return true;
  });

  // When 'safe' (Picks Banqueros) is active, apply sub-filter sorting and ranking
  if (marketFilter === 'safe') {
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
  } else if (marketFilter === 'btts') {
    // Para Ambos Anotan (BTTS), ordenar por probabilidad contextual de BTTS descendente
    filteredMatches = [...filteredMatches].sort((a, b) => {
      const bttsA = getContextualPick(a, 'btts')?.probability ?? 0;
      const bttsB = getContextualPick(b, 'btts')?.probability ?? 0;
      return bttsB - bttsA;
    });
  } else if (marketFilter === 'over') {
    // Para Más de 2.5 Goles (Over), ordenar por probabilidad contextual de Over 2.5 descendente
    filteredMatches = [...filteredMatches].sort((a, b) => {
      const overA = getContextualPick(a, 'over')?.probability ?? 0;
      const overB = getContextualPick(b, 'over')?.probability ?? 0;
      return overB - overA;
    });
  } else if (marketFilter === 'under') {
    // Para Menos de 2.5 Goles (Under), ordenar por probabilidad contextual de Under 2.5 descendente
    filteredMatches = [...filteredMatches].sort((a, b) => {
      const underA = getContextualPick(a, 'under')?.probability ?? 0;
      const underB = getContextualPick(b, 'under')?.probability ?? 0;
      return underB - underA;
    });
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

  const isOwner = Boolean(
    auth?.isAdmin || 
    auth?.role === 'owner' || 
    auth?.user?.plan === 'Owner' ||
    auth?.code === 'MASTER' ||
    auth?.vipCode === 'MASTER'
  );

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
    <div className="min-h-screen bg-[#080b11] text-slate-100 flex flex-col font-sans w-full overflow-x-hidden relative">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-4 z-[80] bg-[#111827]/95 backdrop-blur-md border border-sky-400/40 text-slate-100 px-4 py-2.5 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.8)] font-mono text-xs flex items-center space-x-2 animate-bounce-short">
          <Zap className="w-3.5 h-3.5 text-sky-400 shrink-0" />
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
        onNavigate={handleNavigate}
      />

      {/* Live Ticker */}
      <LiveTicker matches={matches} />

      {/* Main Container */}
      <main className={`flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 pt-4 transition-all duration-200 ${parlayLegs.length > 0 ? 'pb-36 sm:pb-32 lg:pb-16' : 'pb-20 sm:pb-16'}`}>
        
        {/* Community VIP Channels (Telegram, WhatsApp, Instagram) */}
        <CommunityBanner />

        {/* League Selector Carousel */}
        <LeagueSelector
          selectedLeague={selectedLeague}
          onSelectLeague={setSelectedLeague}
          matchCounts={leagueMatchCounts}
        />

        {/* Featured Spotlight Match */}
        {selectedLeague === 'all' && timeframe === 'all' && matchStatusFilter === 'all' && !searchQuery && marketFilter === 'all' && featuredMatch && (
          <HeroFeaturedMatch
            match={featuredMatch}
            onOpenMatch={setSelectedMatch}
            onAddToParlay={handleAddToParlay}
            onToggleParlay={handleToggleParlay}
            parlayLegs={parlayLegs}
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
          onNavigate={handleNavigate}
          liveCount={liveMatchesCount}
        />

        {/* Matches Grid */}
        <div className="mb-12">
          {/* Banner Exclusivo de Picks Banqueros cuando el filtro está activo */}
          {marketFilter === 'safe' && (
            <div className="mb-5 p-4 rounded-2xl bg-gradient-to-r from-emerald-500/20 via-[#0d1522] to-sky-500/20 border border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.15)] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-xl">💎</span>
                    <h4 className="font-black text-sm md:text-base text-white uppercase tracking-wider font-sans">
                      Picks Banqueros Oficiales — {bankerSubFilter === 'highest_safety' ? 'Más Asegurados (Máxima Probabilidad)' : bankerSubFilter === 'recent' ? 'Recientes / Próximos' : bankerSubFilter === 'live' ? 'En Vivo' : 'Mayor Ganancia (Sin Filtro de Fecha)'}
                    </h4>
                  </div>
                  <p className="text-xs text-emerald-300/90 font-mono">
                    {bankerSubFilter === 'highest_safety' && `Selección cuantitativa de máxima confianza y menor varianza. Priorizados de mayor a menor probabilidad (${filteredMatches.length} pronósticos clasificados).`}
                    {bankerSubFilter === 'recent' && `Partidos programados por fecha y horario de inicio más próximos (${filteredMatches.length} pronósticos listos para jugar).`}
                    {bankerSubFilter === 'live' && `Partidos en disputa activa en tiempo real con líneas banqueras en juego (${filteredMatches.length} encuentros en vivo).`}
                    {bankerSubFilter === 'all_profit' && `Maximizador de rendimiento: picks banqueros ordenados por mayor cuota y retorno sin importar la fecha (${filteredMatches.length} pronósticos clasificados).`}
                  </p>
                </div>
                <span className="px-3 py-1.5 rounded-xl bg-emerald-500/30 text-emerald-200 border border-emerald-500/50 font-mono text-xs font-bold shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                  {filteredMatches.length} PICKS BANQUEROS
                </span>
              </div>

              {/* Sub-filtros para Picks Banqueros */}
              <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-emerald-500/20">
                <span className="text-xs font-mono text-slate-300 mr-1 font-bold">Filtro Banquero:</span>
                <button
                  onClick={() => {
                    sounds.playClick();
                    setBankerSubFilter('highest_safety');
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

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-sm sm:text-base text-white">
                {marketFilter === 'safe'
                  ? '💎 Ranking de Picks Banqueros'
                  : marketFilter === 'btts'
                  ? '🤝 Partidos Ambos Equipos Anotan (BTTS)'
                  : marketFilter === 'over'
                  ? '📈 Partidos Más de 2.5 Goles (Over)'
                  : 'Partidos & Pronósticos Cuantitativos'}
              </h3>
              <span className="text-[11px] sm:text-xs font-mono font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                {filteredMatches.length} {filteredMatches.length === 1 ? 'encuentro' : 'encuentros'}
              </span>
            </div>
            <div className="flex items-center space-x-2 text-[11px] sm:text-xs font-mono text-slate-400 self-start sm:self-auto">
              <span>Formato: <strong className="text-slate-200">{oddsFormat === 'american' ? 'AMERICANO' : oddsFormat === 'fractional' ? 'FRACCIONARIO' : 'DECIMAL'}</strong></span>
              <span className="text-slate-600">•</span>
              <span>Moneda: <strong className="text-slate-200">{currency}</strong></span>
            </div>
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
                onClick={() => { setSelectedLeague('all'); setTimeframe('all'); setMatchStatusFilter('all'); setSearchQuery(''); setBankerSubFilter('highest_safety'); handleNavigate('all'); }}
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
                  onToggleParlay={handleToggleParlay}
                  parlayLegs={parlayLegs}
                  oddsFormat={oddsFormat}
                  bankerRank={marketFilter === 'safe' ? idx + 1 : null}
                  isLocked={marketFilter === 'safe' && !isVipUser && idx >= 3}
                  onUnlockVip={() => setShowUpgradeModal(true)}
                  marketFilter={marketFilter}
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
          className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] right-3 sm:bottom-6 sm:right-6 z-[65] px-3 sm:px-4 py-2 sm:py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold rounded-xl shadow-[0_10px_35px_rgba(0,0,0,0.7)] border border-emerald-400/40 flex items-center space-x-2 cursor-pointer text-xs font-mono transition-all backdrop-blur-md"
        >
          <Layers className="w-4 h-4 text-emerald-200 shrink-0" />
          <span className="whitespace-nowrap">Ver Parlay Ticket ({parlayLegs.length})</span>
        </button>
      )}

      {/* Modals */}
      {selectedMatch && (
        <MatchDetailModal
          match={selectedMatch}
          onClose={() => setSelectedMatch(null)}
          onAddToParlay={handleAddToParlay}
          onToggleParlay={handleToggleParlay}
          parlayLegs={parlayLegs}
          oddsFormat={oddsFormat}
          isOwner={isOwner}
          isVip={isVipUser}
          onUnlockVip={() => setShowUpgradeModal(true)}
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
            <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] text-slate-300 font-bold">v1.0.3</span>
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
