import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Sparkles, Square, RotateCw, CheckCircle2, Cpu, ShieldCheck } from 'lucide-react';
import { sounds } from '../utils/audioEffects';
import { isMatchAnalyzed, getBatchAnalyzedStatus, setCachedAnalysis, computeMatchFingerprint } from '../utils/analysisCache';
import { getStoredAiConfig } from '../utils/aiSettings';
import { PROVIDER_PRESETS } from '../constants/aiProviders';
import { isUpcomingFixture } from '../utils/fixtureEligibility.js';

const sessionAttemptedMatchIds = new Set();
const attemptFingerprints = new WeakMap();
function attemptFingerprint(match) {
  if (!attemptFingerprints.has(match)) attemptFingerprints.set(match, computeMatchFingerprint(match));
  return attemptFingerprints.get(match);
}

export default function AutonomousAiBar({
  matches = [],
  onMatchAnalyzed,
  activeModelInfo = null,
  onToast = null,
  onSessionExpired = null,
  isOwner = false,
  sport = 'futbol',
  sessionKey = '',
  onAnalyzing = null,
  externalBusy = false
}) {
  const [isRunning, setIsRunning] = useState(false);
  const [currentMatchTitle, setCurrentMatchTitle] = useState('');
  const [analysisVersion, setAnalysisVersion] = useState(0);
  const [retryUntil, setRetryUntil] = useState(0);
  const [autoRunOnLoad, setAutoRunOnLoad] = useState(() => {
    try {
      const saved = localStorage.getItem('picks777_auto_ai_pref');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const stopRequested = useRef(false);
  const pausedByOwner = useRef(false);
  const sessionExpired = useRef(false);
  const runningRef = useRef(false);
  const mounted = useRef(true);
  const requestController = useRef(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stopRequested.current = true; requestController.current?.abort(); };
  }, []);
  const matchesRef = useRef(matches);
  useEffect(() => {
    matchesRef.current = matches;
  }, [matches]);
  const attemptedMatchIdsRef = useRef(sessionAttemptedMatchIds);
  const attemptKey = useCallback(match => `${sessionKey}:${sport}:${attemptFingerprint(match)}`, [sessionKey, sport]);

  // Derive counts using getBatchAnalyzedStatus without synchronous setState inside effects
  const { analyzedCount, totalCount, pendingCount, isAllAnalyzed } = useMemo(() => {
    void analysisVersion;
    return getBatchAnalyzedStatus(matches.filter(match => isUpcomingFixture(match)));
  }, [matches, analysisVersion]);

  // Stable match IDs key to prevent unnecessary effect triggers on background feed polling
  const matchIdsKey = useMemo(() => {
    if (!Array.isArray(matches) || matches.length === 0) return '';
    return matches.filter(m => m?.id).map(attemptFingerprint).join(',');
  }, [matches]);

  const progressPercent = totalCount > 0 ? Math.round((analyzedCount / totalCount) * 100) : 0;

  const toggleAutoPref = () => {
    if (!isOwner) return;
    const next = !autoRunOnLoad;
    pausedByOwner.current = !next;
    if (!next) {
      stopRequested.current = true;
      requestController.current?.abort();
    }
    setAutoRunOnLoad(next);
    try {
      localStorage.setItem('picks777_auto_ai_pref', String(next));
    } catch {}
  };

  const executeAnalysisQueue = useCallback(async (forceAll = false) => {
    if ((forceAll && !isOwner) || runningRef.current || sessionExpired.current) return;
    if (externalBusy || Date.now() < retryUntil) return;
    const currentMatches = matchesRef.current.filter(match => isUpcomingFixture(match));
    if (!Array.isArray(currentMatches) || currentMatches.length === 0) return;

    if (forceAll) {
      currentMatches.forEach(match => attemptedMatchIdsRef.current.delete(attemptKey(match)));
    }

    runningRef.current = true;
    stopRequested.current = false;
    pausedByOwner.current = false;
    setIsRunning(true);
    if (isOwner) sounds.playRadarScan();

    let targets = forceAll
      ? [...currentMatches]
      : currentMatches.filter(m => m?.id && !isMatchAnalyzed(m.id, m) && !attemptedMatchIdsRef.current.has(attemptKey(m)));

    // Football reports generated for any member are shared: fetch them in one
    // request and only ask for the fixtures nobody has analyzed yet.
    if (sport === 'futbol' && !forceAll && targets.length > 0) {
      try {
        const controller = new AbortController();
        requestController.current = controller;
        const res = await fetch('/api/matches/ai-reports', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin', signal: controller.signal, body: JSON.stringify({ ids: targets.slice(0, 100).map(m => m.id) }) });
        const data = await res.json().catch(() => null);
        if (mounted.current && res.ok && data?.reports) {
          for (const [id, report] of Object.entries(data.reports)) {
            const current = matchesRef.current.find(match => match.id === id);
            if (!current || !report?.aiAvailable) continue;
            const analyzed = { ...current, isAiAnalyzed: true, aiReport: report };
            // No enriched copy: opening the report still loads the full detail.
            setCachedAnalysis(id, current, { aiReport: report, model: report.modelUsed });
            onMatchAnalyzed?.(id, analyzed, report, current);
            if (!onMatchAnalyzed) window.dispatchEvent(new CustomEvent('ai-analysis-updated', { detail: { matchId: id, match: analyzed, report } }));
          }
          targets = targets.filter(m => !data.reports[m.id]?.aiAvailable);
        }
      } catch { /* The per-fixture queue below still works. */ }
      if (!mounted.current || stopRequested.current) { runningRef.current = false; setIsRunning(false); return; }
    }

    if (targets.length === 0) {
      setIsRunning(false);
      runningRef.current = false;
      if (isOwner) onToast?.('Todos los partidos ya cuentan con análisis IA confirmado.');
      return;
    }

    let processed = 0;
    let aiCompleted = 0;
    let statisticalCompleted = 0;

    const storedAi = isOwner ? getStoredAiConfig() : null;
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

      const curMatch = matchesRef.current.find(match => match.id === targets[i].id);
      if (!isUpcomingFixture(curMatch)) continue;
      if (!forceAll && isMatchAnalyzed(curMatch.id, curMatch)) continue;
      const key = attemptKey(curMatch);
      attemptedMatchIdsRef.current.add(key);
      if (attemptedMatchIdsRef.current.size > 4000) attemptedMatchIdsRef.current.delete(attemptedMatchIdsRef.current.values().next().value);
      const matchTitle = `${curMatch.homeTeam?.name || 'Local'} vs ${curMatch.awayTeam?.name || 'Visitante'}`;
      setCurrentMatchTitle(matchTitle);
      onAnalyzing?.(curMatch.id);
      if (sport === 'futbol') window.dispatchEvent(new CustomEvent('ai-analyzing-match', { detail: { matchId: curMatch.id } }));

      try {
        const controller = new AbortController();
        requestController.current = controller;
        const timeout = setTimeout(() => controller.abort(), 55000);
        let res;
        try { res = await fetch(sport === 'futbol' ? `/api/matches/${encodeURIComponent(curMatch.id)}/ai-analysis` : `/api/sports/${sport}/${encodeURIComponent(curMatch.id)}/ai-analysis?league=${curMatch.leagueId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          signal: controller.signal,
          body: JSON.stringify(isOwner ? {
            forceRefresh: forceAll,
            model: resolvedModel,
            aiConfig: aiConfigPayload
          } : {})
        }); } finally { clearTimeout(timeout); }

        const data = await res.json().catch(() => null);
        if (!mounted.current || controller.signal.aborted) { attemptedMatchIdsRef.current.delete(key); break; }
        if (res.status === 401 || res.status === 403) {
          sessionExpired.current = true;
          if (res.status === 401 || data?.trialExpired) onSessionExpired?.(data);
          if (isOwner) onToast?.('Sesión expirada o no autorizada. Inicia sesión nuevamente.');
          break;
        }

        if (res.status === 429) {
          attemptedMatchIdsRef.current.delete(key);
          const seconds = Number(res.headers.get('Retry-After') || data?.retryAfter);
          setRetryUntil(Date.now() + (Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 604800) : 60) * 1000);
          if (isOwner) onToast?.('Límite de solicitudes alcanzado. El análisis continuará al terminar la espera indicada por el servidor.');
          break;
        }

        if (res.ok && data?.success && data.report) {
          if (data.report.aiAvailable) aiCompleted++; else statisticalCompleted++;
          const finalMatch = {
            ...(data.match || curMatch),
            isAiAnalyzed: Boolean(data.report.aiAvailable),
            aiReport: data.report
          };
          attemptedMatchIdsRef.current.add(attemptKey(finalMatch));
          if (sport === 'futbol') setCachedAnalysis(curMatch.id, finalMatch, {
            aiReport: data.report,
            enrichedMatch: finalMatch,
            originalMatch: curMatch,
            model: data.report.modelUsed
          });

          onMatchAnalyzed?.(curMatch.id, finalMatch, data.report, curMatch);
          if (sport === 'futbol' && !onMatchAnalyzed) window.dispatchEvent(new CustomEvent('ai-analysis-updated', {
            detail: { matchId: curMatch.id, match: finalMatch, report: data.report }
          }));
        }
      } catch (err) {
        if (err?.name === 'AbortError') attemptedMatchIdsRef.current.delete(key);
        if (!mounted.current) break;
        console.warn(`[AutonomousAI] Error analyzing match ${curMatch.id}:`, err?.message || err);
      }

      processed++;
      setAnalysisVersion(v => v + 1);

      // Graceful pacing between requests (600ms) to respect rate-limiters
      if (i < targets.length - 1 && !stopRequested.current) {
        await new Promise(resolve => setTimeout(resolve, 600));
      }
    }

    if (sport === 'futbol') window.dispatchEvent(new CustomEvent('ai-analyzing-match', { detail: { matchId: null } }));
    onAnalyzing?.(null);
    if (!mounted.current) return;
    setIsRunning(false);
    runningRef.current = false;
    setCurrentMatchTitle('');
    setAnalysisVersion(v => v + 1);

    if (!stopRequested.current && isOwner) {
      sounds.playSuccess();
      onToast?.(`Revisión terminada: ${aiCompleted} informes con IA, ${statisticalCompleted} cálculos estadísticos y ${processed - aiCompleted - statisticalCompleted} solicitudes sin resultado.`);
    }
  }, [isOwner, activeModelInfo, onMatchAnalyzed, onToast, onSessionExpired, sport, onAnalyzing, externalBusy, attemptKey, retryUntil]);

  const handleStop = () => {
    pausedByOwner.current = true;
    stopRequested.current = true;
    requestController.current?.abort();
    sounds.playClick();
    onToast?.('Pausando análisis autónomo...');
  };

  useEffect(() => {
    if (!retryUntil) return;
    const timer = setTimeout(() => setRetryUntil(0), Math.max(0, retryUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [retryUntil]);

  // Members use the server's configured model automatically. Only Owner can pause,
  // force regeneration or override provider settings; the UI is not the worker.
  useEffect(() => {
    const autoEnabled = !isOwner || autoRunOnLoad;
    if (activeModelInfo?.isConfigured !== true || !autoEnabled || runningRef.current || pausedByOwner.current || sessionExpired.current || Date.now() < retryUntil) return;
    if (externalBusy) return;
    const currentMatches = matchesRef.current;
    if (!Array.isArray(currentMatches) || currentMatches.length === 0) return;

    const pending = currentMatches.filter(
      m => isUpcomingFixture(m) && m?.id && !isMatchAnalyzed(m.id, m) && !attemptedMatchIdsRef.current.has(attemptKey(m))
    );
    if (pending.length === 0) return;

    const timer = setTimeout(() => {
      if (!runningRef.current && autoEnabled && !pausedByOwner.current) {
        executeAnalysisQueue(false);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [matchIdsKey, analysisVersion, isOwner, autoRunOnLoad, activeModelInfo?.isConfigured, executeAnalysisQueue, externalBusy, attemptKey, retryUntil]);

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
                  <span>Modo Owner</span>
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
                {pendingCount} {pendingCount === 1 ? 'partido pendiente' : 'partidos pendientes'} de análisis autónomo en el calendario de este deporte.
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
                disabled={isAllAnalyzed || externalBusy || retryUntil > 0}
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
                disabled={externalBusy || retryUntil > 0}
                title="Forzar un nuevo análisis en vivo para todos los partidos con estadísticas actualizadas"
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 rounded-xl text-xs font-mono flex items-center space-x-1.5 transition cursor-pointer active:scale-95"
              >
                <RotateCw className="w-3 h-3 text-slate-400" />
                <span>{sport === 'futbol' ? 'Re-analizar Todos' : 'Reintentar con IA'}</span>
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
