import { useState } from 'react';
import Modal from './Modal';
import { formatOdds } from '../utils/oddsFormatter';
import { formatCurrency } from '../utils/currencyFormatter';
import { calculateParlay } from '../../server/services/parlayEngine.js';
import { dateTime, percent } from '../utils/api';
import { useClock } from '../utils/clock';
export default function ParlayPanel({ onClose, legs, onRemoveLeg, onClearAll, onLoadDailyBanker, currency, oddsFormat }) {
  const now = useClock();
  const [stake, setStake] = useState('50');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  let calculation = null;
  let error = '';
  try { calculation = calculateParlay(legs, stake === '' ? NaN : Number(stake)); }
  catch (e) { error = e.message; }
  const outdated = legs.some(l => !Number.isFinite(Date.parse(l.oddsFetchedAt)) || now - Date.parse(l.oddsFetchedAt) >= 120000);
  async function copy() {
    try {
      await navigator.clipboard.writeText(legs.map(l => `${l.matchTitle}: ${l.selection} (${formatOdds(l.odds, oddsFormat)})`).join('\n') + `\nRetorno hipotético: ${formatCurrency(calculation.potentialPayout, currency)}\nCuotas informativas. No es una apuesta colocada ni una garantía.`);
      setMessage('Simulación copiada.');
    } catch { setMessage('No se pudo copiar al portapapeles.'); }
  }
  async function loadDaily() {
    setLoading(true);
    try { const result = await onLoadDailyBanker(); if (result) setMessage(result); }
    finally { setLoading(false); }
  }
  return <Modal title="Simulador de combinadas" onClose={onClose}>
    <p className="notice mb-5">No hay una combinada segura. Si una selección pierde, puedes perder todo el importe. Las cuotas se multiplican suponiendo independencia entre partidos.</p>
    <button className="control mb-5" disabled={loading} onClick={loadDaily}>{loading ? 'Consultando…' : 'Consultar selecciones del modelo'}</button>
    <div className="space-y-3">{legs.map((leg, index) => <article className="metric" key={leg.matchId}><div className="flex justify-between items-start gap-4"><div><h3 className="font-semibold">{leg.matchTitle}</h3><p className="text-sky-200 my-2">{leg.selection} · {formatOdds(leg.odds, oddsFormat)}</p><p className="text-xs text-slate-500">Consulta de cuota: {dateTime(leg.oddsFetchedAt)}</p></div><button className="control" aria-label={`Quitar ${leg.selection}`} onClick={() => onRemoveLeg(index)}>Quitar</button></div></article>)}</div>
    {!legs.length && <p className="metric text-slate-400">Añade una selección desde un partido con cuota publicada.</p>}
    {outdated && <p className="notice mt-4">Estas cuotas no se han consultado recientemente. Los cálculos siguientes conservan los valores seleccionados y no representan una oferta vigente.</p>}
    <label className="block my-5 text-sm">Importe hipotético ({currency})<input className="field mt-2" type="number" min="0" max="1000000" step="0.01" value={stake} onChange={e => setStake(e.target.value)} /></label>
    {error && <p role="alert" className="notice-error">{error}</p>}
    {calculation && legs.length > 0 && <div className="grid sm:grid-cols-2 gap-3"><div className="metric">Cuota combinada<strong className="block text-xl text-sky-200 mt-2">{formatOdds(calculation.totalDecimalOdds, oddsFormat)}</strong></div><div className="metric">Retorno hipotético (incluye importe)<strong className="block text-xl text-emerald-300 mt-2">{formatCurrency(calculation.potentialPayout, currency)}</strong></div><div className="metric">Beneficio hipotético<strong className="block mt-2">{formatCurrency(calculation.netProfit, currency)}</strong></div><div className="metric">Probabilidad estimada, si son independientes<strong className="block mt-2">{percent(calculation.overallProbability)}</strong></div></div>}
    <div className="flex gap-3 mt-5"><button className="primary" disabled={!calculation || !legs.length} onClick={copy}>Copiar simulación</button><button className="control" onClick={onClearAll}>Vaciar</button></div>
    {message && <p role="status" className="notice mt-4">{message}</p>}
    <p className="text-xs text-slate-500 mt-5">La selección de moneda no convierte divisas. Confirma cuotas y reglas con tu operador. Esta web no coloca apuestas.</p>
  </Modal>;
}
