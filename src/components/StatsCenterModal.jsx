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
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-md"><section role="dialog" aria-label="Clasificación" className="w-full max-w-4xl bg-[#0c1017] border border-white/10 rounded-2xl p-4 space-y-4 text-slate-200">
    <header className="flex justify-between items-center"><h3 className="font-bold">Clasificación del proveedor</h3><button onClick={onClose} aria-label="Cerrar clasificación"><X/></button></header>
    <label className="block text-sm">Liga<select value={league} onChange={e=>{setLeague(e.target.value);setError('');}} className="ml-3 rounded-lg bg-slate-800 p-2 max-w-full">{LEAGUES_DATA.filter(l=>l.id!=='all').map(l=><option key={l.id} value={l.id}>{l.flag} {l.name}</option>)}</select></label>
    {result?.league!==league?<p>Cargando clasificación…</p>:error?<p role="status">{error}</p>:<p className="text-xs text-slate-400">{result.source} · Temporada {result.season ?? 'N/D'} · Consultado {result.fetchedAt ? new Date(result.fetchedAt).toLocaleString('es') : 'N/D'}</p>}
    <div className="overflow-auto max-h-[60vh]"><table className="w-full text-xs text-left"><thead><tr>{['Grupo','#','Equipo','PTS','PJ','GF','GC'].map(label=><th key={label} className="p-3 border-b border-white/10">{label}</th>)}</tr></thead><tbody>{rows?.map((row,index)=><tr key={`${row.teamId}-${index}`} className="border-b border-white/5">{[row.group,row.rank,row.teamName||row.team,row.points,row.gamesPlayed,row.goalsFor,row.goalsAgainst].map((v,i)=><td key={i} className="p-3">{v??'N/D'}</td>)}</tr>)}</tbody></table></div>
    {result?.league===league&&!rows?.length&&!error&&<p>Sin clasificación disponible.</p>}
  </section></div>;
}
