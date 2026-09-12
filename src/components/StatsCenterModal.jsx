import { useEffect, useState } from 'react';
import Modal from './Modal';
import { api, dateTime, displayNumber } from '../utils/api';
import { LEAGUES_DATA } from '../constants/leagues';
export default function StatsCenterModal({ onClose }) {
  const [league, setLeague] = useState('espana');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    api(`/api/matches/standings?league=${league}`, { signal: controller.signal })
      .then(setData).catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [league]);
  return <Modal title="Clasificaciones del proveedor" onClose={onClose}>
    <label className="block text-sm mb-5">Liga<select className="field mt-2" value={league} onChange={e => { setLoading(true); setData(null); setError(''); setLeague(e.target.value); }}>{LEAGUES_DATA.filter(l => l.id !== 'all').map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
    {loading && <p role="status">Consultando clasificación…</p>}
    {error && <p role="alert" className="notice-error">{error}</p>}
    {data && <><p className="text-xs text-slate-400 mb-4">ESPN · {data.season || 'Temporada no indicada'} · Consulta: {dateTime(data.fetchedAt)}</p><div className="overflow-x-auto"><table className="data-table"><thead><tr>{['Grupo', 'Pos.', 'Equipo', 'PJ', 'PTS', 'GF', 'GC'].map(t => <th key={t}>{t}</th>)}</tr></thead><tbody>{data.standings.map((r, i) => <tr key={`${r.teamId}-${i}`}><td>{r.group || '—'}</td><td>{displayNumber(r.rank)}</td><td className="font-semibold">{r.team}</td><td>{displayNumber(r.gamesPlayed)}</td><td>{displayNumber(r.points)}</td><td>{displayNumber(r.goalsFor)}</td><td>{displayNumber(r.goalsAgainst)}</td></tr>)}</tbody></table></div>{!data.standings.length && <p className="notice mt-4">El proveedor no publica una tabla para esta competición.</p>}<a className="text-xs text-sky-300 underline inline-block mt-4" href={data.sourceUrl} target="_blank" rel="noreferrer">Consultar fuente de la clasificación</a></>}
  </Modal>;
}
