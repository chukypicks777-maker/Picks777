import React from 'react';
import NumberCounter from './NumberCounter';
import { displayNumber } from '../utils/probability';
export default function DifferentialAnalysisSection({ homeStats, awayStats, diff }) {
  if (!homeStats || !awayStats || !diff) return null;
  return <section className="rounded-xl bg-[#111724] border border-sky-500/30 p-4 space-y-3 text-xs text-slate-300">
    <h4 className="text-white font-bold text-sm">Comparativa de promedios registrados</h4>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{[homeStats, awayStats].map((s, i) => <div key={i} className="rounded-lg bg-[#151d2d] p-3 space-y-2">
      <h5 className="font-bold text-sky-300">{s.name}</h5>
      <p>Goles a favor: {displayNumber(s.avgGF)} / p · En contra: {displayNumber(s.avgGC)} / p</p>
      <p>Córners: {displayNumber(s.avgCorners)} / p</p>
      <p>+5.5 Córners: <NumberCounter value={s.cornerOver55} suffix="%"/> · −5.5: <NumberCounter value={s.cornerUnder55} suffix="%"/></p>
    </div>)}</div>
    <p>{diff.cornerDifferentialText}</p>
    <div className="border-t border-white/10 pt-3"><p>{diff.overUnderTendency} · Goles totales del partido</p>
      <p className="mt-2">+2.5: <NumberCounter value={diff.over25} suffix="%"/> · −2.5: <NumberCounter value={diff.under25} suffix="%"/></p>
    </div>
  </section>;
}
