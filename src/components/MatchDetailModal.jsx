import { useEffect, useState } from 'react';
import { RefreshCw, Sparkles, Trophy, Zap, Flag, Target, ShieldAlert, Plus } from 'lucide-react';
import Modal from './Modal';
import { api, dateTime, displayNumber, percent, isFresh } from '../utils/api';
import { formatOdds } from '../utils/oddsFormatter';
import { useClock } from '../utils/clock';

export default function MatchDetailModal({ match, onClose, onAddToParlay, oddsFormat }) {
  const now = useClock();
  const [detail, setDetail] = useState(match);
  const [tab, setTab] = useState('analysis');
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    async function load() {
      if (busy) return;
      busy = true;
      try {
        const data = await api(`/api/matches/${match.id}`, { signal: controller.signal });
        setDetail(data.match);
        setError('');
      } catch (e) {
        if (!controller.signal.aborted) setError(e.message);
      } finally {
        busy = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    const timer = setInterval(load, 60000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [match.id]);

  async function analyze(force = false) {
    setAiLoading(true);
    setError('');
    try {
      const url = `/api/matches/${match.id}/ai-analysis${force ? '?force=1' : ''}`;
      const data = await api(url, { method: 'POST', body: '{}' });
      setReport(data.report);
    } catch (e) {
      setError(e.message);
    } finally {
      setAiLoading(false);
    }
  }

  // Auto-fetch analysis on mount if not already loaded
  useEffect(() => {
    if (!report && !aiLoading) {
      analyze(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id]);

  const history = detail.h2h || [];
  const fresh = isFresh(detail, now);
  const canAdd = match.aiPick && Date.parse(detail.kickoff) > now;
  const metrics = [
    ['Victoria local', 'homeWin'],
    ['Empate', 'draw'],
    ['Victoria visitante', 'awayWin'],
    ['Ambos anotan', 'bttsYes'],
    ['No ambos anotan', 'bttsNo'],
    ['Más de 1.5 goles', 'over15'],
    ['Más de 2.5 goles', 'over25'],
    ['Menos de 2.5 goles', 'under25'],
    ['Más de 3.5 goles', 'over35']
  ];

  const predictedScore = report?.predictedScore || detail.model?.predictedScore;
  const activePick = report?.topPick || detail.aiPick;

  return (
    <Modal title={`${detail.homeTeam.name} vs ${detail.awayTeam.name}`} onClose={onClose}>
      {/* Header Match Summary */}
      <div className="flex flex-wrap justify-between items-center gap-4 mb-5 p-4 rounded-2xl bg-white/[0.03] border border-white/10">
        <div className="flex items-center gap-3">
          {detail.homeTeam.logo && (
            <img src={detail.homeTeam.logo} alt="" className="w-9 h-9 object-contain" />
          )}
          <div>
            <p className="text-sky-300 text-sm font-semibold flex items-center gap-1.5">
              <span>{detail.leagueFlag}</span>
              <span>{detail.leagueName}</span>
              <span className="text-slate-500 font-normal">· {detail.season || '2025/2026'}</span>
            </p>
            <p className="text-slate-400 text-xs mt-1">
              {dateTime(detail.kickoff)} · {detail.venue || 'Estadio Oficial'}
            </p>
          </div>
        </div>

        <div className="text-right">
          <strong className="text-2xl font-mono text-white tracking-wider">
            {['LIVE', 'FINISHED'].includes(detail.status)
              ? `${detail.liveScore?.home ?? 0} - ${detail.liveScore?.away ?? 0}`
              : 'VS'}
          </strong>
          <p className="text-xs text-rose-400 font-semibold mt-0.5">
            {fresh ? detail.statusDetail : 'Actualizado'} {detail.status === 'LIVE' && detail.liveMinute}
          </p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <nav aria-label="Secciones del partido" className="flex flex-wrap gap-2 mb-6 border-b border-white/10 pb-3">
        {[
          ['analysis', '⚡ Análisis IA & Picks'],
          ['history', `⚔️ Cara a Cara (${history.length}/10)`],
          ['stats', '📊 Estadísticas & Boxscore'],
          ['scores', '🎯 Matriz de Marcadores']
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={tab === id}
            className={`text-xs font-semibold px-3 py-2 rounded-xl transition-all cursor-pointer ${
              tab === id ? 'primary shadow-lg shadow-sky-500/20' : 'control'
            }`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {error && <p className="notice-error mb-4" role="alert">{error}</p>}
      {loading && <p role="status" className="text-slate-400 text-xs mb-4">Sincronizando detalles con ESPN...</p>}

      {/* TAB 1: AI Analysis & Intelligence */}
      {tab === 'analysis' && (
        <div className="space-y-5">
          {/* AI Banner & Action */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-gradient-to-r from-sky-950/40 via-slate-900 to-indigo-950/40 border border-sky-500/30">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-sky-300 animate-spin-slow" />
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-sky-200">
                  {report?.modelUsed ? `Motor IA: ${report.modelUsed}` : 'Motor IA: DeportePicks Intelligence'}
                </h4>
                <p className="text-[11px] text-slate-400">
                  {report?.aiStatus || 'Análisis impulsado por IA y modelos cuantitativos Dixon-Coles'}
                </p>
              </div>
            </div>
            <button
              className="control text-xs flex items-center gap-1.5 py-1.5 px-3 hover:border-sky-400"
              disabled={aiLoading}
              onClick={() => analyze(true)}
            >
              <RefreshCw size={13} className={aiLoading ? 'animate-spin' : ''} />
              <span>{aiLoading ? 'Analizando…' : 'Regenerar con IA'}</span>
            </button>
          </div>

          {/* Highlight Cards: Predicted Score, Banker, Value Bet */}
          <div className="grid md:grid-cols-3 gap-3.5">
            {/* 🎯 Exact Score Card */}
            <div className="rounded-2xl p-4 bg-gradient-to-br from-[#0e1626] to-[#0a0f1a] border border-sky-500/30 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-sky-300 font-semibold mb-2">
                <span className="flex items-center gap-1"><Target size={14} /> Marcador IA</span>
                <span className="text-[10px] font-mono bg-sky-500/20 px-1.5 py-0.5 rounded">PROYECTADO</span>
              </div>
              <div className="text-center py-2">
                <strong className="text-3xl font-mono text-white tracking-widest block drop-shadow-md">
                  {predictedScore || (aiLoading ? 'Calculando…' : 'En análisis')}
                </strong>
                <span className="text-[11px] text-slate-400 mt-1 block font-mono">
                  {detail.model?.expectedGoals?.home != null && detail.model?.expectedGoals?.away != null
                    ? `xG Esperado: ${detail.model.expectedGoals.home.toFixed(2)} - ${detail.model.expectedGoals.away.toFixed(2)}`
                    : 'xG Esperado: Calculado con IA / Poisson'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 border-t border-white/5 pt-2">
                Basado en eficacia goleadora oficial y distribución de probabilidad.
              </p>
            </div>

            {/* 💎 Banker Pick Card */}
            <div className="rounded-2xl p-4 bg-gradient-to-br from-emerald-950/30 to-slate-900 border border-emerald-500/30 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs text-emerald-400 font-semibold mb-2">
                  <span className="flex items-center gap-1"><Trophy size={14} /> Pick Principal</span>
                  <span className="text-[10px] font-mono bg-emerald-500/20 px-1.5 py-0.5 rounded text-emerald-300">
                    {activePick?.stake || 'Stake 3/5'}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white mt-1">
                  {activePick?.selection || (aiLoading ? 'Generando selección con IA…' : 'Selección en evaluación oficial')}
                </h3>
                <p className="text-xs text-emerald-300/90 font-mono mt-1">
                  Cuota {formatOdds(activePick?.odds, oddsFormat)} {activePick?.probability ? `· Prob. ${percent(activePick.probability)}` : ''}
                </p>
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                  {activePick?.rationale || 'Selección cuantitativa evaluada con solidez defensiva y racha reciente.'}
                </p>
              </div>
              <button
                className="primary text-xs w-full justify-center mt-3 py-1.5"
                disabled={!canAdd || !activePick}
                onClick={() => onAddToParlay({
                  matchId: detail.id,
                  matchTitle: `${detail.homeTeam.name} vs ${detail.awayTeam.name}`,
                  league: detail.leagueName,
                  ...activePick,
                  oddsFetchedAt: detail.oddsFetchedAt
                })}
              >
                <Plus size={13} />
                <span>Añadir al Parlay</span>
              </button>
            </div>

            {/* ⚡ Value Bet Card */}
            <div className="rounded-2xl p-4 bg-gradient-to-br from-amber-950/30 to-slate-900 border border-amber-500/30 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs text-amber-400 font-semibold mb-2">
                  <span className="flex items-center gap-1"><Zap size={14} /> Value Bet</span>
                  <span className="text-[10px] font-mono bg-amber-500/20 px-1.5 py-0.5 rounded text-amber-300">ALTO VALOR</span>
                </div>
                <h3 className="text-sm font-bold text-white mt-1">
                  {report?.valueBet?.selection || (aiLoading ? 'Detectando cuota de valor…' : 'Análisis de valor en proceso')}
                </h3>
                <p className="text-xs text-amber-300/90 font-mono mt-1">
                  {report?.valueBet?.odds ? `Cuota estimada ${formatOdds(report.valueBet.odds, oddsFormat)}` : 'Cuota según mercado'}
                </p>
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                  {report?.valueBet?.rationale || 'Detección de desajustes entre probabilidad cuantitativa y cuota publicada.'}
                </p>
              </div>
              <p className="text-[10px] text-slate-500 border-t border-white/5 pt-2 mt-3">
                Gestión de banca recomendada: máximo 1–2 unidades.
              </p>
            </div>
          </div>

          {/* Secondary Markets: Corners & BTTS */}
          <div className="grid md:grid-cols-2 gap-3.5">
            {/* 🚩 Corners Market */}
            <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/10">
              <div className="flex items-center gap-1.5 text-xs text-cyan-300 font-semibold mb-2">
                <Flag size={14} />
                <span>Mercado Especializado de Córners</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {report?.cornerAnalysis || (
                  detail.realBoxscore?.home?.corners != null && detail.realBoxscore?.away?.corners != null
                    ? `Córners registrados: ${detail.realBoxscore.home.corners} (${detail.homeTeam?.name || 'Local'}) - ${detail.realBoxscore.away.corners} (${detail.awayTeam?.name || 'Visitante'}).`
                    : 'Proyección táctica de córners procesada a partir de los datos en vivo e informe IA.'
                )}
              </p>
            </div>

            {/* ⚽ BTTS & Over/Under */}
            <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/10">
              <div className="flex items-center gap-1.5 text-xs text-emerald-300 font-semibold mb-2">
                <ShieldAlert size={14} />
                <span>Ambos Equipos Anotan (BTTS) & Goles</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {report?.bttsPrediction?.prediction || (
                  Number.isFinite(detail.probabilities?.bttsYes)
                    ? `Probabilidad estimada BTTS: ${percent(detail.probabilities.bttsYes)} · Over 2.5: ${percent(detail.probabilities.over25)}.`
                    : 'Probabilidad de goles calculada en base a las estadísticas oficiales del torneo.'
                )}
              </p>
            </div>
          </div>

          {/* 📝 Deep Tactical Analysis Report */}
          <section className="rounded-2xl p-5 bg-[#090d15] border border-sky-500/20">
            <h3 className="font-semibold text-sm text-white mb-3 flex items-center gap-2">
              <span>📝 Informe Táctico Profundo en Español</span>
              <span className="text-[11px] font-normal text-slate-400">· Inteligencia de Partido</span>
            </h3>
            <p className="whitespace-pre-line leading-relaxed text-xs text-slate-300">
              {report?.tacticalAnalysis || report?.narrativeAnalysis || 'Análisis táctico en procesamiento...'}
            </p>
            <p className="text-[10px] text-slate-500 mt-4 border-t border-white/5 pt-2">
              Fuente verificada: ESPN Oficial · {report?.modelUsed || 'DeportePicks Engine'} · Generado: {dateTime(report?.generatedAt)}
            </p>
          </section>

          {/* Probabilities Grid */}
          <section className="metric space-y-3">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Distribución Probabilística Cuantitativa
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {metrics.map(([label, key]) => (
                <div className="metric p-3" key={key}>
                  <p className="text-[11px] text-slate-400 mb-1">{label}</p>
                  <strong className="text-base text-sky-200 font-mono">
                    {percent(detail.probabilities?.[key])}
                  </strong>
                  {Number.isFinite(detail.probabilities?.[key]) && (
                    <progress
                      className="w-full h-1 mt-2 accent-sky-400"
                      value={detail.probabilities[key]}
                      max="100"
                      aria-label={label}
                    />
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: Direct H2H History */}
      {tab === 'history' && (
        <div className="space-y-5">
          <div className="p-3.5 rounded-xl bg-sky-950/20 border border-sky-500/20 text-xs text-slate-300">
            {history.length} enfrentamientos directos oficiales registrados entre ambos equipos en las competiciones del proveedor.
          </div>
          {history.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="metric">
                <span className="text-xs text-slate-400">Ambos Anotaron (Histórico)</span>
                <strong className="text-lg block mt-1 text-sky-200">
                  {percent(history.filter(h => h.btts).length / history.length * 100)}
                </strong>
              </div>
              <div className="metric">
                <span className="text-xs text-slate-400">+2.5 Goles (Histórico)</span>
                <strong className="text-lg block mt-1 text-emerald-300">
                  {percent(history.filter(h => h.totalGoals > 2).length / history.length * 100)}
                </strong>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  {['Fecha', 'Local', 'Resultado', 'Visitante', 'Córners', 'Faltas'].map(t => <th key={t}>{t}</th>)}
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id}>
                    <td>{dateTime(h.date)}</td>
                    <td className="font-medium">{h.home}</td>
                    <td className="font-bold whitespace-nowrap text-sky-300 font-mono">{h.score}</td>
                    <td className="font-medium">{h.away}</td>
                    <td>{displayNumber(h.totalCorners)}</td>
                    <td>{displayNumber(h.totalFouls)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(detail.recentMatches || []).map(group => (
            <section key={group.teamId} className="space-y-2 mt-4">
              <h3 className="font-semibold text-xs text-slate-200 uppercase tracking-wider">
                Partidos recientes de {group.team}
              </h3>
              <div className="space-y-1.5">
                {group.events.map((e, i) => (
                  <div key={e.id || i} className="metric flex justify-between items-center text-xs py-2 px-3">
                    <span className="text-slate-400">{dateTime(e.date)}</span>
                    <span className="font-medium">{e.atVs === '@' ? 'Visita a' : 'Local ante'} {e.opponent}</span>
                    <strong className="font-mono text-sky-300">{e.score || 'N/D'} ({e.result || 'N/D'})</strong>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* TAB 3: Stats & Boxscore */}
      {tab === 'stats' && (
        <div className="space-y-5">
          <h3 className="font-semibold text-xs text-slate-300 uppercase tracking-wider">
            Estadísticas Oficiales de Temporada (ESPN)
          </h3>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Métrica</th>
                  <th>{detail.homeTeam.name}</th>
                  <th>{detail.awayTeam.name}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Partidos Jugados (PJ)', 'gamesPlayed'],
                  ['Goles a Favor (GF)', 'goalsFor'],
                  ['Goles Recibidos (GC)', 'goalsAgainst'],
                  ['Puntos Oficiales', 'points'],
                  ['Posición en la Tabla', 'position']
                ].map(([label, key]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    <td className="font-mono font-bold text-sky-200">{displayNumber(detail.homeTeam[key])}</td>
                    <td className="font-mono font-bold text-emerald-200">{displayNumber(detail.awayTeam[key])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="font-semibold text-xs text-slate-300 uppercase tracking-wider mt-6">
            Boxscore y Estadísticas en Directo del Partido
          </h3>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Métrica</th>
                  <th>{detail.homeTeam.name}</th>
                  <th>{detail.awayTeam.name}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Tiros de Esquina (Córners)', 'corners'],
                  ['Faltas Cometidas', 'fouls'],
                  ['Tarjetas Amarillas', 'yellowCards'],
                  ['Tarjetas Rojas', 'redCards'],
                  ['Tiros Totales', 'shots'],
                  ['Tiros a Puerta', 'shotsOnTarget'],
                  ['Posesión del Balón %', 'possession']
                ].map(([label, key]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    <td className="font-mono">{displayNumber(detail.realBoxscore?.home?.[key])}</td>
                    <td className="font-mono">{displayNumber(detail.realBoxscore?.away?.[key])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Exact Scores Matrix */}
      {tab === 'scores' && (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 text-xs text-slate-300">
            {detail.model?.limitations || 'Distribución cuantitativa de probabilidades de marcador exacto calculada por el algoritmo de Poisson.'}
          </div>
          {(detail.model?.scoreDistribution || []).length > 0 ? (
            <div className="grid sm:grid-cols-2 gap-2.5">
              {detail.model.scoreDistribution.map(s => (
                <div key={s.score} className="metric flex justify-between items-center py-2.5 px-4">
                  <strong className="font-mono text-lg text-sky-300">{s.score}</strong>
                  <span className="font-mono text-sm text-slate-300 bg-white/5 px-2 py-0.5 rounded">
                    {percent(s.probability)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 text-center text-xs text-slate-400">
              Matriz Poisson disponible para partidos programados con datos estadísticos de temporada completos. Para partidos en vivo o copas, consulta la pestaña de Análisis IA.
            </div>
          )}
          {detail.model && (
            <p className="text-xs text-slate-500 mt-2">
              Muestra evaluada: {detail.model.sampleSize?.home ?? 0} partidos {detail.homeTeam?.name || 'Local'} / {detail.model.sampleSize?.away ?? 0} partidos {detail.awayTeam?.name || 'Visitante'}.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

