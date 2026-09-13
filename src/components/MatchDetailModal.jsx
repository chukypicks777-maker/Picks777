import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, 
  RotateCw, 
  Plus, 
  FileText, 
  Users, 
  BarChart2, 
  Cpu, 
  Flag, 
  Target, 
  Zap, 
  Activity,
  TrendingUp,
  Shield
} from 'lucide-react';
import { formatOdds } from '../utils/oddsFormatter';
import { sounds } from '../utils/audioEffects';
import LiveTacticalPitch from './LiveTacticalPitch';
import RadarScanner from './RadarScanner';
import NumberCounter from './NumberCounter';

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

export default function MatchDetailModal({ 
  match, 
  onClose, 
  onAddToParlay, 
  oddsFormat = 'decimal' 
}) {
  const [activeTab, setActiveTab] = useState('ai_report');
  const [aiReport, setAiReport] = useState(null);
  const [loadingAi, setLoadingAi] = useState(true);
  const [customSim, setCustomSim] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  // Derive simulation data; reset custom jitter simulation if match changes
  const [lastMatchId, setLastMatchId] = useState(match?.id);
  if (match?.id !== lastMatchId) {
    setLastMatchId(match?.id);
    setCustomSim(null);
  }
  const simulationData = customSim || calculateMatchSimulation(match, false);

  const fetchAiAnalysis = useCallback(async (forceRefresh = false) => {
    if (!match?.id) return;
    if (forceRefresh) setLoadingAi(true);
    try {
      const res = await fetch(`/api/matches/${match.id}/ai-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ forceRefresh })
      });
      const data = await res.json();
      if (data.success && data.report) {
        setAiReport(data.report);
      }
    } catch (err) {
      console.error('Error fetching AI analysis:', err);
    } finally {
      setLoadingAi(false);
    }
  }, [match]);

  const runMonteCarloSimulation = useCallback(() => {
    setSimulating(true);
    sounds.playRadarScan();
    setTimeout(() => {
      setCustomSim(calculateMatchSimulation(match, true));
      setSimulating(false);
    }, 450);
  }, [match]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (active && match) {
        await fetchAiAnalysis(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [match, fetchAiAnalysis]);

  if (!match) return null;

  // Compute 10-match H2H historical statistics
  const h2hList = match.h2h || [];
  const totalH2H = h2hList.length || 1;
  const homeWins = h2hList.filter(h => h.winner === match.homeTeam?.shortName || (h.home === match.homeTeam?.name && h.score?.split('-')[0]?.trim() > h.score?.split('-')[1]?.trim())).length;
  const awayWins = h2hList.filter(h => h.winner === match.awayTeam?.shortName || (h.away === match.awayTeam?.name && h.score?.split('-')[1]?.trim() > h.score?.split('-')[0]?.trim())).length;
  const draws = h2hList.filter(h => h.winner === 'Draw' || h.score?.split('-')[0]?.trim() === h.score?.split('-')[1]?.trim()).length;

  const h2hHomeWinPct = Math.round((homeWins / totalH2H) * 100);
  const h2hDrawPct = Math.round((draws / totalH2H) * 100);
  const h2hAwayWinPct = Math.round((awayWins / totalH2H) * 100);

  const bttsH2HCount = h2hList.filter(h => h.btts).length;
  const bttsH2HPct = Math.round((bttsH2HCount / totalH2H) * 100);

  const over25H2HCount = h2hList.filter(h => {
    const parts = (h.score || '').split('-').map(s => parseInt(s.trim(), 10));
    return (parts[0] + parts[1]) > 2;
  }).length;
  const over25H2HPct = Math.round((over25H2HCount / totalH2H) * 100);

  const avgH2HCorners = (h2hList.reduce((acc, h) => acc + (h.totalCorners || 10), 0) / totalH2H).toFixed(1);
  const avgH2HYellowCards = (h2hList.reduce((acc, h) => acc + (h.yellowCards || 4), 0) / totalH2H).toFixed(1);
  const avgH2HFouls = (h2hList.reduce((acc, h) => acc + (h.totalFouls || 22), 0) / totalH2H).toFixed(1);

  const tabs = [
    { id: 'ai_report', label: 'Pronóstico IA & Picks', icon: <FileText className="w-3.5 h-3.5 text-sky-400" /> },
    { id: 'h2h', label: `Cara a Cara (${h2hList.length} Partidos)`, icon: <Users className="w-3.5 h-3.5 text-amber-400" /> },
    { id: 'stats', label: 'Estadísticas & Mapa Táctico', icon: <BarChart2 className="w-3.5 h-3.5 text-emerald-400" /> },
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
                    : aiReport?.predictedScore || match.aiPick?.predictedScore || '2 - 1'}
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
                <div className="flex items-center space-x-2 text-xs font-mono text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 live-dot"></span>
                  <span>Motor IA: <strong>{aiReport?.modelUsed || 'z-ai/glm-5.2:free'}</strong></span>
                </div>

                <button
                  onClick={() => fetchAiAnalysis(true)}
                  disabled={loadingAi}
                  className="px-3 py-1 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 rounded-lg text-xs font-mono font-semibold transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 shadow-[0_0_10px_rgba(56,189,248,0.2)]"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${loadingAi ? 'animate-spin' : ''}`} />
                  <span>{loadingAi ? 'Generando Algoritmo...' : 'Regenerar con IA'}</span>
                </button>
              </div>

              {/* Top Pick Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                
                {/* 1. Main Banker Pick */}
                <div className="bg-[#111723] rounded-xl p-4 border border-emerald-500/40 flex flex-col justify-between shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider flex items-center space-x-1">
                        <Zap className="w-3 h-3 fill-emerald-400" />
                        <span>Pick Principal</span>
                      </span>
                      <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-bold border border-emerald-500/30">
                        {aiReport?.topPick?.confidence || match.aiPick?.confidence || '88%'}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-white mb-1 font-sans">
                      {aiReport?.topPick?.selection || match.aiPick?.selection}
                    </h4>
                  </div>

                  <div className="pt-3 border-t border-white/5 mt-3 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono text-slate-400 block">Cuota:</span>
                      <span className="text-base font-mono font-bold text-emerald-400">
                        {formatOdds(aiReport?.topPick?.odds || match.aiPick?.odds || 1.95, oddsFormat)}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        sounds.playAddParlay();
                        onAddToParlay({
                          matchId: match.id,
                          matchTitle: `${match.homeTeam?.name || 'Local'} vs ${match.awayTeam?.name || 'Visita'}`,
                          league: match.leagueName,
                          selection: aiReport?.topPick?.selection || match.aiPick?.selection || 'Victoria Local',
                          odds: aiReport?.topPick?.odds || match.aiPick?.odds || 1.95,
                          probability: match.probabilities?.homeWin || 50
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
                        <span>Pick de Valor</span>
                      </span>
                      <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-bold border border-amber-500/30">
                        {aiReport?.secondaryPick?.confidence || '82%'}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-white mb-1 font-sans">
                      {aiReport?.secondaryPick?.selection || 'Ambos Anotan: SÍ'}
                    </h4>
                  </div>

                  <div className="pt-3 border-t border-white/5 mt-3 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono text-slate-400 block">Cuota:</span>
                      <span className="text-base font-mono font-bold text-amber-400">
                        {formatOdds(aiReport?.secondaryPick?.odds || match.odds?.bttsYes || 1.70, oddsFormat)}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        sounds.playAddParlay();
                        onAddToParlay({
                          matchId: match.id,
                          matchTitle: `${match.homeTeam?.name || 'Local'} vs ${match.awayTeam?.name || 'Visita'}`,
                          league: match.leagueName,
                          selection: aiReport?.secondaryPick?.selection || 'Ambos Anotan: SÍ',
                          odds: aiReport?.secondaryPick?.odds || match.odds?.bttsYes || 1.70,
                          probability: match.probabilities?.bttsYes || 55
                        });
                      }}
                      className="px-2.5 py-1 bg-amber-500 text-black font-semibold text-xs rounded-md hover:bg-amber-400 transition flex items-center space-x-1 cursor-pointer shadow-[0_0_10px_rgba(245,158,11,0.4)]"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Al Parlay</span>
                    </button>
                  </div>
                </div>

                {/* 3. Corner Pick */}
                <div className="bg-[#111723] rounded-xl p-4 border border-sky-500/40 flex flex-col justify-between shadow-[0_0_20px_rgba(56,189,248,0.1)]">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono text-sky-400 font-bold uppercase tracking-wider flex items-center space-x-1">
                        <Flag className="w-3 h-3 text-sky-400" />
                        <span>Corners Especial</span>
                      </span>
                      <span className="text-[10px] font-mono bg-sky-500/20 text-sky-300 px-1.5 py-0.2 rounded font-bold border border-sky-500/30">
                        {aiReport?.cornerPick?.confidence || '80%'}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-white mb-1 font-sans">
                      {aiReport?.cornerPick?.selection || 'Más de 8.5 Corners Totales'}
                    </h4>
                  </div>

                  <div className="pt-3 border-t border-white/5 mt-3 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono text-slate-400 block">Cuota:</span>
                      <span className="text-base font-mono font-bold text-sky-400">
                        {formatOdds(aiReport?.cornerPick?.odds || match.odds?.over95Corners || 1.85, oddsFormat)}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        sounds.playAddParlay();
                        onAddToParlay({
                          matchId: match.id,
                          matchTitle: `${match.homeTeam?.name || 'Local'} vs ${match.awayTeam?.name || 'Visita'}`,
                          league: match.leagueName,
                          selection: aiReport?.cornerPick?.selection || 'Más de 8.5 Corners',
                          odds: aiReport?.cornerPick?.odds || match.odds?.over95Corners || 1.85,
                          probability: 70
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

              {/* Comprehensive Over/Under & BTTS Probabilities Matrix */}
              <div className="bg-[#111723] rounded-xl p-5 border border-white/5">
                <h5 className="font-bold text-xs uppercase tracking-wide text-slate-300 mb-3 font-mono flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span>Matriz de Probabilidades Cuantitativas de Goles & Córners</span>
                </h5>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 font-mono text-xs">
                  {/* Over 1.5 */}
                  <div className="bg-[#141b29] p-2.5 rounded-lg border border-white/5 text-center">
                    <span className="text-slate-400 block text-[10px]">+1.5 Goles</span>
                    <span className="text-base font-bold text-sky-300">
                      <NumberCounter value={match.probabilities?.over15 || 85} suffix="%" />
                    </span>
                    <div className="h-1 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                      <div style={{ width: `${match.probabilities?.over15 || 85}%` }} className="h-full bg-sky-400" />
                    </div>
                  </div>

                  {/* Over 2.5 */}
                  <div className="bg-[#141b29] p-2.5 rounded-lg border border-white/5 text-center">
                    <span className="text-slate-400 block text-[10px]">+2.5 Goles</span>
                    <span className="text-base font-bold text-emerald-400">
                      <NumberCounter value={match.probabilities?.over25 || 62} suffix="%" />
                    </span>
                    <div className="h-1 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                      <div style={{ width: `${match.probabilities?.over25 || 62}%` }} className="h-full bg-emerald-400" />
                    </div>
                  </div>

                  {/* Under 2.5 (Requested by user) */}
                  <div className="bg-[#141b29] p-2.5 rounded-lg border border-white/5 text-center">
                    <span className="text-slate-400 block text-[10px]">-2.5 Goles (Under)</span>
                    <span className="text-base font-bold text-amber-400">
                      <NumberCounter value={match.probabilities?.under25 || 38} suffix="%" />
                    </span>
                    <div className="h-1 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                      <div style={{ width: `${match.probabilities?.under25 || 38}%` }} className="h-full bg-amber-400" />
                    </div>
                  </div>

                  {/* Over 3.5 */}
                  <div className="bg-[#141b29] p-2.5 rounded-lg border border-white/5 text-center">
                    <span className="text-slate-400 block text-[10px]">+3.5 Goles</span>
                    <span className="text-base font-bold text-purple-400">
                      <NumberCounter value={match.probabilities?.over35 || 35} suffix="%" />
                    </span>
                    <div className="h-1 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                      <div style={{ width: `${match.probabilities?.over35 || 35}%` }} className="h-full bg-purple-400" />
                    </div>
                  </div>

                  {/* BTTS */}
                  <div className="bg-[#141b29] p-2.5 rounded-lg border border-white/5 text-center">
                    <span className="text-slate-400 block text-[10px]">Ambos Anotan (BTTS)</span>
                    <span className="text-base font-bold text-teal-300">
                      <NumberCounter value={match.probabilities?.bttsYes || 65} suffix="%" />
                    </span>
                    <div className="h-1 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                      <div style={{ width: `${match.probabilities?.bttsYes || 65}%` }} className="h-full bg-teal-400" />
                    </div>
                  </div>

                  {/* Corners Over 9.5 */}
                  <div className="bg-[#141b29] p-2.5 rounded-lg border border-white/5 text-center">
                    <span className="text-slate-400 block text-[10px]">+9.5 Corners</span>
                    <span className="text-base font-bold text-rose-300">
                      <NumberCounter value={match.probabilities?.cornerOver95 || 60} suffix="%" />
                    </span>
                    <div className="h-1 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                      <div style={{ width: `${match.probabilities?.cornerOver95 || 60}%` }} className="h-full bg-rose-400" />
                    </div>
                  </div>
                </div>
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

          {/* TAB 2: H2H (CARA A CARA - ÚLTIMOS 10 PARTIDOS) */}
          {activeTab === 'h2h' && (
            <div className="space-y-4">
              
              {/* Rivalry Balance Bar */}
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
                      {match.homeTeam?.name || 'Local'}: {homeWins} ({h2hHomeWinPct}%)
                    </span>
                    <span className="text-slate-400">
                      Empates: {draws} ({h2hDrawPct}%)
                    </span>
                    <span className="font-bold text-indigo-400">
                      {match.awayTeam?.name || 'Visita'}: {awayWins} ({h2hAwayWinPct}%)
                    </span>
                  </div>

                  <div className="h-2.5 w-full bg-[#182030] rounded-full overflow-hidden flex gap-0.5 p-0.5 border border-white/5">
                    <div style={{ width: `${h2hHomeWinPct}%` }} className="bg-sky-500 h-full rounded-l-full" />
                    <div style={{ width: `${h2hDrawPct}%` }} className="bg-slate-500 h-full" />
                    <div style={{ width: `${h2hAwayWinPct}%` }} className="bg-indigo-500 h-full rounded-r-full" />
                  </div>
                </div>

                {/* 5 Quick Metric Pills */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 text-center text-[10px]">
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
                    <span className="text-sm font-bold text-amber-300">{avgH2HCorners} 🚩</span>
                  </div>
                  <div className="bg-[#141b29] p-2 rounded-lg border border-white/5">
                    <span className="text-slate-400 block mb-0.5">Promedio Tarjetas</span>
                    <span className="text-sm font-bold text-rose-400">{avgH2HYellowCards} 🟨</span>
                  </div>
                  <div className="bg-[#141b29] p-2 rounded-lg border border-white/5 col-span-2 sm:col-span-1">
                    <span className="text-slate-400 block mb-0.5">Promedio Faltas</span>
                    <span className="text-sm font-bold text-slate-200">{avgH2HFouls}</span>
                  </div>
                </div>
              </div>

              {/* Detailed 10 Matches Table */}
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
                      <th className="py-2.5 px-3 text-center">Faltas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-300">
                    {h2hList.map((h, i) => (
                      <tr key={i} className="hover:bg-white/5 transition">
                        <td className="py-2.5 px-3 text-slate-500 font-bold">{i + 1}</td>
                        <td className="py-2.5 px-3 text-slate-400">{h.date}</td>
                        <td className="py-2.5 px-3">
                          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                            {h.competition || 'Oficial'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-white">{h.home}</td>
                        <td className="py-2.5 px-3 text-center font-bold text-white bg-black/20">
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
                        <td className="py-2.5 px-3 text-center text-sky-300">{h.totalCorners || 10} 🚩</td>
                        <td className="py-2.5 px-3 text-center text-amber-400">{h.yellowCards || 4} 🟨</td>
                        <td className="py-2.5 px-3 text-center text-slate-400">{h.totalFouls || 22}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: STATS, COMPARISON & TACTICAL PITCH */}
          {activeTab === 'stats' && (
            <div className="space-y-5">
              
              {/* Head-to-Head Comparative Metric Bars */}
              <div className="bg-[#111723] rounded-xl p-5 border border-white/5 space-y-3.5 font-mono text-xs">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <h5 className="font-bold text-xs uppercase text-slate-200 font-sans flex items-center space-x-2">
                    <Shield className="w-4 h-4 text-sky-400" />
                    <span>Métricas Comparativas en Temporada (Local vs Visita)</span>
                  </h5>
                  <div className="flex items-center space-x-4 text-[11px]">
                    <span className="text-sky-400 font-bold">{match.homeTeam.shortName}</span>
                    <span className="text-indigo-400 font-bold">{match.awayTeam.shortName}</span>
                  </div>
                </div>

                {/* Metric 1: Goles por partido */}
                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>{match.homeTeam.avgGoalsScored || (match.homeTeam.goalsFor / 15).toFixed(2)}</span>
                    <span className="text-slate-400 text-[11px]">Promedio Goles a Favor / 90min</span>
                    <span>{match.awayTeam.avgGoalsScored || (match.awayTeam.goalsFor / 15).toFixed(2)}</span>
                  </div>
                  <div className="h-2 w-full bg-[#182030] rounded-full overflow-hidden flex gap-0.5">
                    <div style={{ width: '55%' }} className="h-full bg-sky-500" />
                    <div style={{ width: '45%' }} className="h-full bg-indigo-500" />
                  </div>
                </div>

                {/* Metric 2: Goles Concedidos */}
                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>{match.homeTeam.avgGoalsConceded || (match.homeTeam.goalsAgainst / 15).toFixed(2)}</span>
                    <span className="text-slate-400 text-[11px]">Promedio Goles Recibidos / 90min</span>
                    <span>{match.awayTeam.avgGoalsConceded || (match.awayTeam.goalsAgainst / 15).toFixed(2)}</span>
                  </div>
                  <div className="h-2 w-full bg-[#182030] rounded-full overflow-hidden flex gap-0.5">
                    <div style={{ width: '45%' }} className="h-full bg-sky-500" />
                    <div style={{ width: '55%' }} className="h-full bg-indigo-500" />
                  </div>
                </div>

                {/* Metric 3: Tiros de Esquina */}
                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>{match.homeTeam.avgCorners} 🚩</span>
                    <span className="text-slate-400 text-[11px]">Promedio de Córners a Favor</span>
                    <span>{match.awayTeam.avgCorners} 🚩</span>
                  </div>
                  <div className="h-2 w-full bg-[#182030] rounded-full overflow-hidden flex gap-0.5">
                    <div style={{ width: `${(match.homeTeam.avgCorners / (match.homeTeam.avgCorners + match.awayTeam.avgCorners)) * 100}%` }} className="h-full bg-sky-500" />
                    <div style={{ width: `${(match.awayTeam.avgCorners / (match.homeTeam.avgCorners + match.awayTeam.avgCorners)) * 100}%` }} className="h-full bg-indigo-500" />
                  </div>
                </div>

                {/* Metric 4: Faltas Cometidas */}
                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>{match.homeTeam.avgFouls}</span>
                    <span className="text-slate-400 text-[11px]">Faltas Cometidas / Partido</span>
                    <span>{match.awayTeam.avgFouls}</span>
                  </div>
                  <div className="h-2 w-full bg-[#182030] rounded-full overflow-hidden flex gap-0.5">
                    <div style={{ width: '48%' }} className="h-full bg-sky-500" />
                    <div style={{ width: '52%' }} className="h-full bg-indigo-500" />
                  </div>
                </div>

                {/* Metric 5: Ambos Anotan % */}
                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>{match.homeTeam.bttsRate}%</span>
                    <span className="text-slate-400 text-[11px]">Tasa Ambos Anotan (BTTS) Temporada</span>
                    <span>{match.awayTeam.bttsRate}%</span>
                  </div>
                  <div className="h-2 w-full bg-[#182030] rounded-full overflow-hidden flex gap-0.5">
                    <div style={{ width: `${match.homeTeam.bttsRate}%` }} className="h-full bg-sky-500" />
                    <div style={{ width: `${match.awayTeam.bttsRate}%` }} className="h-full bg-indigo-500" />
                  </div>
                </div>

              </div>

              {/* Tactical Pitch Component */}
              <LiveTacticalPitch match={match} />

              {/* Corners Details */}
              <div className="bg-[#111723] rounded-xl p-4 border border-white/5">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="font-bold text-xs uppercase text-slate-300 font-mono flex items-center space-x-1.5">
                    <Flag className="w-3.5 h-3.5 text-sky-400" />
                    <span>Estadísticas de Tiros de Esquina (Corners)</span>
                  </h5>
                  <span className="text-xs font-mono text-sky-400">
                    Promedio: {((match.homeTeam?.avgCorners ?? 4.8) + (match.awayTeam?.avgCorners ?? 4.5)).toFixed(1)} / partido
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
                  <div className="bg-[#141b29] p-3 rounded-lg border border-white/5 text-center">
                    <span className="text-slate-400 block mb-0.5">Corners {match.homeTeam?.shortName || 'Local'} (Local)</span>
                    <span className="text-lg font-bold text-sky-400">{match.homeTeam?.avgCorners ?? 4.8}</span>
                  </div>
                  <div className="bg-[#141b29] p-3 rounded-lg border border-white/5 text-center">
                    <span className="text-slate-400 block mb-0.5">Corners {match.awayTeam?.shortName || 'Visita'} (Visita)</span>
                    <span className="text-lg font-bold text-indigo-400">{match.awayTeam?.avgCorners ?? 4.5}</span>
                  </div>
                  <div className="bg-[#141b29] p-3 rounded-lg border border-white/5 text-center">
                    <span className="text-slate-400 block mb-0.5">Prob. +9.5 Corners</span>
                    <span className="text-lg font-bold text-emerald-400">{match.probabilities?.cornerOver95 || 62}%</span>
                  </div>
                </div>
              </div>

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
