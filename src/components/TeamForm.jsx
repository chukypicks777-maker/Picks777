import React from 'react';
const labels = { W: 'Victoria', L: 'Derrota', D: 'Empate' };
export default function TeamForm({ team, records = [], loading = false, compact = false }) {
  return <div className="space-y-1.5" aria-label={`Forma reciente de ${team}`}>
    <p className={compact ? 'sr-only' : 'text-[9px] text-slate-500 uppercase tracking-wide'}>Últimos 5 · previa</p>
    {records.length ? <div className={`flex gap-1 ${compact ? 'justify-start' : 'justify-center'}`}>{records.map(record => <span key={record.id} role="img" aria-label={`${labels[record.result]}: ${record.own}–${record.against}${record.opponent ? ` ante ${record.opponent}` : ''}`} title={`${labels[record.result]} ${record.own}–${record.against}${record.opponent ? ` · ${record.opponent}` : ''} · ${new Date(record.date).toLocaleDateString('es')}`} className={`${compact ? 'w-3.5 h-3.5 text-[8px]' : 'w-5 h-5 text-[10px]'} rounded flex items-center justify-center font-bold font-mono ${record.result === 'W' ? 'bg-emerald-600 text-white' : record.result === 'D' ? 'bg-amber-600 text-white' : 'bg-rose-600 text-white'}`}>{record.result}</span>)}</div>
      : <p className="text-[10px] text-slate-500">{loading ? 'Consultando…' : 'N/D'}</p>}
  </div>;
}
