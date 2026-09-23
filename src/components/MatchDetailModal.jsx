import HalfGoalsSection from './HalfGoalsSection';
import VerifiedPicks from './VerifiedPicks';
import { scoreSimulation, displayNumber } from '../utils/probability';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, 
  RotateCw, 
  FileText, 
  Users, 
  BarChart2, 
  Cpu, 
  Target, 
  Activity, 
  Shield,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { sounds } from '../utils/audioEffects';
import LiveTacticalPitch from './LiveTacticalPitch';
import RadarScanner from './RadarScanner';
import NumberCounter from './NumberCounter';
import TeamDetailedStatsCard from './TeamDetailedStatsCard';
import DifferentialAnalysisSection from './DifferentialAnalysisSection';
import OverUnderGroupedSection from './OverUnderGroupedSection';
import { calculateTeamDetailedStats, calculateDifferential, getCoherentPredictedScore } from '../utils/mathProbabilities';
import { getCachedAnalysis, setCachedAnalysis, computeMatchFingerprint, clearAllAnalysisCache, removeCachedAnalysis } from '../utils/analysisCache';
import { getStoredAiConfig } from '../utils/aiSettings';
import { PROVIDER_PRESETS } from '../constants/aiProviders';

const calculateMatchSimulation = scoreSimulation;

let cachedActiveModel = null;

export default function MatchDetailModal({ 
  match, 
  onClose, 
  onAddToParlay, 
  oddsFormat = 'decimal',
  isOwner = false
}) {
  const effectiveIsOwner = Boolean(
    isOwner ||
    (typeof window !== 'undefined' && (
      localStorage.getItem('picks_user_role') === 'owner' ||
      localStorage.getItem('picks_is_owner') === 'true' ||
      localStorage.getItem('picks_owner_active') === 'true'
    ))
  );
  const initialCached = getCachedAnalysis(match?.id, match);
  const initialFingerprint = computeMatchFingerprint(match);

  const [activeTab, setActiveTab] = useState('ai_report');
  const [aiReport, setAiReport] = useState(initialCached?.aiReport || null);
  const [loadingAi, setLoadingAi] = useState(!initialCached?.aiReport);
  const [customSim, setCustomSim] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const [enrichedMatch, setEnrichedMatch] = useState(initialCached?.enrichedMatch || match);
  const [_loadingDetails, setLoadingDetails] = useState(!initialCached?.enrichedMatch);
  const [activeModelInfo, setActiveModelInfo] = useState(() => cachedActiveModel || { provider: 'custom', selectedModel: 'deepseek-v4.1', modelName: 'DeepSeek V4.1 Flash', isConfigured: false });

  // Derive simulation data; reset distribution if match changes
  const [lastMatchId, setLastMatchId] = useState(match?.id);
  const [lastFingerprint, setLastFingerprint] = useState(initialFingerprint);

  const currentFingerprint = computeMatchFingerprint(match);
  if (match?.id !== lastMatchId || currentFingerprint !== lastFingerprint) {
    setLastMatchId(match?.id);
    setLastFingerprint(currentFingerprint);
    setCustomSim(null);

    const freshCached = getCachedAnalysis(match?.id, match);
    if (freshCached?.aiReport) {
      setAiReport(freshCached.aiReport);
      setLoadingAi(false);
      if (freshCached.enrichedMatch) {
        setEnrichedMatch(freshCached.enrichedMatch);
        setLoadingDetails(false);
      }
    } else {
      setAiReport(null);
      setLoadingAi(true);
      setEnrichedMatch(match);
      setLoadingDetails(true);
    }
  }

  const m = enrichedMatch || match;
  const simulationData = customSim || calculateMatchSimulation(m, false);

  const aiRequestId = useRef(0);
  const matchRef = useRef(match);
  matchRef.current = match;
  const activeModelInfoRef = useRef(activeModelInfo);
  activeModelInfoRef.current = activeModelInfo;

  const fetchAiAnalysis = useCallback(async (forceRefresh = false, modelOverride = null) => {
    const curMatch = matchRef.current;
    if (!curMatch?.id) return;
    const modelToUse = modelOverride || activeModelInfoRef.current.selectedModel || undefined;

    if (forceRefresh) {
      removeCachedAnalysis(curMatch.id);
    } else {
      const isConfigured = Boolean(activeModelInfoRef.current.isConfigured);
      const cached = getCachedAnalysis(curMatch.id, curMatch, modelToUse, isConfigured);
      if (cached?.aiReport) {
        if (!isConfigured || cached.aiReport.aiAvailable !== false) {
          setAiReport(cached.aiReport);
          if (cached.enrichedMatch) {
            setEnrichedMatch(prev => ({ ...prev, ...cached.enrichedMatch }));
          }
          setLoadingAi(false);
          return;
        }
      }
    }

    const requestId = ++aiRequestId.current;
    const fingerprint = computeMatchFingerprint(curMatch);
    setLoadingAi(true);
    try {
      const storedAi = getStoredAiConfig();
      let resolvedProvider = storedAi?.provider || 'custom';
      if (resolvedProvider === 'openrouter') resolvedProvider = 'custom';
      const defaultUrl = PROVIDER_PRESETS[resolvedProvider]?.defaultBaseUrl || 'https://vyceai.com/v1';
      let resolvedBaseUrl = storedAi?.baseUrl || defaultUrl;
      if (resolvedBaseUrl.includes('openrouter.ai')) resolvedBaseUrl = defaultUrl;
      let resolvedModel = modelToUse || storedAi?.selectedModel || PROVIDER_PRESETS[resolvedProvider]?.defaultModel || 'deepseek-v4.1';
      if (resolvedModel.includes('openrouter')) resolvedModel = 'deepseek-v4.1';

      const aiConfigPayload = (storedAi && storedAi.apiKey && storedAi.apiKey.length >= 4) ? {
        provider: resolvedProvider,
        apiKey: storedAi.apiKey,
        baseUrl: resolvedBaseUrl,
        selectedModel: resolvedModel
      } : undefined;

      const res = await fetch(`/api/matches/${curMatch.id}/ai-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ 
          forceRefresh,
          model: modelToUse,
          aiConfig: aiConfigPayload
        })
      });
      const data = await res.json();
      if (requestId !== aiRequestId.current || fingerprint !== computeMatchFingerprint(matchRef.current)) return;
      if (data.success) {
        let updatedReport = null;
        let updatedMatch = null;
        if (data.report) {
          setAiReport(data.report);
          updatedReport = data.report;
        }
        if (data.match) {
          setEnrichedMatch(prev => {
            const merged = { ...prev, ...data.match };
            updatedMatch = merged;
            return merged;
          });
        }
        setCachedAnalysis(curMatch.id, curMatch, {
          aiReport: updatedReport || data.report,
          enrichedMatch: updatedMatch || data.match || curMatch,
          model: modelToUse
        });
      }
    } catch (err) {
      console.error('Error fetching AI analysis:', err);
    } finally {
      if (requestId === aiRequestId.current && fingerprint === computeMatchFingerprint(matchRef.current)) setLoadingAi(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const loadActiveModel = async () => {
      const storedAi = getStoredAiConfig();
      try {
        const res = await fetch('/api/settings/active-model');
        const data = await res.json();
        if (active && data.success) {
          const info = {
            provider: data.provider || storedAi?.provider || 'custom',
            selectedModel: data.selectedModel || storedAi?.selectedModel || 'deepseek-v4.1',
            modelName: data.modelName || 'DeepSeek V4.1 Flash',
            isConfigured: Boolean(data.isConfigured || storedAi?.isConfigured || (storedAi?.apiKey && storedAi.apiKey.length >= 4))
          };
          setActiveModelInfo(info);
        }
      } catch {
        if (active && storedAi) {
          const info = {
            provider: storedAi.provider || 'custom',
            selectedModel: storedAi.selectedModel || 'deepseek-v4.1',
            modelName: storedAi.modelName || 'DeepSeek V4.1 Flash',
            isConfigured: Boolean(storedAi.isConfigured || (storedAi.apiKey && storedAi.apiKey.length >= 4))
          };
          setActiveModelInfo(info);
        }
      }
    };
    loadActiveModel();

    const handleSettingsUpdated = (e) => {
      if (e.detail?.selectedModel) {
        const newModel = e.detail.selectedModel;
        const info = {
          selectedModel: newModel,
          modelName: e.detail.modelName || newModel,
          provider: e.detail.provider || 'custom',
          isConfigured: e.detail.isConfigured ?? true
        };
        setActiveModelInfo(info);
        clearAllAnalysisCache();
        fetchAiAnalysis(true, newModel);
      }
    };
    window.addEventListener('ai-settings-updated', handleSettingsUpdated);
    return () => {
      active = false;
      window.removeEventListener('ai-settings-updated', handleSettingsUpdated);
    };
  }, [fetchAiAnalysis]);

  const runMonteCarloSimulation = useCallback(() => {
    setSimulating(true);
    sounds.playRadarScan();
    setTimeout(() => {
      setCustomSim(calculateMatchSimulation(m, true));
      setSimulating(false);
    }, 450);
  }, [m]);

  useEffect(() => {
    let active = true;
    const curMatch = matchRef.current;
    if (!curMatch?.id) return;
    const cached = getCachedAnalysis(curMatch.id, curMatch);

    async function loadDetails() {
      try {
        setLoadingDetails(true);
        const res = await fetch(`/api/matches/${curMatch.id}`, { credentials: 'same-origin' });
        if (res.ok) {
          const data = await res.json();
          if (active && data.success && data.match) {
            setEnrichedMatch(prev => {
              const merged = { ...prev, ...data.match };
              setCachedAnalysis(curMatch.id, curMatch, {
                enrichedMatch: merged
              });
              return merged;
            });
          }
        }
      } catch (err) {
        console.warn('Error loading match details:', err);
      } finally {
        if (active) setLoadingDetails(false);
      }
    }

    if (!cached?.enrichedMatch) {
      loadDetails();
    }

    if (!cached?.aiReport) {
      fetchAiAnalysis(false);
    }

    return () => {
      active = false;
    };
    // currentFingerprint accurately tracks all real sports changes while ignoring background polling timestamps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.id, currentFingerprint, fetchAiAnalysis]);

  if (!match) return null;


  // Compute 10-match H2H historical statistics
  const h2hList = m.h2h || [];
  const homeWins = h2hList.filter(h => h.winner === m.homeTeam?.name || h.winner === m.homeTeam?.shortName || (h.home === m.homeTeam?.name && parseInt(h.score?.split('-')[0], 10) > parseInt(h.score?.split('-')[1], 10))).length;
  const awayWins = h2hList.filter(h => h.winner === m.awayTeam?.name || h.winner === m.awayTeam?.shortName || (h.away === m.awayTeam?.name && parseInt(h.score?.split('-')[1], 10) > parseInt(h.score?.split('-')[0], 10))).length;
  const draws = h2hList.filter(h => h.winner === 'Draw' || h.winner === 'Empate' || parseInt(h.score?.split('-')[0], 10) === parseInt(h.score?.split('-')[1], 10)).length;

  const h2hHomeWinPct = h2hList.length > 0 ? Math.round((homeWins / h2hList.length) * 100) : 0;
  const h2hDrawPct = h2hList.length > 0 ? Math.round((draws / h2hList.length) * 100) : 0;
  const h2hAwayWinPct = h2hList.length > 0 ? Math.round((awayWins / h2hList.length) * 100) : 0;


  const over25H2HCount = h2hList.filter(h => {
    const parts = (h.score || '').split('-').map(s => parseInt(s.trim(), 10));
    return (parts[0] + parts[1]) > 2;
  }).length;
  const over25H2HPct = h2hList.length > 0 ? Math.round((over25H2HCount / h2hList.length) * 100) : 0;

  const hasCornersData = h2hList.some(h => h.totalCorners != null);
  const hasCardsData = h2hList.some(h => h.yellowCards != null);
  const hasFoulsData = h2hList.some(h => h.totalFouls != null);

  const avgH2HCorners = hasCornersData ? (h2hList.reduce((acc, h) => acc + (h.totalCorners || 0), 0) / h2hList.filter(h => h.totalCorners != null).length).toFixed(1) : '-';
  const avgH2HYellowCards = hasCardsData ? (h2hList.reduce((acc, h) => acc + (h.yellowCards || 0), 0) / h2hList.filter(h => h.yellowCards != null).length).toFixed(1) : '-';
  const _avgH2HFouls = hasFoulsData ? (h2hList.reduce((acc, h) => acc + (h.totalFouls || 0), 0) / h2hList.filter(h => h.totalFouls != null).length).toFixed(1) : '-';

  const homeDetailed = calculateTeamDetailedStats(m.homeTeam, true, m);
  const awayDetailed = calculateTeamDetailedStats(m.awayTeam, false, m);
  const diff = calculateDifferential(homeDetailed, awayDetailed, m);

  const tabs = [
    { id: 'ai_report', label: 'Pronóstico IA & Picks', icon: <FileText className="w-3.5 h-3.5 text-sky-400" /> },
    { id: 'h2h', label: `Cara a Cara (${h2hList.length} Partidos)`, icon: <Users className="w-3.5 h-3.5 text-amber-400" /> },
    { id: 'stats', label: 'Estadísticas & Análisis de Equipos', icon: <BarChart2 className="w-3.5 h-3.5 text-emerald-400" /> },
    { id: 'simulator', label: 'Distribución de marcadores', icon: <Cpu className="w-3.5 h-3.5 text-indigo-400" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      
      <div className="relative w-full max-w-4xl bg-[#0c1017] border border-sky-500/30 rounded-2xl overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.8)] my-8">
        
        {/* Header Ribbon */}
        <div className="bg-[#101622] border-b border-white/10 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <span className="text-xl">{m.leagueFlag}</span>
            <div>
              <h3 className="font-bold text-sm md:text-base text-white flex items-center space-x-2">
                <span>{m.leagueName}</span>
                <span className="text-[10px] font-mono bg-sky-500/20 text-sky-300 border border-sky-500/30 px-1.5 py-0.2 rounded font-bold">
                  PRO AI REPORT
                </span>
              </h3>
              <p className="text-xs font-mono text-slate-400">
                {m.venue} • {new Date(m.kickoff).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsScanning(!isScanning)}
              className="px-2.5 py-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 rounded-lg text-xs font-mono flex items-center space-x-1 transition cursor-pointer"
            >
              <Target className="w-3.5 h-3.5 animate-pulse" />
              <span>{isScanning ? 'Cerrar Radar' : 'Radar Táctico'}</span>
            </button>

            <button
              aria-label="Cerrar panel" onClick={() => { sounds.playClick(); onClose(); }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Dynamic Radar Scanner Overlay if active */}
        {isScanning && (
          <div className="p-4 border-b border-white/10">
            <RadarScanner 
              matchTitle={`${m.homeTeam?.name} vs ${m.awayTeam?.name}`}
              onScanComplete={() => setIsScanning(false)}
            />
          </div>
        )}

        {/* Matchup Header Banner */}
        <div className="px-6 py-4 bg-[#0e131e] border-b border-white/5">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 max-w-2xl mx-auto">
            
            {/* Team 1 */}
            <div className="flex flex-col-reverse sm:flex-row items-center gap-2 text-center sm:text-right min-w-0 justify-end">
              <div>
                <p className="font-bold text-base md:text-lg text-white font-sans">
                  {m.homeTeam?.name}
                </p>
                <p className="text-xs font-mono text-sky-400">
                  Local{m.homeTeam?.position ? ` • #${m.homeTeam.position} (${m.homeTeam.points ?? 0} pts)` : ''}
                </p>
              </div>
              <img src={m.homeTeam?.logo} alt={m.homeTeam?.name} className="w-11 h-11 object-contain filter drop-shadow" />
            </div>

            {/* Center Status / Score */}
            <div className="px-1 sm:px-6 text-center">
              <div className="bg-[#141b29] border border-white/10 px-4 py-2 rounded-xl shadow-inner">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                  {m.status === 'LIVE' ? (m.liveMinute ? `En Vivo · ${m.liveMinute}'` : 'En Vivo') : m.status === 'FINISHED' ? 'Resultado Final' : 'Marcador más probable'}
                </span>
                <span className="text-2xl font-black font-mono text-white tracking-wider">
                  {m.status === 'LIVE' 
                    ? `${m.liveScore?.home ?? m.finalScore?.home ?? 0} - ${m.liveScore?.away ?? m.finalScore?.away ?? 0}`
                    : m.status === 'FINISHED'
                    ? `${m.finalScore?.home ?? m.liveScore?.home ?? 0} - ${m.finalScore?.away ?? m.liveScore?.away ?? 0}`
                    : getCoherentPredictedScore(m, aiReport?.predictedScore || m.model?.predictedScore || m.aiPick?.predictedScore)}
                </span>
              </div>
            </div>

            {/* Team 2 */}
            <div className="flex flex-col sm:flex-row items-center gap-2 text-center sm:text-left min-w-0 justify-start">
              <img src={m.awayTeam?.logo} alt={m.awayTeam?.name} className="w-11 h-11 object-contain filter drop-shadow" />
              <div>
                <p className="font-bold text-base md:text-lg text-white font-sans">
                  {m.awayTeam?.name}
                </p>
                <p className="text-xs font-mono text-indigo-400">
                  Visita{m.awayTeam?.position ? ` • #${m.awayTeam.position} (${m.awayTeam.points ?? 0} pts)` : ''}
                </p>
              </div>
            </div>

          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center space-x-1 px-6 pt-3 border-b border-white/10 bg-[#0a0d14] overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { sounds.playClick(); setActiveTab(tab.id); }}
              className={`flex items-center space-x-2 px-4 py-2.5 border-b-2 text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
                activeTab === tab.id
                  ? 'border-sky-400 text-sky-300 bg-sky-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          
          {/* TAB 1: AI REPORT & PICKS */}
          {activeTab === 'ai_report' && (
            <div className="space-y-5">
              
              {/* Estado del Procesamiento de IA / Motor Cuantitativo */}
              <div className={`p-4 rounded-xl border transition-all duration-300 relative overflow-hidden ${
                loadingAi
                  ? 'bg-gradient-to-r from-sky-950/50 via-[#0c1424] to-sky-900/40 border-sky-500/40 shadow-[0_0_25px_rgba(56,189,248,0.15)]'
                  : aiReport?.aiAvailable
                    ? 'bg-gradient-to-r from-emerald-950/40 via-[#0d1622] to-sky-950/30 border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.12)]'
                    : 'bg-[#101622] border-white/10'
              }`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 relative z-10">
                  <div className="flex items-center space-x-3 min-w-0">
                    {loadingAi ? (
                      <div className="relative flex items-center justify-center shrink-0">
                        <span className="animate-ping absolute inline-flex h-8 w-8 rounded-full bg-sky-400 opacity-30"></span>
                        <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-300 shadow-[0_0_15px_rgba(56,189,248,0.3)]">
                          <RotateCw className="w-4 h-4 animate-spin text-sky-400" />
                        </div>
                      </div>
                    ) : aiReport?.aiAvailable ? (
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300 shrink-0 shadow-[0_0_15px_rgba(16,185,129,0.25)]">
                        <Sparkles className="w-4 h-4 text-emerald-400" />
                      </div>
                    ) : (
                      <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 shrink-0">
                        <Cpu className="w-4 h-4 text-slate-400" />
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span className="text-xs font-bold font-sans tracking-wide text-white">
                          {loadingAi
                            ? 'Procesando Análisis con IA...'
                            : aiReport?.aiAvailable
                              ? 'Pronóstico IA: Procesado y Verificado'
                              : 'Análisis Cuantitativo Institucional'}
                        </span>
                        
                        {loadingAi && (
                          <span className="px-2 py-0.5 rounded-full bg-sky-500/20 border border-sky-400/40 text-sky-300 text-[10px] font-mono font-bold animate-pulse flex items-center space-x-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping"></span>
                            <span>CARGANDO DATOS</span>
                          </span>
                        )}

                        {!loadingAi && aiReport?.aiAvailable && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-mono font-bold flex items-center space-x-1 shadow-[0_0_8px_rgba(16,185,129,0.2)]">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span>IA ACTIVA ({aiReport.modelUsed || activeModelInfo.selectedModel || 'deepseek-v4.1'})</span>
                          </span>
                        )}

                        {!loadingAi && !aiReport?.aiAvailable && (
                          <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-400 text-[10px] font-mono font-medium">
                            MODO ESTADÍSTICO
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-300 font-mono mt-1 line-clamp-2">
                        {loadingAi
                          ? `Conectando con ${activeModelInfo.selectedModel || 'deepseek-v4.1'} • Cruzando probabilidades Poisson y métricas de temporada...`
                          : aiReport?.aiAvailable
                            ? `Motor: ${aiReport.modelUsed || activeModelInfo.selectedModel || 'deepseek-v4.1'} • Análisis fundamentado en hechos oficiales verificables.`
                            : (aiReport?.aiStatus || 'Pronóstico calculado mediante modelo matemático Poisson sobre estadísticas de temporada.')}
                      </p>
                    </div>
                  </div>

                  {/* Botón de reintento/regeneración: disponible si no está activa la IA o para el Owner */}
                  {(!aiReport?.aiAvailable || effectiveIsOwner) && (
                    <div className="flex items-center space-x-2 shrink-0 sm:self-center self-end">
                      <button
                        onClick={() => fetchAiAnalysis(true)}
                        disabled={loadingAi}
                        className="px-3 py-1.5 bg-gradient-to-r from-sky-500/20 to-emerald-500/20 hover:from-sky-500/30 hover:to-emerald-500/30 text-sky-200 border border-sky-400/40 rounded-lg text-xs font-mono font-semibold transition-all shadow-[0_0_12px_rgba(56,189,248,0.15)] flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                        title={effectiveIsOwner ? "Control de Administrador / Owner" : "Reintentar análisis con IA"}
                      >
                        <RotateCw className={`w-3.5 h-3.5 ${loadingAi ? 'animate-spin text-sky-400' : ''}`} />
                        <span>{loadingAi ? 'Procesando...' : (aiReport?.aiAvailable ? 'Regenerar con IA' : 'Reintentar con IA')}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <VerifiedPicks match={m} onAddToParlay={onAddToParlay} oddsFormat={oddsFormat} />
              <OverUnderGroupedSection match={m} homeStats={homeDetailed} awayStats={awayDetailed} diff={diff} />
              {/* Narrative Analysis & AI Breakdown */}
              <div className="bg-[#111723] rounded-xl p-5 border border-white/5 space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                  <h5 className="font-bold text-xs uppercase tracking-wide text-sky-400 font-mono flex items-center space-x-2">
                    <span>⚡</span>
                    <span>Análisis Táctico Especializado & Inteligencia Predictiva</span>
                  </h5>
                  {aiReport?.aiAvailable && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                      VERIFICADO 100%
                    </span>
                  )}
                </div>

                {aiReport?.analysisSections ? (
                  <div className="space-y-3.5">
                    {/* Sección 1: Verificación de Datos Reales */}
                    <div className="bg-[#0c1017] p-3.5 rounded-xl border border-sky-500/20">
                      <span className="text-[11px] font-mono font-bold text-sky-300 uppercase tracking-wider block mb-1.5 flex items-center space-x-1.5">
                        <span>📊</span>
                        <span>Verificación Cuantitativa de Datos Oficiales:</span>
                      </span>
                      <p className="text-xs text-slate-300 font-sans leading-relaxed">
                        {aiReport.analysisSections.dataVerification}
                      </p>
                    </div>

                    {/* Sección 2: Análisis de Goles y Tendencia */}
                    <div className="bg-[#0c1017] p-3.5 rounded-xl border border-emerald-500/20">
                      <span className="text-[11px] font-mono font-bold text-emerald-300 uppercase tracking-wider block mb-1.5 flex items-center space-x-1.5">
                        <span>⚽</span>
                        <span>Dinámica de Goles (+1.5, +2.5 & Ambos Anotan / BTTS):</span>
                      </span>
                      <p className="text-xs text-slate-300 font-sans leading-relaxed">
                        {aiReport.analysisSections.goalsAnalysis}
                      </p>
                    </div>

                    {/* Sección 3: Factores Positivos y Factores de Riesgo */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Factores Positivos (A favor) */}
                      <div className="bg-[#0c1017] p-3.5 rounded-xl border border-emerald-500/30 space-y-2">
                        <span className="text-[11px] font-mono font-bold text-emerald-400 uppercase tracking-wider block flex items-center space-x-1.5">
                          <span>🟢</span>
                          <span>Factores Positivos (A Favor):</span>
                        </span>
                        <ul className="space-y-1.5">
                          {(Array.isArray(aiReport.analysisSections.positiveFactors) ? aiReport.analysisSections.positiveFactors : []).map((f, i) => (
                            <li key={i} className="text-xs text-slate-300 flex items-start space-x-1.5 font-sans">
                              <span className="text-emerald-400 font-bold shrink-0">✓</span>
                              <span>{f}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Factores de Riesgo (En contra) */}
                      <div className="bg-[#0c1017] p-3.5 rounded-xl border border-amber-500/30 space-y-2">
                        <span className="text-[11px] font-mono font-bold text-amber-400 uppercase tracking-wider block flex items-center space-x-1.5">
                          <span>🔴</span>
                          <span>Factores de Riesgo / Cautela:</span>
                        </span>
                        <ul className="space-y-1.5">
                          {(Array.isArray(aiReport.analysisSections.negativeFactors) ? aiReport.analysisSections.negativeFactors : []).map((f, i) => (
                            <li key={i} className="text-xs text-slate-300 flex items-start space-x-1.5 font-sans">
                              <span className="text-amber-400 font-bold shrink-0">⚠</span>
                              <span>{f}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Sección 4: Veredicto Cuantitativo y de Apuesta */}
                    <div className="bg-gradient-to-r from-sky-950/40 via-[#0d1624] to-emerald-950/40 p-4 rounded-xl border border-sky-400/30 shadow-[0_0_15px_rgba(56,189,248,0.1)]">
                      <span className="text-[11px] font-mono font-bold text-sky-300 uppercase tracking-wider block mb-1.5 flex items-center space-x-1.5">
                        <span>🎯</span>
                        <span>Veredicto y Conclusión de Apuesta Cuantitativa:</span>
                      </span>
                      <p className="text-xs text-slate-200 font-sans leading-relaxed font-medium">
                        {aiReport.analysisSections.verdict}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-300 font-sans leading-relaxed whitespace-pre-line">
                    {aiReport?.narrativeAnalysis || match.aiPick?.summaryRationale}
                  </p>
                )}

                {aiReport?.tacticalKeypoints && (
                  <div className="mt-3.5 pt-3.5 border-t border-white/5 space-y-1.5">
                    <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                      Claves Fácticas del Algoritmo:
                    </span>
                    <ul className="space-y-1">
                      {aiReport.tacticalKeypoints.map((pt, i) => (
                        <li key={i} className="text-xs text-slate-300 flex items-start space-x-1.5 font-mono">
                          <span className="text-sky-400 font-bold shrink-0">•</span>
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TAB 2: H2H (CARA A CARA & PARTIDOS RECIENTES) */}
          {activeTab === 'h2h' && (
            <div className="space-y-4">
              
              {/* Rivalry Balance Bar if H2H exists */}
              {h2hList.length > 0 ? (
                <div className="bg-[#111723] rounded-xl p-4 border border-white/5 space-y-2.5 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm font-sans flex items-center space-x-2">
                      <Users className="w-4 h-4 text-amber-400" />
                      <span>Balance de los Últimos {h2hList.length} Enfrentamientos Directos</span>
                    </span>
                    <span className="text-slate-400 text-[11px]">
                      {h2hList.length} partidos oficiales
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-300">
                      <span className="font-bold text-sky-400">
                        {m.homeTeam?.name || 'Local'}: {homeWins} ({h2hHomeWinPct}%)
                      </span>
                      <span className="text-slate-400">
                        Empates: {draws} ({h2hDrawPct}%)
                      </span>
                      <span className="font-bold text-indigo-400">
                        {m.awayTeam?.name || 'Visita'}: {awayWins} ({h2hAwayWinPct}%)
                      </span>
                    </div>

                    <div className="h-2.5 w-full bg-[#182030] rounded-full overflow-hidden flex gap-0.5 p-0.5 border border-white/5">
                      <div style={{ width: `${h2hHomeWinPct}%` }} className="bg-sky-500 h-full rounded-l-full" />
                      <div style={{ width: `${h2hDrawPct}%` }} className="bg-slate-500 h-full" />
                      <div style={{ width: `${h2hAwayWinPct}%` }} className="bg-indigo-500 h-full rounded-r-full" />
                    </div>
                  </div>

                  {/* Quick Metric Pills */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-center text-[10px]">
                    <div className="bg-[#141b29] p-2 rounded-lg border border-white/5">
                      <span className="text-slate-400 block mb-0.5">Menos de 2.5 Goles</span>
                      <span className="text-sm font-bold text-emerald-400">{100 - over25H2HPct}% ({h2hList.length - over25H2HCount}/{h2hList.length})</span>
                    </div>
                    <div className="bg-[#141b29] p-2 rounded-lg border border-white/5">
                      <span className="text-slate-400 block mb-0.5">Más de 2.5 Goles</span>
                      <span className="text-sm font-bold text-sky-400">{over25H2HPct}% ({over25H2HCount}/{h2hList.length})</span>
                    </div>
                    <div className="bg-[#141b29] p-2 rounded-lg border border-white/5">
                      <span className="text-slate-400 block mb-0.5">Promedio Córners</span>
                      <span className="text-sm font-bold text-amber-300">
                        {avgH2HCorners !== '-' ? `${avgH2HCorners} 🚩` : 'N/D'}
                      </span>
                    </div>
                    <div className="bg-[#141b29] p-2 rounded-lg border border-white/5">
                      <span className="text-slate-400 block mb-0.5">Promedio Tarjetas</span>
                      <span className="text-sm font-bold text-rose-400">
                        {avgH2HYellowCards !== '-' ? `${avgH2HYellowCards} 🟨` : 'N/D'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center bg-[#111723] rounded-xl border border-white/5 space-y-2 font-mono">
                  <Users className="w-7 h-7 text-amber-400/60 mx-auto" />
                  <h5 className="font-bold text-xs uppercase tracking-wider text-slate-200 font-sans">
                    Sin Enfrentamientos Directos Recientes
                  </h5>
                  <p className="text-xs text-slate-400 max-w-md mx-auto font-sans">
                    No existen enfrentamientos directos oficiales registrados en temporadas recientes entre <strong>{m.homeTeam?.name}</strong> y <strong>{m.awayTeam?.name}</strong>. A continuación puedes consultar el historial de partidos recientes de cada equipo contra sus últimos rivales.
                  </p>
                </div>
              )}

              {/* Detailed Direct Matches Table if H2H exists */}
              {h2hList.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-white/5 bg-[#111723]">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-[#141b29] text-slate-400 border-b border-white/5">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Fecha</th>
                        <th className="py-2.5 px-3">Torneo</th>
                        <th className="py-2.5 px-3">Local</th>
                        <th className="py-2.5 px-3 text-center">Marcador</th>
                        <th className="py-2.5 px-3">Visitante</th>
                        <th className="py-2.5 px-3 text-center">Línea 2.5</th>
                        <th className="py-2.5 px-3 text-center">Corners</th>
                        <th className="py-2.5 px-3 text-center">Tarjetas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-300">
                      {h2hList.map((h, i) => {
                        const dateFormatted = h.date ? new Date(h.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
                        const scoreParts = (h.score || '').split('-').map(s => parseInt(s.trim(), 10));
                        const isOver25 = (scoreParts[0] + scoreParts[1]) > 2;
                        return (
                          <tr key={i} className="hover:bg-white/5 transition">
                            <td className="py-2.5 px-3 text-slate-500 font-bold">{i + 1}</td>
                            <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">{dateFormatted}</td>
                            <td className="py-2.5 px-3">
                              <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded truncate max-w-[140px] block">
                                {h.competition || 'Oficial'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-white">{h.home}</td>
                            <td className="py-2.5 px-3 text-center font-bold text-white bg-black/20 font-mono">
                              {h.score}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-white">{h.away}</td>
                            <td className="py-2.5 px-3 text-center">
                              <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                isOver25 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                              }`}>
                                {isOver25 ? '+2.5' : '-2.5'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center text-sky-300 font-mono">
                              {h.totalCorners != null ? `${h.totalCorners} 🚩` : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-center text-amber-400 font-mono">
                              {h.yellowCards != null ? `${h.yellowCards} 🟨` : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ÚLTIMOS PARTIDOS Y RIVALES RECIENTES DE CADA EQUIPO */}
              {Array.isArray(m.recentMatches) && m.recentMatches.length > 0 && (
                <div className="space-y-2.5 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs uppercase tracking-wider text-slate-200 font-mono flex items-center space-x-1.5">
                      <Activity className="w-3.5 h-3.5 text-sky-400" />
                      <span>Partidos Recientes de Cada Equipo (Contra Quién Jugaron)</span>
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Forma y resultados oficiales
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {m.recentMatches.map((group, gIdx) => (
                      <div key={gIdx} className="bg-[#111723] rounded-xl p-3.5 border border-white/5 space-y-2">
                        <span className="font-bold text-xs text-white flex items-center justify-between pb-1.5 border-b border-white/5 font-sans">
                          <span>{group.team}</span>
                          <span className="text-[10px] font-mono text-slate-400 font-normal">
                            Últimos {group.events?.length || 0} partidos
                          </span>
                        </span>

                        <div className="space-y-1.5 font-mono text-xs">
                          {(group.events || []).map((ev, eIdx) => {
                            const dateFormatted = ev.date ? new Date(ev.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : '-';
                            return (
                              <div key={eIdx} className="flex items-center justify-between p-2 rounded-lg bg-[#141b29] border border-white/5 text-[11px]">
                                <div className="flex items-center space-x-2 min-w-0">
                                  <span className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center shrink-0 ${
                                    ev.result === 'W' ? 'bg-emerald-600 text-white' : ev.result === 'D' ? 'bg-amber-600 text-white' : 'bg-rose-600 text-white'
                                  }`}>
                                    {ev.result || '-'}
                                  </span>
                                  <span className="text-slate-400 text-[10px] shrink-0">{ev.atVs}</span>
                                  <span className="text-slate-200 font-medium truncate max-w-[130px] sm:max-w-[160px]">
                                    {ev.opponent}
                                  </span>
                                </div>
                                <div className="flex items-center space-x-2 shrink-0">
                                  <span className="font-bold text-white font-mono bg-black/40 px-1.5 py-0.2 rounded border border-white/5">
                                    {ev.score || '-'}
                                  </span>
                                  <span className="text-[9.5px] text-slate-500">
                                    {dateFormatted}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 3: STATS, COMPARISON & TACTICAL PITCH */}
          {activeTab === 'stats' && (
            <div className="space-y-5">
              
              {/* 1. APARTADO DIFERENCIAL ENTRE LOS 2 EQUIPOS */}
              <DifferentialAnalysisSection
                homeStats={homeDetailed}
                awayStats={awayDetailed}
                diff={diff}
              />

              {/* 2. APARTADOS DETALLADOS DE CADA EQUIPO EN SU ESTADÍSTICA (PROBABILIDAD +5 Y -5 CÓRNERS) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h5 className="font-bold text-xs uppercase text-slate-300 font-mono flex items-center space-x-2">
                    <Shield className="w-3.5 h-3.5 text-sky-400" />
                    <span>Apartados Detallados por Equipo (Goles, Tarjetas & Córners)</span>
                  </h5>
                  <span className="text-[10px] font-mono text-slate-400">
                    Datos históricos y estimaciones
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TeamDetailedStatsCard stats={homeDetailed} isHome={true} />
                  <TeamDetailedStatsCard stats={awayDetailed} isHome={false} />
                </div>
              </div>

              <HalfGoalsSection match={m} />

              {/* 3. AGRUPACIÓN SIMÉTRICA: LADO OVERS (+) VS LADO UNDERS (-) */}
              <OverUnderGroupedSection
                match={m}
                homeStats={homeDetailed}
                awayStats={awayDetailed}
                diff={diff}
              />

              {/* 4. HEAD-TO-HEAD COMPARATIVE METRIC BARS */}
              <div className="bg-[#111723] rounded-xl p-5 border border-white/5 space-y-3.5 font-mono text-xs">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <h5 className="font-bold text-xs uppercase text-slate-200 font-sans flex items-center space-x-2">
                    <BarChart2 className="w-4 h-4 text-emerald-400" />
                    <span>Comparativa Visual de Rendimiento en Temporada (Local vs Visita)</span>
                  </h5>
                  <div className="flex items-center space-x-4 text-[11px]">
                    <span className="text-sky-400 font-bold">{m.homeTeam?.shortName}</span>
                    <span className="text-indigo-400 font-bold">{m.awayTeam?.shortName}</span>
                  </div>
                </div>

                {/* Metric 1: Goles por partido */}
                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>{displayNumber(homeDetailed.avgGF, 2)}</span>
                    <span className="text-slate-400 text-[11px]">Promedio Goles a Favor / 90min</span>
                    <span>{displayNumber(awayDetailed.avgGF, 2)}</span>
                  </div>
                  <div className="h-2 w-full bg-[#182030] rounded-full overflow-hidden flex gap-0.5">
                    <div style={{ width: `${(homeDetailed.avgGF / (homeDetailed.avgGF + awayDetailed.avgGF || 1)) * 100}%` }} className="h-full bg-sky-500" />
                    <div style={{ width: `${(awayDetailed.avgGF / (homeDetailed.avgGF + awayDetailed.avgGF || 1)) * 100}%` }} className="h-full bg-indigo-500" />
                  </div>
                </div>

                {/* Metric 2: Goles Concedidos */}
                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>{displayNumber(homeDetailed.avgGC, 2)}</span>
                    <span className="text-slate-400 text-[11px]">Promedio Goles Recibidos / 90min</span>
                    <span>{displayNumber(awayDetailed.avgGC, 2)}</span>
                  </div>
                  <div className="h-2 w-full bg-[#182030] rounded-full overflow-hidden flex gap-0.5">
                    <div style={{ width: `${(homeDetailed.avgGC / (homeDetailed.avgGC + awayDetailed.avgGC || 1)) * 100}%` }} className="h-full bg-sky-500" />
                    <div style={{ width: `${(awayDetailed.avgGC / (homeDetailed.avgGC + awayDetailed.avgGC || 1)) * 100}%` }} className="h-full bg-indigo-500" />
                  </div>
                </div>

                {/* Metric 3: Tiros de Esquina */}
                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>{displayNumber(homeDetailed.avgCorners)} 🚩</span>
                    <span className="text-slate-400 text-[11px]">Promedio de Córners a Favor</span>
                    <span>{displayNumber(awayDetailed.avgCorners)} 🚩</span>
                  </div>
                  <div className="h-2 w-full bg-[#182030] rounded-full overflow-hidden flex gap-0.5">
                    <div style={{ width: `${(homeDetailed.avgCorners / (homeDetailed.avgCorners + awayDetailed.avgCorners || 1)) * 100}%` }} className="h-full bg-sky-500" />
                    <div style={{ width: `${(awayDetailed.avgCorners / (homeDetailed.avgCorners + awayDetailed.avgCorners || 1)) * 100}%` }} className="h-full bg-indigo-500" />
                  </div>
                </div>

                {/* Metric 4: Faltas Cometidas */}
                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>{displayNumber(homeDetailed.fouls)}</span>
                    <span className="text-slate-400 text-[11px]">Faltas Cometidas / Partido</span>
                    <span>{displayNumber(awayDetailed.fouls)}</span>
                  </div>
                  <div className="h-2 w-full bg-[#182030] rounded-full overflow-hidden flex gap-0.5">
                    <div style={{ width: `${(homeDetailed.fouls / (homeDetailed.fouls + awayDetailed.fouls || 1)) * 100}%` }} className="h-full bg-sky-500" />
                    <div style={{ width: `${(awayDetailed.fouls / (homeDetailed.fouls + awayDetailed.fouls || 1)) * 100}%` }} className="h-full bg-indigo-500" />
                  </div>
                </div>

                {/* Metric 5: Valla Invicta (Clean Sheet) % */}
                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>{displayNumber(homeDetailed.cleanSheetRate, 0)}%</span>
                    <span className="text-slate-400 text-[11px]">Tasa Valla Invicta (Clean Sheet) Temporada</span>
                    <span>{displayNumber(awayDetailed.cleanSheetRate, 0)}%</span>
                  </div>
                  <div className="h-2 w-full bg-[#182030] rounded-full overflow-hidden flex gap-0.5">
                    <div style={{ width: `${homeDetailed.cleanSheetRate}%` }} className="h-full bg-sky-500" />
                    <div style={{ width: `${awayDetailed.cleanSheetRate}%` }} className="h-full bg-indigo-500" />
                  </div>
                </div>
              </div>

              {/* 5. TACTICAL PITCH COMPONENT */}
              <LiveTacticalPitch match={m} />

            </div>
          )}

          {/* TAB 4: MONTE CARLO */}
          {activeTab === 'simulator' && (
            <div className="space-y-4 font-mono text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-white flex items-center space-x-2 font-sans">
                    <span>Distribución de marcadores</span>
                    <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/20 px-1.5 py-0.2 rounded font-bold">
                      POISSON
                    </span>
                  </h4>
                  <p className="text-slate-400 text-[11px] font-sans">
                    Probabilidades del mismo modelo de goles del partido.
                  </p>
                </div>
                <button
                  onClick={runMonteCarloSimulation}
                  disabled={simulating}
                  className="px-3 py-1 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 rounded-lg transition cursor-pointer flex items-center space-x-1"
                >
                  <RotateCw className={`w-3 h-3 ${simulating ? 'animate-spin' : ''}`} />
                  <span>{simulating ? 'Calculando...' : 'Re-ejecutar'}</span>
                </button>
              </div>

              {simulationData && (
                <div className="space-y-2.5 pt-2">
                  {Object.entries(simulationData).map(([score, prob], idx) => (
                    <div key={score} className="space-y-1">
                      <div className="flex justify-between">
                        <span className="font-bold text-slate-200">{score}</span>
                        <span className="text-sky-400 font-bold"><NumberCounter value={prob} suffix="%" decimals={1} /></span>
                      </div>
                      <div className="h-2 w-full bg-[#161c28] rounded-full overflow-hidden p-0.5 border border-white/5">
                        <div
                          style={{ width: `${prob}%` }}
                          className={`h-full rounded-full transition-all duration-700 ${
                            idx === 0 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : idx < 3 ? 'bg-sky-500' : 'bg-slate-600'
                          }`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
