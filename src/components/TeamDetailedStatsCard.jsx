import React from 'react';
import NumberCounter from './NumberCounter';
import { displayNumber } from '../utils/probability';
export default function TeamDetailedStatsCard({ stats, isHome }) {
  if (!stats) return null;
  const sections = [
    { title: 'Goles del equipo · estimación para este partido', prefix: '', suffix: 'Rate', lines: ['05', '15', '25', '35'] },
    { title: 'Tarjetas amarillas · estimación histórica', prefix: 'cards', suffix: '', lines: ['05', '15', '25', '35', '45'] },
    { title: 'Córners · estimación histórica', prefix: 'corner', suffix: '', lines: ['15', '25', '35', '45', '55', '65'] }
  ];
  return <article className="rounded-xl p-4 bg-[#0f1522] border border-sky-500/30 space-y-4 text-xs">
    <header className="flex items-center gap-3">
      {stats.logo && <img src={stats.logo} alt="" className="w-9 h-9 object-contain" />}
      <div><h4 className="font-bold text-white text-base">{stats.name}</h4><p className="text-slate-400">{isHome ? 'Local' : 'Visitante'} · Posición {stats.position ?? 'N/D'} · {stats.points ?? 'N/D'} pts</p></div>
    </header>
    <div className="grid grid-cols-3 gap-2 text-slate-300 text-center">
      <p>Goles a favor<br/><strong>{displayNumber(stats.avgGF)} / p</strong></p>
      <p>Goles en contra<br/><strong>{displayNumber(stats.avgGC)} / p</strong></p>
      <p>Partidos<br/><strong>{stats.gamesPlayed ?? 'N/D'}</strong></p>
    </div>
    {sections.map(section => <section key={section.title} className="bg-[#121926] border border-white/10 rounded-xl p-3 space-y-2">
      <h5 className="text-sky-300 font-bold">{section.title}</h5>
      {section.lines.map(key => <div key={key} className="grid grid-cols-2 gap-2">{['over', 'under'].map(side => {
        const property = section.prefix ? `${section.prefix}${side[0].toUpperCase()}${side.slice(1)}${key}` : `${side}${key}${section.suffix}`;
        const value = stats[property];
        return <div key={side} className="rounded-lg bg-[#0f1724] border border-white/5 p-2">
          <div className="flex justify-between text-slate-200 gap-2"><span>{side === 'over' ? '+' : '−'}{Number(key)/10}</span><strong className={side === 'over' ? 'text-emerald-400' : 'text-amber-400'}><NumberCounter value={value} suffix="%"/></strong></div>
          <div className="h-1 bg-slate-800 mt-2 rounded"><div className="h-full bg-sky-400 rounded" style={{width: `${value ?? 0}%`}}/></div>
        </div>;
      })}</div>)}
    </section>)}
    <footer className="text-slate-400 space-y-2">
      <p>Córners: {displayNumber(stats.avgCorners)} / p · Amarillas: {displayNumber(stats.cards)} / p · Faltas: {displayNumber(stats.fouls)} / p</p>
      <p>{stats.statsSource || 'Estadísticas de detalle pendientes'} · Muestra córners: {stats.sampleSizes?.corners ?? 0}; tarjetas: {stats.sampleSizes?.cards ?? 0}.</p>
      <p>N/D: sin datos suficientes. Las probabilidades son estimaciones Poisson; los promedios corresponden a registros del proveedor.</p>
    </footer>
  </article>;
}
