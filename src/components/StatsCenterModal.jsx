import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { LEAGUES_DATA } from '../constants/leagues';
export default function StatsCenterModal({ onClose }) {
  const [league,setLeague]=useState('espana'),[result,setResult]=useState(null),[error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    fetch(`/api/matches/standings?league=${league}`,{signal:controller.signal}).then(r=>r.json()).then(data=>{if(!data.success)throw new Error(data.message);setResult({...data,league});setError('');}).catch(e=>{if(e.name!=='AbortError'){setResult({league,standings:[]});setError('El proveedor no entrega clasificación para esta liga.');}});
    return ()=>controller.abort();
  },[league]);
  const rows=result?.league===league?result.standings:[];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <section role="dialog" aria-label="Clasificación" className="w-full max-w-4xl bg-[#0c1017] border border-white/10 rounded-2xl p-3.5 sm:p-5 space-y-3.5 text-slate-200 overflow-x-hidden my-2 sm:my-8 shadow-2xl">
        <header className="flex justify-between items-center pb-2 border-b border-white/5">
          <h3 className="font-bold text-sm sm:text-base text-white">Clasificación del proveedor</h3>
          <button onClick={onClose} aria-label="Cerrar clasificación" className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer">
            <X className="w-5 h-5"/>
          </button>
        </header>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <label htmlFor="stats-league-select" className="text-xs sm:text-sm font-semibold text-slate-300">Liga:</label>
          <select id="stats-league-select" value={league} onChange={e=>{setLeague(e.target.value);setError('');}} className="rounded-lg bg-slate-800 border border-white/10 p-2 text-xs sm:text-sm text-slate-200 max-w-full focus:outline-none focus:border-sky-500 cursor-pointer">
            {LEAGUES_DATA.filter(l=>l.id!=='all').map(l=><option key={l.id} value={l.id}>{l.flag} {l.name}</option>)}
          </select>
        </div>
        {result?.league!==league ? (
          <p className="text-xs text-slate-400 font-mono py-2">Cargando clasificación…</p>
        ) : error ? (
          <p role="status" className="text-xs text-rose-400 font-mono py-2">{error}</p>
        ) : (
          <p className="text-[11px] sm:text-xs text-slate-400 font-mono">
            {result.source} · Temporada {result.season ?? 'N/D'} · Consultado {result.fetchedAt ? new Date(result.fetchedAt).toLocaleString('es') : 'N/D'}
          </p>
        )}
        <div className="overflow-x-auto max-h-[60vh] rounded-xl border border-white/10 bg-[#090d14]">
          <table className="w-full text-xs text-left whitespace-nowrap min-w-[380px]">
            <thead className="bg-[#121824] text-slate-400 border-b border-white/10">
              <tr>
                {['Grupo','#','Equipo','PTS','PJ','GF','GC'].map(label=>(
                  <th key={label} className="p-2.5 sm:p-3 border-b border-white/10 font-mono font-bold text-[11px] sm:text-xs">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono">
              {rows?.map((row,index)=>(
                <tr key={`${row.teamId}-${index}`} className="hover:bg-white/5 transition">
                  {[row.group,row.rank,row.teamName||row.team,row.points,row.gamesPlayed,row.goalsFor,row.goalsAgainst].map((v,i)=>(
                    <td key={i} className={`p-2.5 sm:p-3 ${i===2 ? 'font-sans font-semibold text-white' : ''}`}>
                      {v??'N/D'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {result?.league===league&&!rows?.length&&!error&&(
          <p className="text-xs text-slate-400 font-mono py-2">Sin clasificación disponible.</p>
        )}
      </section>
    </div>
  );
}
