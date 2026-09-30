import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Sparkles, Square, RotateCw, CheckCircle2, Cpu, ShieldCheck } from 'lucide-react';
import { sounds } from '../utils/audioEffects';
import { isMatchAnalyzed, getBatchAnalyzedStatus, setCachedAnalysis, removeCachedAnalysis } from '../utils/analysisCache';
import { getStoredAiConfig } from '../utils/aiSettings';
import { PROVIDER_PRESETS } from '../constants/aiProviders';

const sessionAttemptedMatchIds = new Set();

export default function AutonomousAiBar({
  matches = [],
  onMatchAnalyzed,
  activeModelInfo = null,
  onToast = null,
  isOwner = false
}) {
  const [isRunning, setIsRunning] = useState(false);
  const [currentMatchTitle, setCurrentMatchTitle] = useState('');
  const [analysisVersion, setAnalysisVersion] = useState(0);
  const [autoRunOnLoad, setAutoRunOnLoad] = useState(() => {
    try {
      const saved = localStorage.getItem('picks777_auto_ai_pref');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const stopRequested = useRef(false);
  const runningRef = useRef(false);
  const matchesRef = useRef(matches);
  useEffect(() => {
    matchesRef.current = matches;
  }, [matches]);
  const attemptedMatchIdsRef = useRef(sessionAttemptedMatchIds);

  // Derive counts using getBatchAnalyzedStatus without synchronous setState inside effects
  const { analyzedCount, totalCount, pendingCount, isAllAnalyzed } = useMemo(() => {
    void analysisVersion;
    return getBatchAnalyzedStatus(matches);
  }, [matches, analysisVersion]);

  // Stable match IDs key to prevent unnecessary effect triggers on background feed polling
  const matchIdsKey = useMemo(() => {
    if (!Array.isArray(matches) || matches.length === 0) return '';
    return matches.map(m => m?.id).filter(Boolean).join(',');
  }, [matches]);

  const progressPercent = totalCount > 0 ? Math.round((analyzedCount / totalCount) * 100) : 0;

  const toggleAutoPref = () => {
    const next = !autoRunOnLoad;
    setAutoRunOnLoad(next);
    try {
      localStorage.setItem('picks777_auto_ai_pref', String(next));
    } catch {}
  };

  const executeAnalysisQueue = useCallback(async (forceAll = false) => {
    if (!isOwner || runningRef.current) return;
    const currentMatches = matchesRef.current;
    if (!Array.isArray(currentMatches) || currentMatches.length === 0) return;

    if (forceAll) {
      attemptedMatchIdsRef.current.clear();
    }

    runningRef.current = true;
    stopRequested.current = false;
    setIsRunning(true);
    sounds.playRadarScan();

    const targets = forceAll
      ? [...currentMatches]
      : currentMatches.filter(m => m?.id && !isMatchAnalyzed(m.id, m) && !attemptedMatchIdsRef.current.has(m.id));

    if (targets.length === 0) {
      setIsRunning(false);
      runningRef.current = false;
      onToast?.('Todos los partidos ya cuentan con análisis IA confirmado.');
      return;
    }

    let processed = 0;
    let aiCompleted = 0;
    let statisticalCompleted = 0;

    const storedAi = getStoredAiConfig();
    let resolvedProvider = storedAi?.provider || 'custom';
    if (resolvedProvider === 'openrouter') resolvedProvider = 'custom';
    const defaultUrl = PROVIDER_PRESETS[resolvedProvider]?.defaultBaseUrl || 'https://vyceai.com/v1';
    let resolvedBaseUrl = storedAi?.baseUrl || defaultUrl;
    if (resolvedBaseUrl.includes('openrouter.ai')) resolvedBaseUrl = defaultUrl;
    let resolvedModel = activeModelInfo?.selectedModel || storedAi?.selectedModel || PROVIDER_PRESETS[resolvedProvider]?.defaultModel || 'deepseek-v4.1';
    if (resolvedModel.includes('openrouter')) resolvedModel = 'deepseek-v4.1';

    const aiConfigPayload = (storedAi && storedAi.apiKey && storedAi.apiKey.length >= 4) ? {
      provider: resolvedProvider,
      apiKey: storedAi.apiKey,
      baseUrl: resolvedBaseUrl,
      selectedModel: resolvedModel
    } : undefined;

    for (let i = 0; i < targets.length; i++) {
      if (stopRequested.current) break;

      const curMatch = targets[i];
      attemptedMatchIdsRef.current.add(curMatch.id);
      const matchTitle = `${curMatch.homeTeam?.name || 'Local'} vs ${curMatch.awayTeam?.name || 'Visitante'}`;
      setCurrentMatchTitle(matchTitle);
      window.dispatchEvent(new CustomEvent('ai-analyzing-match', { detail: { matchId: curMatch.id } }));

      try {
        if (forceAll) {
          removeCachedAnalysis(curMatch.id);
        }

        const res = await fetch(`/api/matches/${curMatch.id}/ai-analysis`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            forceRefresh: forceAll,
            model: resolvedModel,
            aiConfig: aiConfigPayload
          })
        });

        if (res.status === 401 || res.status === 403) {
          onToast?.('Sesión expirada o no autorizada. Inicia sesión nuevamente.');
          break;
        }

        if (res.status === 429) {
          onToast?.('Límite de solicitudes alcanzado. Pausando análisis autónomo.');
          break;
        }

        const data = await res.json().catch(() => null);
        if (res.ok && data?.success && data.report) {
          if (data.report.aiAvailable) aiCompleted++; else statisticalCompleted++;
          const finalMatch = {
            ...(data.match || curMatch),
            isAiAnalyzed: Boolean(data.report.aiAvailable),
            aiReport: data.report
          };
          setCachedAnalysis(curMatch.id, finalMatch, {
            aiReport: data.report,
            enrichedMatch: finalMatch,
            model: resolvedModel
          });

          onMatchAnalyzed?.(curMatch.id, finalMatch, data.report);
          window.dispatchEvent(new CustomEvent('ai-analysis-updated', {
            detail: { matchId: curMatch.id, match: finalMatch, report: data.report }
          }));
        }
      } catch (err) {
        console.warn(`[AutonomousAI] Error analyzing match ${curMatch.id}:`, err?.message || err);
      }

      processed++;
      setAnalysisVersion(v => v + 1);

      // Graceful pacing between requests (600ms) to respect rate-limiters
      if (i < targets.length - 1 && !stopRequested.current) {
        await new Promise(resolve => setTimeout(resolve, 600));
      }
    }

    window.dispatchEvent(new CustomEvent('ai-analyzing-match', { detail: { matchId: null } }));
    setIsRunning(false);
    runningRef.current = false;
    setCurrentMatchTitle('');
    setAnalysisVersion(v => v + 1);

    if (!stopRequested.current) {
      sounds.playSuccess();
      onToast?.(`Revisión terminada: ${aiCompleted} informes con IA, ${statisticalCompleted} cálculos estadísticos y ${processed - aiCompleted - statisticalCompleted} solicitudes sin resultado.`);
    }
  }, [isOwner, activeModelInfo, onMatchAnalyzed, onToast]);

  const handleStop = () => {
    stopRequested.current = true;
    sounds.playClick();
    onToast?.('Pausando análisis autónomo...');
  };

  // Autonomous trigger on load: ONLY for Owner, using stable ID key and attempted match lock to prevent loops
  useEffect(() => {
    if (!isOwner || activeModelInfo?.isConfigured !== true || !autoRunOnLoad || runningRef.current) return;
    const currentMatches = matchesRef.current;
    if (!Array.isArray(currentMatches) || currentMatches.length === 0) return;

    const pending = currentMatches.filter(
      m => m?.id && !isMatchAnalyzed(m.id, m) && !attemptedMatchIdsRef.current.has(m.id)
    );
    if (pending.length === 0) return;

    const timer = setTimeout(() => {
      if (!runningRef.current && autoRunOnLoad && isOwner) {
        executeAnalysisQueue(false);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [matchIdsKey, isOwner, autoRunOnLoad, activeModelInfo?.isConfigured, executeAnalysisQueue]);

  if (!isOwner || !matches || matches.length === 0) return null;

  return (
    <div className="mb-5 rounded-2xl bg-gradient-to-r from-[#0c1424] via-[#0d1829] to-[#09101d] border border-sky-500/25 p-3.5 sm:p-4 shadow-[0_0_30px_rgba(14,165,233,0.08)]">
      
      {/* Top Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-white/5">
        <div className="flex items-start sm:items-center space-x-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-gradient-to-br from-sky-500/20 to-emerald-500/20 border border-sky-400/30 text-sky-300 shrink-0">
            <Cpu className="w-5 h-5 text-sky-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-2 flex-wrap">
              <h4 className="font-bold text-xs sm:text-sm text-white font-mono flex items-center space-x-1.5">
                <span>Análisis Autónomo con IA</span>
                <span className="text-[10px] px-2 py-0.2 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold">
                  PRO
                </span>
              </h4>
              <span className="text-[11px] font-mono text-emerald-400 font-bold flex items-center space-x-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Datos del proveedor deportivo</span>
              </span>
              {isOwner && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 font-bold flex items-center space-x-1">
                  <span>👑</span>
                  <span>Modo Owner (Sin límites)</span>
                </span>
              )}
            </div>
            <p className="text-[11px] sm:text-xs text-slate-300 font-sans mt-0.5 leading-snug">
              Los cálculos estadísticos están disponibles. La redacción con IA requiere un proveedor configurado; no valida ni garantiza los pronósticos.
            </p>
          </div>
        </div>

        {/* Counter and Status Badges */}
        <div className="flex items-center space-x-2 shrink-0 self-start md:self-auto">
          <div className="px-3 py-1.5 rounded-xl bg-[#090d16] border border-white/10 flex items-center space-x-2 text-xs font-mono">
            <span className="text-slate-400">Analizados:</span>
            <span className={`font-bold ${isAllAnalyzed ? 'text-emerald-400' : 'text-sky-400'}`}>
              {analyzedCount} / {totalCount}
            </span>
            {isAllAnalyzed && (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            )}
          </div>
        </div>
      </div>

      {/* Progress Bar (Visible while running or partially done) */}
      <div className="pt-3 space-y-2">
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span className="text-slate-300 flex items-center space-x-1.5 min-w-0">
            {isRunning ? (
              <>
                <RotateCw className="w-3.5 h-3.5 text-sky-400 animate-spin shrink-0" />
                <span className="text-sky-300 font-bold truncate">
                  Consultando informe: {currentMatchTitle}
                </span>
              </>
            ) : isAllAnalyzed ? (
              <span className="text-emerald-300 font-bold flex items-center space-x-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Todos los partidos tienen un informe de IA disponible.</span>
              </span>
            ) : (
              <span className="text-slate-400">
                {pendingCount} {pendingCount === 1 ? 'partido pendiente' : 'partidos pendientes'} de análisis autónomo en esta selección.
              </span>
            )}
          </span>
          <span className="text-sky-400 font-bold shrink-0 ml-2">
            {progressPercent}%
          </span>
        </div>

        <div className="h-2 w-full bg-[#080d14] rounded-full overflow-hidden p-0.5 border border-white/10">
          <div
            style={{ width: `${progressPercent}%` }}
            className={`h-full rounded-full transition-all duration-500 ${
              isAllAnalyzed
                ? 'bg-gradient-to-r from-emerald-500 to-sky-400 shadow-[0_0_12px_rgba(16,185,129,0.5)]'
                : 'bg-gradient-to-r from-sky-500 to-indigo-500 shadow-[0_0_12px_rgba(56,189,248,0.5)]'
            }`}
          />
        </div>
      </div>

      {/* Control Buttons & Options Row */}
      <div className="pt-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center space-x-2">
          {isRunning ? (
            <button
              onClick={handleStop}
              className="px-3.5 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-xl text-xs font-mono font-bold flex items-center space-x-1.5 transition cursor-pointer active:scale-95"
            >
              <Square className="w-3.5 h-3.5 fill-rose-400" />
              <span>Detener Análisis</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => executeAnalysisQueue(false)}
                disabled={isAllAnalyzed}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center space-x-1.5 transition active:scale-95 cursor-pointer ${
                  isAllAnalyzed
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 opacity-70 cursor-default'
                    : 'bg-gradient-to-r from-sky-500 to-emerald-500 hover:from-sky-400 hover:to-emerald-400 text-slate-950 font-bold shadow-[0_0_15px_rgba(14,165,233,0.3)]'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isAllAnalyzed ? 'Todos los Partidos Analizados' : `Analizar Partidos con IA (${pendingCount})`}
                </span>
              </button>

              <button
                onClick={() => executeAnalysisQueue(true)}
                title="Forzar un nuevo análisis en vivo para todos los partidos con estadísticas actualizadas"
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 rounded-xl text-xs font-mono flex items-center space-x-1.5 transition cursor-pointer active:scale-95"
              >
                <RotateCw className="w-3 h-3 text-slate-400" />
                <span>Re-analizar Todos</span>
              </button>
            </>
          )}
        </div>

        {/* Auto mode toggle checkbox */}
        <label className="flex items-center space-x-2 text-[11px] font-mono text-slate-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoRunOnLoad}
            onChange={toggleAutoPref}
            className="w-3.5 h-3.5 rounded bg-slate-800 border-white/20 text-sky-500 focus:ring-0 cursor-pointer"
          />
          <span>Auto-analizar en segundo plano al cargar</span>
        </label>
      </div>

    </div>
  );
}
