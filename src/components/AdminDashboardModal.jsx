import { useCallback, useEffect, useState } from "react";
import Modal from "./Modal";
import { api, dateTime } from "../utils/api";
export default function AdminDashboardModal({ onClose }) {
  const [codes, setCodes] = useState([]);
  const [stats, setStats] = useState({});
  const [settings, setSettings] = useState(null);
  const [count, setCount] = useState(30);
  const [days, setDays] = useState(30);
  const [prefix, setPrefix] = useState("VIP");
  const [custom, setCustom] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => { const data = await api("/api/admin/codes"); setCodes(data.codes); setStats(data.stats); }, []);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api('/api/admin/codes', { signal: controller.signal }), api('/api/settings', { signal: controller.signal })])
      .then(([data, config]) => { if (!controller.signal.aborted) { setCodes(data.codes); setStats(data.stats); setSettings(config.settings); } })
      .catch(e => { if (!controller.signal.aborted) setMessage(e.message); });
    return () => controller.abort();
  }, []);
  async function action(path, body, method = "POST") {
    setBusy(true); setMessage("");
    try { await api(path, { method, ...(method !== "DELETE" ? { body: JSON.stringify(body || {}) } : {}) }); await load(); setMessage("Operación guardada."); } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  }
  async function copyAvailable() { try { await navigator.clipboard.writeText(codes.filter(c => c.status === "DISPONIBLE").map(c => c.code).join("\n")); setMessage("Códigos disponibles copiados."); } catch { setMessage("El navegador no permite copiar al portapapeles."); } }
  return <Modal title="Owner · Gestión de accesos" onClose={onClose}>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">{[["total", "Total"], ["active", "Activos"], ["available", "Disponibles"], ["expired", "Vencidos"]].map(([key, label]) => <div key={key} className="metric"><p className="text-xs text-slate-400">{label}</p><strong className="text-2xl">{stats[key] ?? 0}</strong></div>)}</div>
    <form className="metric space-y-4 mb-6" onSubmit={e => { e.preventDefault(); action("/api/admin/codes/batch", { count: Number(count), durationDays: Number(days), prefix }); }}>
      <h3 className="font-semibold">Generar códigos únicos por lote</h3><div className="grid sm:grid-cols-3 gap-3"><label className="text-sm">Cantidad<input className="field mt-2" type="number" min="1" max="200" required value={count} onChange={e => setCount(e.target.value)} /></label><label className="text-sm">Días desde activación<input className="field mt-2" type="number" min="1" max="1000" required value={days} onChange={e => setDays(e.target.value)} /></label><label className="text-sm">Prefijo<input className="field mt-2" pattern="[A-Za-z0-9]{1,12}" required value={prefix} onChange={e => setPrefix(e.target.value)} /></label></div>
      <button className="primary" disabled={busy}>Generar {count} códigos</button><p className="text-xs text-slate-400">La primera activación fija el vencimiento. Volver a entrar no renueva la duración.</p>
    </form>
    <form className="flex flex-wrap gap-3 items-end mb-6" onSubmit={e => { e.preventDefault(); action("/api/admin/codes/create", { code: custom, durationDays: Number(days), label: "Manual" }); }}><label className="text-sm flex-1">Código personalizado (usa la duración de arriba)<input className="field mt-2" required minLength={6} maxLength={64} value={custom} onChange={e => setCustom(e.target.value)} /></label><button className="control" disabled={busy}>Crear uno</button></form>
    {message && <p role="status" className="notice mb-4">{message}</p>}
    <div className="flex flex-wrap gap-3 mb-4"><input aria-label="Filtrar códigos" className="field flex-1" placeholder="Filtrar código o alias" value={search} onChange={e => setSearch(e.target.value)} /><button className="control" onClick={copyAvailable}>Copiar disponibles</button><button className="control" onClick={() => load().catch(e => setMessage(e.message))}>Actualizar</button></div>
    <div className="overflow-x-auto"><table className="data-table"><thead><tr>{["Código", "Estado", "¿Reclamado?", "Usuario / Alias", "Dispositivos", "Vencimiento", "Acciones"].map(t => <th key={t}>{t}</th>)}</tr></thead><tbody>{codes.filter(c => `${c.code} ${c.claimedBy || ""}`.toLowerCase().includes(search.toLowerCase())).map(c => <tr key={c.code}><td className="font-mono text-sky-200 font-bold">{c.code}</td><td><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${c.status === 'ACTIVO' ? 'bg-emerald-500/20 text-emerald-300' : c.status === 'DISPONIBLE' ? 'bg-sky-500/20 text-sky-300' : 'bg-rose-500/20 text-rose-300'}`}>{c.status}</span></td><td className="text-xs">{c.isClaimed ? <span className="text-emerald-300 font-medium">Sí · {dateTime(c.claimedAt)}</span> : <span className="text-slate-500">Sin reclamar</span>}</td><td>{c.claimedBy || "—"}</td><td className="font-mono text-center">{c.deviceCount}</td><td className="text-xs">{c.expiresAt ? dateTime(c.expiresAt) : `${c.durationDays} días al activar`}</td><td><div className="flex gap-2"><button className="control text-xs" disabled={busy || c.isExpired} onClick={() => { if (window.confirm("¿Revocar este código?")) action(`/api/admin/codes/${encodeURIComponent(c.code)}/revoke`); }}>Revocar</button><button className="control text-xs text-rose-300 hover:bg-rose-950/40" disabled={busy} onClick={() => { if (window.confirm("¿Eliminar este código?")) action(`/api/admin/codes/${encodeURIComponent(c.code)}`, null, "DELETE"); }}>Eliminar</button></div></td></tr>)}</tbody></table></div>
    <p className="text-xs text-slate-500 mt-3">Los códigos VIP se activan con el primer canje del usuario y cuentan con fecha de vencimiento fija según los días asignados.</p>
    {settings && <section className="metric mt-6 space-y-2 text-sm"><h3 className="font-semibold">Configuración IA del servidor</h3><p>Modelo: {settings.selectedModel}</p><p>En catálogo: {settings.modelAvailable ? "Sí" : "No disponible o catálogo inaccesible"}</p><p>Clave configurada: {settings.apiKeyConfigured ? "Sí" : "No"}</p><p className="text-slate-400">{settings.message}</p></section>}
  </Modal>;
}
