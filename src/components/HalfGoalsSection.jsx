import React from 'react';
import NumberCounter from './NumberCounter';

export default function HalfGoalsSection({ match }) {
  const data = match?.halfGoals;
  return <section className="rounded-xl border border-sky-500/25 bg-[#101622] p-4 space-y-4">
    <h4 className="text-white font-bold">Probabilidad de goles por mitad</h4>
    <p className="text-xs text-slate-400">Estimaciones antes del inicio. Cada mitad incluye su tiempo de descuento.</p>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {['first', 'second'].map((key, index) => <div key={key} className="bg-[#0b1019] rounded-xl p-3 border border-white/10">
        <h5 className="font-bold text-sky-300 mb-3">{index + 1}ª Mitad · Total de goles</h5>
        {!data ? <p className="text-xs text-slate-400">{match?.status !== 'SCHEDULED' ? 'Pronóstico previo no disponible para un partido iniciado.' : 'Sin datos suficientes de ambas mitades (mínimo 5 partidos por equipo).'}</p> :
          <div className="space-y-2">{[0.5, 1.5, 2.5, 3.5].map(line => <div key={line} className="grid grid-cols-2 gap-2 text-xs">
            {['over', 'under'].map(side => <div key={side} className="rounded-lg bg-[#141b29] p-3 flex flex-wrap justify-between gap-2">
              <span className="text-slate-200">{side === 'over' ? 'Más' : 'Menos'} de {line}</span>
              <strong className={side === 'over' ? 'text-emerald-400' : 'text-amber-400'}><NumberCounter value={data[key][`${side}${String(line).replace('.', '')}`]} suffix="%" /></strong>
            </div>)}
          </div>)}</div>}
      </div>)}
    </div>
    {data && <p className="text-xs text-slate-400">Muestra: {data.sampleSize.home} partidos del local y {data.sampleSize.away} del visitante. {data.method}</p>}
  </section>;
}
