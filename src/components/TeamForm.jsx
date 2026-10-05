import React from 'react';
const labels = { W: 'Victoria', L: 'Derrota', D: 'Empate' };
export default function TeamForm({ team, records = [], loading = false }) {
  return <div className="space-y-1.5" aria-label={`Forma reciente de ${team}`}>
    <p className="text-[9px] text-slate-500 uppercase tracking-wide">Últimos 5 · previa</p>
    {records.length ? <div className="flex justify-center gap-1">{records.map(record => <span key={record.id} role="img" aria-label={`${labels[record.result]}: ${record.own}–${record.against}${record.opponent ? ` ante ${record.opponent}` : ''}`} title={`${labels[record.result]} ${record.own}–${record.against}${record.opponent ? ` · ${record.opponent}` : ''} · ${new Date(record.date).toLocaleDateString('es')}`} className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold font-mono ${record.result === 'W' ? 'bg-emerald-600 text-white' : record.result === 'D' ? 'bg-amber-600 text-white' : 'bg-rose-600 text-white'}`}>{record.result}</span>)}</div>
      : <p className="text-[10px] text-slate-500">{loading ? 'Consultando…' : 'N/D'}</p>}
  </div>;
}
