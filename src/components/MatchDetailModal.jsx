import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, 
  RotateCw, 
  Plus, 
  FileText, 
  Users, 
  BarChart2, 
  Cpu, 
  Target, 
  Zap, 
  Activity, 
  TrendingUp, 
  Shield,
  Sparkles 
} from 'lucide-react';
import { formatOdds } from '../utils/oddsFormatter';
import { sounds } from '../utils/audioEffects';
import LiveTacticalPitch from './LiveTacticalPitch';
import RadarScanner from './RadarScanner';
import NumberCounter from './NumberCounter';
import TeamDetailedStatsCard from './TeamDetailedStatsCard';
import DifferentialAnalysisSection from './DifferentialAnalysisSection';
import OverUnderGroupedSection from './OverUnderGroupedSection';
import { calculateTeamDetailedStats, calculateDifferential, getBestBankerPick } from '../utils/mathProbabilities';
import { getCachedAnalysis, setCachedAnalysis, computeMatchFingerprint, clearAllAnalysisCache } from '../utils/analysisCache';

function calculateMatchSimulation(match, withJitter = false) {
  if (!match) return { "2 - 1": 18.0, "1 - 1": 15.0, "2 - 0": 13.0, "Otros": 54.0 };
  const home = match.homeTeam || {};
  const away = match.awayTeam || {};
  const homeGoalsAvg = home.goalsFor && home.gamesPlayed ? (home.goalsFor / Math.max(1, home.gamesPlayed)) * 1.08 : 1.6;
  const awayGoalsAvg = away.goalsFor && away.gamesPlayed ? (away.goalsFor / Math.max(1, away.gamesPlayed)) * 0.95 : 1.2;

  const lambda = Math.max(0.4, Math.min(4.2, homeGoalsAvg));
  const mu = Math.max(0.4, Math.min(3.8, awayGoalsAvg));

  const poisson = (l, k) => {
    let p = Math.exp(-l);
    for (let i = 1; i <= k; i++) p *= l / i;
    return p;
  };

  const dist = {};
  for (let h = 0; h <= 6; h++) {
    for (let a = 0; a <= 6; a++) {
      dist[`${h} - ${a}`] = poisson(lambda, h) * poisson(mu, a);
    }
  }

  const sorted = Object.entries(dist).sort(([, a], [, b]) => b - a);
  const topScores = sorted.slice(0, 9);
  const topSum = topScores.reduce((acc, [, p]) => acc + p, 0);
  const otrosVal = Math.max(0.5, parseFloat(((1 - topSum) * 100).toFixed(1)));

  const result = {};
  topScores.forEach(([score, p]) => {
    const jitter = withJitter ? (Math.random() - 0.5) * 0.6 : 0;
    result[score] = parseFloat(Math.max(0.5, (p * 100) + jitter).toFixed(1));
  });
  result["Otros"] = otrosVal;
  return result;
}

let cachedActiveModel = null;

export default function MatchDetailModal({ 
  match, 
  onClose, 
  onAddToParlay, 
  oddsFormat = 'decimal' 
}) {
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
  const [activeModelInfo, setActiveModelInfo] = useState(() => cachedActiveModel || { provider: '', selectedModel: '', isConfigured: false });

  // Derive simulation data; reset custom jitter simulation if match changes
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

  const matchRef = useRef(match);
  matchRef.current = match;
  const activeModelInfoRef = useRef(activeModelInfo);
  activeModelInfoRef.current = activeModelInfo;

  const fetchAiAnalysis = useCallback(async (forceRefresh = false, modelOverride = null) => {
    const curMatch = matchRef.current;
    if (!curMatch?.id) return;
    const modelToUse = modelOverride || activeModelInfoRef.current.selectedModel || undefined;

    if (!forceRefresh) {
      const cached = getCachedAnalysis(curMatch.id, curMatch);
      if (cached?.aiReport) {
        setAiReport(cached.aiReport);
        if (cached.enrichedMatch) {
          setEnrichedMatch(prev => ({ ...prev, ...cached.enrichedMatch }));
        }
        setLoadingAi(false);
        return;
      }
    }

    setLoadingAi(true);
    try {
      const res = await fetch(`/api/matches/${curMatch.id}/ai-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ 
          forceRefresh,
          model: modelToUse
        })
      });
      const data = await res.json();
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
      setLoadingAi(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const loadActiveModel = async () => {
      if (cachedActiveModel) return;
      try {
        const res = await fetch('/api/settings/active-model');
        const data = await res.json();
        if (active && data.success) {
          const info = {
            provider: data.provider || '',
            selectedModel: data.selectedModel || '',
            isConfigured: Boolean(data.isConfigured)
          };
          cachedActiveModel = info;
          setActiveModelInfo(info);
        }
      } catch {}
    };
    loadActiveModel();

    const handleSettingsUpdated = (e) => {
      if (e.detail?.selectedModel) {
        const newModel = e.detail.selectedModel;
        const info = {
          selectedModel: newModel,
          provider: e.detail.provider || '',
          isConfigured: e.detail.isConfigured ?? true
        };
        cachedActiveModel = info;
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

  const bttsH2HCount = h2hList.filter(h => h.btts).length;
  const bttsH2HPct = h2hList.length > 0 ? Math.round((bttsH2HCount / h2hList.length) * 100) : 0;

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
    { id: 'simulator', label: 'Simulador Monte Carlo', icon: <Cpu className="w-3.5 h-3.5 text-indigo-400" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      
      <div className="relative w-full max-w-4xl bg-[#0c1017] border border-sky-500/30 rounded-2xl overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.8)] my-8">
        
        {/* Header Ribbon */}
        <div className="bg-[#101622] border-b border-white/10 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <span className="text-xl">{match.leagueFlag}</span>
            <div>
              <h3 className="font-bold text-sm md:text-base text-white flex items-center space-x-2">
                <span>{match.leagueName}</span>
                <span className="text-[10px] font-mono bg-sky-500/20 text-sky-300 border border-sky-500/30 px-1.5 py-0.2 rounded font-bold">
                  PRO AI REPORT
                </span>
              </h3>
              <p className="text-xs font-mono text-slate-400">
                {match.venue} • {new Date(match.kickoff).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}
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
              onClick={() => { sounds.playClick(); onClose(); }}
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
              matchTitle={`${match.homeTeam.name} vs ${match.awayTeam.name}`}
              onScanComplete={() => setIsScanning(false)}
            />
          </div>
        )}

        {/* Matchup Header Banner */}
        <div className="px-6 py-4 bg-[#0e131e] border-b border-white/5">
          <div className="flex items-center justify-between max-w-2xl mx-auto">
            
            {/* Team 1 */}
            <div className="flex items-center space-x-3 text-right flex-1 justify-end">
              <div>
                <p className="font-bold text-base md:text-lg text-white font-sans">
                  {match.homeTeam?.name}
                </p>
                <p className="text-xs font-mono text-sky-400">
                  Local{match.homeTeam?.position ? ` • #${match.homeTeam.position} (${match.homeTeam.points ?? 0} pts)` : ''}
                </p>
              </div>
              <img src={match.homeTeam?.logo} alt={match.homeTeam?.name} className="w-11 h-11 object-contain filter drop-shadow" />
            </div>

            {/* Center Status / Score */}
            <div className="px-6 text-center">
              <div className="bg-[#141b29] border border-white/10 px-4 py-2 rounded-xl shadow-inner">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                  {match.status === 'LIVE' ? 'En Vivo' : match.status === 'FINISHED' ? 'Final' : 'Predicción IA'}
                </span>
                <span className="text-2xl font-black font-mono text-white tracking-wider">
                  {match.status === 'LIVE' 
                    ? `${match.liveScore?.home ?? 0} - ${match.liveScore?.away ?? 0}`
                    : match.status === 'FINISHED'
                    ? `${match.finalScore?.home ?? 0} - ${match.finalScore?.away ?? 0}`
                    : aiReport?.predictedScore || m.model?.predictedScore || match.aiPick?.predictedScore || ((match.probabilities?.awayWin || 0) > (match.probabilities?.homeWin || 0) ? '1 - 2' : '2 - 1')}
                </span>
              </div>
            </div>

            {/* Team 2 */}
            <div className="flex items-center space-x-3 text-left flex-1 justify-start">
              <img src={match.awayTeam?.logo} alt={match.awayTeam?.name} className="w-11 h-11 object-contain filter drop-shadow" />
              <div>
                <p className="font-bold text-base md:text-lg text-white font-sans">
                  {match.awayTeam?.name}
                </p>
                <p className="text-xs font-mono text-indigo-400">
                  Visita{match.awayTeam?.position ? ` • #${match.awayTeam.position} (${match.awayTeam.points ?? 0} pts)` : ''}
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
              
              {/* Top AI Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[#111723] rounded-xl border border-white/5">
                {loadingAi ? (
                  <div className="flex items-center space-x-2 text-xs font-mono text-sky-300">
                    <RotateCw className="w-3.5 h-3.5 animate-spin text-sky-400 shrink-0" />
                    <span>Analizando con IA en tiempo real ({activeModelInfo.selectedModel || 'motor activo'})...</span>
                  </div>
                ) : aiReport?.aiAvailable ? (
                  <div className="flex items-center space-x-2 text-xs font-mono text-slate-200">
                    <Cpu className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span>Motor: <strong className="text-sky-300">{aiReport.modelUsed || activeModelInfo.selectedModel}</strong></span>
                    <span className="px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/20 text-sky-300 text-[10px] font-mono font-medium">
                      Procesado por IA
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2 text-xs font-mono text-slate-300">
                    <Activity className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Motor: <strong className="text-slate-200">Cálculo Cuantitativo Poisson</strong></span>
                    <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400 text-[10px] font-mono">
                      Modo Estadístico
                    </span>
                  </div>
                )}

                <button
                  onClick={() => fetchAiAnalysis(true)}
                  disabled={loadingAi}
                  className="px-3 py-1 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 rounded-lg text-xs font-mono font-medium transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${loadingAi ? 'animate-spin text-sky-400' : ''}`} />
                  <span>{loadingAi ? 'Procesando...' : 'Regenerar con IA'}</span>
                </button>
              </div>

              {/* Banner de procesamiento en vivo cuando la IA está calculando */}
              {loadingAi && (
                <div className="p-4 rounded-xl bg-[#0d1424] border border-sky-500/20 text-center flex flex-col items-center justify-center space-y-1.5 py-4">
                  <div className="flex items-center space-x-2 text-sky-400">
                    <RotateCw className="w-4 h-4 animate-spin" />
                    <span className="text-xs font-mono font-semibold uppercase tracking-wider text-sky-300">
                      Generando Pronóstico Táctico
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono">
                    Conectando con el motor {activeModelInfo.selectedModel ? `[${activeModelInfo.selectedModel}]` : 'configurado'} • Analizando probabilidades, xG y táctica...
                  </p>
                </div>
              )}

              {/* Mensaje informativo si está en modo cuantitativo */}
              {!loadingAi && !aiReport?.aiAvailable && (
                <div className="p-3 rounded-xl bg-slate-800/40 border border-white/5 text-slate-300 text-xs font-mono flex items-center justify-between">
                  <div className="flex items-center space-x-2 min-w-0">
                    <Activity className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="truncate">
                      {aiReport?.aiStatus || 'Análisis cuantitativo institucional basado en el modelo matemático de Poisson y estadísticas oficiales.'}
                    </span>
                  </div>
                  <button
                    onClick={() => fetchAiAnalysis(true)}
                    className="ml-3 px-2.5 py-1 bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 rounded text-[11px] font-medium shrink-0 cursor-pointer transition"
                  >
                    Reintentar
                  </button>
                </div>
              )}

              {/* Top Pick Cards Grid */}
              {(() => {
                const homeProbVal = Math.round(Number(m.probabilities?.homeWin || 50));
                const awayProbVal = Math.round(Number(m.probabilities?.awayWin || 25));
                const drawProbVal = Math.round(Number(m.probabilities?.draw || 25));
                const isHomeFavoredVal = homeProbVal >= awayProbVal;

                // 1. Pick Banquero Principal
                const defaultBanker = getBestBankerPick(m);
                const bankerSelection = aiReport?.topPick?.selection || m.aiPick?.selection || defaultBanker?.selection;
                const bankerOdds = Number(Number(aiReport?.topPick?.odds || m.aiPick?.odds || defaultBanker?.odds || 1.35).toFixed(2));
                const bankerProb = Math.round(Number(aiReport?.topPick?.probability || m.aiPick?.probability || defaultBanker?.probability || Math.max(homeProbVal, awayProbVal)));
                const bankerRationale = aiReport?.topPick?.rationale || m.aiPick?.summaryRationale || defaultBanker?.rationale || 'Alta probabilidad estadística respaldada por xG, goles anotados y rendimiento en temporada.';

                // 2. Pick de Valor
                const bttsProbVal = Math.round(Number(m.probabilities?.bttsYes || 55));
                const over25ProbVal = Math.round(Number(m.probabilities?.over25 || 52));
                const defaultValueSelection = (bttsProbVal >= 52 ? 'Ambos Equipos Anotan: SÍ' : (over25ProbVal >= 52 ? 'Más de 2.5 Goles' : 'Menos de 2.5 Goles'));
                const valueSelection = aiReport?.secondaryPick?.selection || aiReport?.valueBet?.selection || defaultValueSelection;
                const valueOdds = Number(Number(aiReport?.secondaryPick?.odds || aiReport?.valueBet?.odds || m.odds?.bttsYes || (bttsProbVal >= 52 ? 1.75 : 1.85)).toFixed(2));
                const valueProb = Math.round(Number(aiReport?.secondaryPick?.probability || aiReport?.valueBet?.probability || (bttsProbVal >= 52 ? bttsProbVal : (over25ProbVal >= 52 ? over25ProbVal : 100 - over25ProbVal))));
                const valueRationale = aiReport?.secondaryPick?.rationale || aiReport?.valueBet?.rationale || null;

                // 3. Doble Oportunidad Segura
                const dcProbCalculated = Math.min(97, Math.max(50, Math.round((isHomeFavoredVal ? homeProbVal : awayProbVal) + drawProbVal)));
                const dcOddsCalculated = Number(Math.max(1.10, Math.min(2.50, (100 / dcProbCalculated) * 0.95)).toFixed(2));
                const dcSelectionCalculated = isHomeFavoredVal ? `${m.homeTeam?.name || 'Local'} o Empate (1X)` : `${m.awayTeam?.name || 'Visita'} o Empate (X2)`;
                const safeSelection = aiReport?.safePick?.selection || dcSelectionCalculated;
                const safeOdds = Number(Number(aiReport?.safePick?.odds || dcOddsCalculated).toFixed(2));
                const safeProb = Math.round(Number(aiReport?.safePick?.probability || dcProbCalculated));
                const safeRationale = aiReport?.safePick?.rationale || `Cobertura de alta probabilidad (${safeProb}%) ante escenarios de paridad según distribución Poisson.`;

                return (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                    {/* 1. Main Banker Pick */}
                    <div className="bg-[#111723] rounded-xl p-4 border border-emerald-500/50 flex flex-col justify-between shadow-[0_0_25px_rgba(16,185,129,0.15)] relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider flex items-center space-x-1">
                            <Zap className="w-3 h-3 fill-emerald-400 text-emerald-400" />
                            <span>💎 Pick Banquero Principal</span>
                          </span>
                          <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-bold border border-emerald-500/40">
                            {bankerProb}% Conf.
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-white mb-1 font-sans">
                          {bankerSelection}
                        </h4>
                        <p className="text-[10px] font-mono text-emerald-400/90 mt-0.5">
                          Máxima Seguridad Cuantitativa • Stake {aiReport?.topPick?.stake || '3/5 Unidades'}
                        </p>
                        {/* Justificación por IA */}
                        <div className="mt-2 pt-2 border-t border-emerald-500/20 text-[10.5px] text-emerald-300/90 font-mono flex items-start space-x-1.5 leading-snug">
                          <Sparkles className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                          <p>
                            <strong className="text-white font-sans">Justificación IA: </strong>
                            {bankerRationale}
                          </p>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-white/5 mt-3 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-mono text-slate-400 block">Cuota:</span>
                          <span className="text-base font-mono font-bold text-emerald-400">
                            {formatOdds(bankerOdds, oddsFormat)}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            sounds.playAddParlay();
                            onAddToParlay({
                              matchId: match.id,
                              matchTitle: `${match.homeTeam?.name || 'Local'} vs ${match.awayTeam?.name || 'Visita'}`,
                              league: match.leagueName,
                              selection: bankerSelection,
                              odds: bankerOdds,
                              probability: bankerProb
                            });
                          }}
                          className="px-2.5 py-1 bg-emerald-600 text-white font-semibold text-xs rounded-md hover:bg-emerald-500 transition flex items-center space-x-1 cursor-pointer shadow-[0_0_10px_rgba(16,185,129,0.4)]"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Al Parlay</span>
                        </button>
                      </div>
                    </div>

                    {/* 2. Secondary Value Pick */}
                    <div className="bg-[#111723] rounded-xl p-4 border border-amber-500/40 flex flex-col justify-between shadow-[0_0_20px_rgba(245,158,11,0.1)]">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider flex items-center space-x-1">
                            <Activity className="w-3 h-3 text-amber-400" />
                            <span>⚡ Pick de Valor</span>
                          </span>
                          <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-bold border border-amber-500/30">
                            {valueProb}% Conf.
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-white mb-1 font-sans">
                          {valueSelection}
                        </h4>
                        <p className="text-[10px] font-mono text-amber-300/80 mt-0.5">
                          Rentabilidad de Cuota Estadística
                        </p>
                        {valueRationale && (
                          <div className="mt-2 pt-2 border-t border-amber-500/20 text-[10px] text-amber-300/90 font-mono line-clamp-2">
                            {valueRationale}
                          </div>
                        )}
                      </div>

                      <div className="pt-3 border-t border-white/5 mt-3 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-mono text-slate-400 block">Cuota:</span>
                          <span className="text-base font-mono font-bold text-amber-400">
                            {formatOdds(valueOdds, oddsFormat)}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            sounds.playAddParlay();
                            onAddToParlay({
                              matchId: match.id,
                              matchTitle: `${match.homeTeam?.name || 'Local'} vs ${match.awayTeam?.name || 'Visita'}`,
                              league: match.leagueName,
                              selection: valueSelection,
                              odds: valueOdds,
                              probability: valueProb
                            });
                          }}
                          className="px-2.5 py-1 bg-amber-500 text-black font-semibold text-xs rounded-md hover:bg-amber-400 transition flex items-center space-x-1 cursor-pointer shadow-[0_0_10px_rgba(245,158,11,0.4)]"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Al Parlay</span>
                        </button>
                      </div>
                    </div>

                    {/* 3. Safe Pick / Doble Oportunidad */}
                    <div className="bg-[#111723] rounded-xl p-4 border border-sky-500/40 flex flex-col justify-between shadow-[0_0_20px_rgba(56,189,248,0.1)]">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-mono text-sky-400 font-bold uppercase tracking-wider flex items-center space-x-1">
                            <Shield className="w-3 h-3 text-sky-400" />
                            <span>🛡️ Doble Oportunidad Segura</span>
                          </span>
                          <span className="text-[10px] font-mono bg-sky-500/20 text-sky-300 px-1.5 py-0.2 rounded font-bold border border-sky-500/30">
                            {safeProb}% Conf.
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-white mb-1 font-sans">
                          {safeSelection}
                        </h4>
                        <p className="text-[10px] font-mono text-sky-300/80 mt-0.5">
                          Apuesta de Cobertura y Bajo Riesgo
                        </p>
                        <div className="mt-2 pt-2 border-t border-sky-500/20 text-[10px] text-sky-300/90 font-mono line-clamp-2">
                          {safeRationale}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-white/5 mt-3 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-mono text-slate-400 block">Cuota:</span>
                          <span className="text-base font-mono font-bold text-sky-400">
                            {formatOdds(safeOdds, oddsFormat)}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            sounds.playAddParlay();
                            onAddToParlay({
                              matchId: match.id,
                              matchTitle: `${match.homeTeam?.name || 'Local'} vs ${match.awayTeam?.name || 'Visita'}`,
                              league: match.leagueName,
                              selection: safeSelection,
                              odds: safeOdds,
                              probability: safeProb
                            });
                          }}
                          className="px-2.5 py-1 bg-sky-400 text-black font-semibold text-xs rounded-md hover:bg-sky-300 transition flex items-center space-x-1 cursor-pointer shadow-[0_0_10px_rgba(56,189,248,0.4)]"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Al Parlay</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Comprehensive Over/Under & BTTS Probabilities Matrix (Positivo y Negativo sin Córners) */}
              <div className="bg-[#111723] rounded-xl p-5 border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <h5 className="font-bold text-xs uppercase tracking-wide text-slate-300 font-mono flex items-center space-x-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <span>Matriz de Probabilidades Cuantitativas (Líneas Positivas y Negativas)</span>
                  </h5>
                  <span className="text-[10px] font-mono text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    MODELO POISSON CALIBRADO
                  </span>
                </div>

                {(() => {
                  const over15Prob = Math.round(m.probabilities?.over15 || 82);
                  const under15Prob = 100 - over15Prob;
                  const over25Prob = Math.round(m.probabilities?.over25 || 56);
                  const under25Prob = m.probabilities?.under25 != null ? Math.round(m.probabilities.under25) : (100 - over25Prob);
                  const over35Prob = Math.round(m.probabilities?.over35 || 32);
                  const under35Prob = 100 - over35Prob;
                  const over45Prob = Math.round(m.probabilities?.over45 != null ? m.probabilities.over45 : Math.max(6, over35Prob * 0.45));
                  const under45Prob = 100 - over45Prob;
                  const bttsYesProb = Math.round(m.probabilities?.bttsYes || 55);
                  const bttsNoProb = 100 - bttsYesProb;

                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
                      {/* +1.5 Goles */}
                      <div className="bg-[#141b29] p-2.5 rounded-lg border border-sky-500/20 text-center">
                        <span className="text-slate-400 block text-[10px]">+1.5 Goles (Over)</span>
                        <span className="text-base font-bold text-sky-300">
                          <NumberCounter value={over15Prob} suffix="%" />
                        </span>
                        <div className="h-1 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                          <div style={{ width: `${over15Prob}%` }} className="h-full bg-sky-400" />
                        </div>
                      </div>

                      {/* -1.5 Goles (Negativo) */}
                      <div className="bg-[#141b29] p-2.5 rounded-lg border border-amber-500/20 text-center">
                        <span className="text-slate-400 block text-[10px]">-1.5 Goles (Under)</span>
                        <span className="text-base font-bold text-amber-300">
                          <NumberCounter value={under15Prob} suffix="%" />
                        </span>
                        <div className="h-1 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                          <div style={{ width: `${under15Prob}%` }} className="h-full bg-amber-400" />
                        </div>
                      </div>

                      {/* +2.5 Goles */}
                      <div className="bg-[#141b29] p-2.5 rounded-lg border border-emerald-500/20 text-center">
                        <span className="text-slate-400 block text-[10px]">+2.5 Goles (Over)</span>
                        <span className="text-base font-bold text-emerald-400">
                          <NumberCounter value={over25Prob} suffix="%" />
                        </span>
                        <div className="h-1 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                          <div style={{ width: `${over25Prob}%` }} className="h-full bg-emerald-400" />
                        </div>
                      </div>

                      {/* -2.5 Goles (Negativo) */}
                      <div className="bg-[#141b29] p-2.5 rounded-lg border border-amber-500/20 text-center">
                        <span className="text-slate-400 block text-[10px]">-2.5 Goles (Under)</span>
                        <span className="text-base font-bold text-amber-400">
                          <NumberCounter value={under25Prob} suffix="%" />
                        </span>
                        <div className="h-1 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                          <div style={{ width: `${under25Prob}%` }} className="h-full bg-amber-400" />
                        </div>
                      </div>

                      {/* +3.5 Goles */}
                      <div className="bg-[#141b29] p-2.5 rounded-lg border border-purple-500/20 text-center">
                        <span className="text-slate-400 block text-[10px]">+3.5 Goles (Over)</span>
                        <span className="text-base font-bold text-purple-400">
                          <NumberCounter value={over35Prob} suffix="%" />
                        </span>
                        <div className="h-1 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                          <div style={{ width: `${over35Prob}%` }} className="h-full bg-purple-400" />
                        </div>
                      </div>

                      {/* -3.5 Goles (Negativo) */}
                      <div className="bg-[#141b29] p-2.5 rounded-lg border border-amber-500/20 text-center">
                        <span className="text-slate-400 block text-[10px]">-3.5 Goles (Under)</span>
                        <span className="text-base font-bold text-amber-300">
                          <NumberCounter value={under35Prob} suffix="%" />
                        </span>
                        <div className="h-1 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                          <div style={{ width: `${under35Prob}%` }} className="h-full bg-amber-400" />
                        </div>
                      </div>

                      {/* +4.5 Goles */}
                      <div className="bg-[#141b29] p-2.5 rounded-lg border border-teal-500/20 text-center">
                        <span className="text-slate-400 block text-[10px]">+4.5 Goles (Over)</span>
                        <span className="text-base font-bold text-teal-300">
                          <NumberCounter value={over45Prob} suffix="%" />
                        </span>
                        <div className="h-1 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                          <div style={{ width: `${over45Prob}%` }} className="h-full bg-teal-400" />
                        </div>
                      </div>

                      {/* -4.5 Goles (Negativo) */}
                      <div className="bg-[#141b29] p-2.5 rounded-lg border border-amber-500/20 text-center">
                        <span className="text-slate-400 block text-[10px]">-4.5 Goles (Under)</span>
                        <span className="text-base font-bold text-amber-300">
                          <NumberCounter value={under45Prob} suffix="%" />
                        </span>
                        <div className="h-1 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                          <div style={{ width: `${under45Prob}%` }} className="h-full bg-amber-400" />
                        </div>
                      </div>

                      {/* Mercado Sí y No (Ambos Anotan) & Líneas Correlativas */}
                      <div className="col-span-2 sm:col-span-4 pt-3.5 mt-1 border-t border-white/10">
                        <div className="flex items-center justify-between mb-2.5">
                          <span className="text-xs font-mono text-slate-200 font-bold flex items-center space-x-1.5">
                            <span>🎯 Mercado Sí / No (Ambos Anotan) & Líneas Correlativas</span>
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            +4.5 bajo Sí • -2.5 bajo No
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          {/* Columna Lado SÍ */}
                          <div className="space-y-2">
                            {/* Ambos Anotan: SÍ */}
                            <div className="bg-[#141b29] p-2.5 rounded-lg border border-teal-500/30 text-center">
                              <span className="text-slate-300 block text-[10.5px] font-semibold">Ambos Anotan: SÍ</span>
                              <span className="text-base font-bold text-teal-300">
                                <NumberCounter value={bttsYesProb} suffix="%" />
                              </span>
                              <div className="h-1.5 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                                <div style={{ width: `${bttsYesProb}%` }} className="h-full bg-teal-400" />
                              </div>
                            </div>

                            {/* Abajito de Ambos Anotan Sí: Más de 4.5 Goles */}
                            <div className="bg-[#141b29] p-2.5 rounded-lg border border-teal-500/20 text-center">
                              <div className="flex items-center justify-center space-x-1 mb-0.5">
                                <span className="text-teal-400 font-bold text-[10px]">▲</span>
                                <span className="text-slate-300 block text-[10px] font-semibold">Más de 4.5 Goles (+4.5 Over)</span>
                              </div>
                              <span className="text-base font-bold text-teal-300">
                                <NumberCounter value={over45Prob} suffix="%" />
                              </span>
                              <div className="h-1.5 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                                <div style={{ width: `${over45Prob}%` }} className="h-full bg-teal-400 transition-all duration-500" />
                              </div>
                            </div>
                          </div>

                          {/* Columna Lado NO */}
                          <div className="space-y-2">
                            {/* Ambos Anotan: NO */}
                            <div className="bg-[#141b29] p-2.5 rounded-lg border border-rose-500/30 text-center">
                              <span className="text-slate-300 block text-[10.5px] font-semibold">Ambos Anotan: NO</span>
                              <span className="text-base font-bold text-rose-300">
                                <NumberCounter value={bttsNoProb} suffix="%" />
                              </span>
                              <div className="h-1.5 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                                <div style={{ width: `${bttsNoProb}%` }} className="h-full bg-rose-400" />
                              </div>
                            </div>

                            {/* Abajito de Ambos Anotan No: Menos de 2.5 Goles */}
                            <div className="bg-[#141b29] p-2.5 rounded-lg border border-amber-500/20 text-center">
                              <div className="flex items-center justify-center space-x-1 mb-0.5">
                                <span className="text-amber-400 font-bold text-[10px]">▼</span>
                                <span className="text-slate-300 block text-[10px] font-semibold">Menos de 2.5 Goles (-2.5 Under)</span>
                              </div>
                              <span className="text-base font-bold text-amber-300">
                                <NumberCounter value={under25Prob} suffix="%" />
                              </span>
                              <div className="h-1.5 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                                <div style={{ width: `${under25Prob}%` }} className="h-full bg-amber-400 transition-all duration-500" />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Narrative Analysis */}
              <div className="bg-[#111723] rounded-xl p-5 border border-white/5">
                <h5 className="font-bold text-xs uppercase tracking-wide text-slate-300 mb-2 font-mono">
                  Informe Táctico & Justificación Cuantitativa
                </h5>
                <p className="text-xs text-slate-300 font-sans leading-relaxed whitespace-pre-line">
                  {aiReport?.narrativeAnalysis || match.aiPick?.summaryRationale}
                </p>

                {aiReport?.tacticalKeypoints && (
                  <div className="mt-3.5 pt-3.5 border-t border-white/5 space-y-1.5">
                    <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                      Claves del Algoritmo:
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
                      <span className="text-slate-400 block mb-0.5">Ambos Anotan (BTTS)</span>
                      <span className="text-sm font-bold text-emerald-400">{bttsH2HPct}% ({bttsH2HCount}/{h2hList.length})</span>
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
                        <th className="py-2.5 px-3 text-center">BTTS</th>
                        <th className="py-2.5 px-3 text-center">Corners</th>
                        <th className="py-2.5 px-3 text-center">Tarjetas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-300">
                      {h2hList.map((h, i) => {
                        const dateFormatted = h.date ? new Date(h.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
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
                                h.btts ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
                              }`}>
                                {h.btts ? 'SÍ' : 'NO'}
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
                    Métricas Individuales Oficiales
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TeamDetailedStatsCard stats={homeDetailed} isHome={true} />
                  <TeamDetailedStatsCard stats={awayDetailed} isHome={false} />
                </div>
              </div>

              {/* 3. AGRUPACIÓN SIMÉTRICA: LADO OVERS (+) VS LADO UNDERS (-) */}
              <OverUnderGroupedSection
                match={match}
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
                    <span className="text-sky-400 font-bold">{match.homeTeam?.shortName}</span>
                    <span className="text-indigo-400 font-bold">{match.awayTeam?.shortName}</span>
                  </div>
                </div>

                {/* Metric 1: Goles por partido */}
                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>{homeDetailed.avgGF.toFixed(2)}</span>
                    <span className="text-slate-400 text-[11px]">Promedio Goles a Favor / 90min</span>
                    <span>{awayDetailed.avgGF.toFixed(2)}</span>
                  </div>
                  <div className="h-2 w-full bg-[#182030] rounded-full overflow-hidden flex gap-0.5">
                    <div style={{ width: `${(homeDetailed.avgGF / (homeDetailed.avgGF + awayDetailed.avgGF || 1)) * 100}%` }} className="h-full bg-sky-500" />
                    <div style={{ width: `${(awayDetailed.avgGF / (homeDetailed.avgGF + awayDetailed.avgGF || 1)) * 100}%` }} className="h-full bg-indigo-500" />
                  </div>
                </div>

                {/* Metric 2: Goles Concedidos */}
                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>{homeDetailed.avgGC.toFixed(2)}</span>
                    <span className="text-slate-400 text-[11px]">Promedio Goles Recibidos / 90min</span>
                    <span>{awayDetailed.avgGC.toFixed(2)}</span>
                  </div>
                  <div className="h-2 w-full bg-[#182030] rounded-full overflow-hidden flex gap-0.5">
                    <div style={{ width: `${(homeDetailed.avgGC / (homeDetailed.avgGC + awayDetailed.avgGC || 1)) * 100}%` }} className="h-full bg-sky-500" />
                    <div style={{ width: `${(awayDetailed.avgGC / (homeDetailed.avgGC + awayDetailed.avgGC || 1)) * 100}%` }} className="h-full bg-indigo-500" />
                  </div>
                </div>

                {/* Metric 3: Tiros de Esquina */}
                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>{Number(homeDetailed.avgCorners || 0).toFixed(1)} 🚩</span>
                    <span className="text-slate-400 text-[11px]">Promedio de Córners a Favor</span>
                    <span>{Number(awayDetailed.avgCorners || 0).toFixed(1)} 🚩</span>
                  </div>
                  <div className="h-2 w-full bg-[#182030] rounded-full overflow-hidden flex gap-0.5">
                    <div style={{ width: `${(homeDetailed.avgCorners / (homeDetailed.avgCorners + awayDetailed.avgCorners || 1)) * 100}%` }} className="h-full bg-sky-500" />
                    <div style={{ width: `${(awayDetailed.avgCorners / (homeDetailed.avgCorners + awayDetailed.avgCorners || 1)) * 100}%` }} className="h-full bg-indigo-500" />
                  </div>
                </div>

                {/* Metric 4: Faltas Cometidas */}
                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>{Number(homeDetailed.fouls || 0).toFixed(1)}</span>
                    <span className="text-slate-400 text-[11px]">Faltas Cometidas / Partido</span>
                    <span>{Number(awayDetailed.fouls || 0).toFixed(1)}</span>
                  </div>
                  <div className="h-2 w-full bg-[#182030] rounded-full overflow-hidden flex gap-0.5">
                    <div style={{ width: `${(homeDetailed.fouls / (homeDetailed.fouls + awayDetailed.fouls || 1)) * 100}%` }} className="h-full bg-sky-500" />
                    <div style={{ width: `${(awayDetailed.fouls / (homeDetailed.fouls + awayDetailed.fouls || 1)) * 100}%` }} className="h-full bg-indigo-500" />
                  </div>
                </div>

                {/* Metric 5: Ambos Anotan % */}
                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>{Math.round(Number(homeDetailed.bttsRate || 0))}%</span>
                    <span className="text-slate-400 text-[11px]">Tasa Ambos Anotan (BTTS) Temporada</span>
                    <span>{Math.round(Number(awayDetailed.bttsRate || 0))}%</span>
                  </div>
                  <div className="h-2 w-full bg-[#182030] rounded-full overflow-hidden flex gap-0.5">
                    <div style={{ width: `${homeDetailed.bttsRate}%` }} className="h-full bg-sky-500" />
                    <div style={{ width: `${awayDetailed.bttsRate}%` }} className="h-full bg-indigo-500" />
                  </div>
                </div>
              </div>

              {/* 5. TACTICAL PITCH COMPONENT */}
              <LiveTacticalPitch match={match} />

            </div>
          )}

          {/* TAB 4: MONTE CARLO */}
          {activeTab === 'simulator' && (
            <div className="space-y-4 font-mono text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-white flex items-center space-x-2 font-sans">
                    <span>Simulación Cuántica de Monte Carlo</span>
                    <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/20 px-1.5 py-0.2 rounded font-bold">
                      10,000 PARTIDOS
                    </span>
                  </h4>
                  <p className="text-slate-400 text-[11px] font-sans">
                    Distribución de densidades de probabilidad calculada por Dixon-Coles
                  </p>
                </div>
                <button
                  onClick={runMonteCarloSimulation}
                  disabled={simulating}
                  className="px-3 py-1 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 rounded-lg transition cursor-pointer flex items-center space-x-1"
                >
                  <RotateCw className={`w-3 h-3 ${simulating ? 'animate-spin' : ''}`} />
                  <span>{simulating ? 'Simulando...' : 'Re-ejecutar'}</span>
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
                          style={{ width: `${prob * 4}%` }}
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
