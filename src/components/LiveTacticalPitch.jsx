import React from 'react';
import { displayNumber } from '../utils/probability';
export default function LiveTacticalPitch({ match }) {
  if (!match) return null;
  const live = match.realBoxscore;
  return <section className="rounded-xl p-4 bg-[#0a0f19] border border-white/10 text-xs text-slate-300 space-y-3">
    <h4 className="font-bold text-white">Estadísticas observadas del partido</h4>
    {!live ? <p>El proveedor aún no entrega estadísticas de juego.</p> : <div className="grid grid-cols-2 gap-4">{['home','away'].map(side => <div key={side} className="space-y-2">
      <h5 className="text-sky-300 font-bold">{match[`${side}Team`]?.name}</h5>
      <p>Posesión: {displayNumber(live[side]?.possession)}%</p><p>Remates: {displayNumber(live[side]?.shots,0)}</p><p>Córners: {displayNumber(live[side]?.corners,0)}</p>
    </div>)}</div>}
  </section>;
}
