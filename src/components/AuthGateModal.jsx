import { useState } from 'react';
import { KeyRound, ArrowRight } from 'lucide-react';
import { api } from '../utils/api';
export default function AuthGateModal({ onAuthenticated }) {
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setLoading(true); setError('');
    try { onAuthenticated(await api('/api/auth/verify-code', { method: 'POST', body: JSON.stringify({ username, code }) })); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  return <main className="min-h-screen grid place-items-center px-5 py-12">
    <section className="terminal-card rounded-3xl p-7 sm:p-12 w-full max-w-lg">
      <div className="mb-8 flex items-center gap-3 text-emerald-300"><KeyRound size={30} /><span className="font-mono text-xs tracking-[0.25em]">DEPORTEPICKS / ACCESO VIP</span></div>
      <h1 className="text-4xl font-bold tracking-tight mb-4">Más contexto.<br /><span className="text-sky-300">Menos suposiciones.</span></h1>
      <p className="text-slate-400 mb-8 leading-relaxed">Fútbol, datos del proveedor y análisis transparente. Accede con el código que te entrega el administrador.</p>
      <form onSubmit={submit} className="space-y-5">
        <label className="block text-sm">Nombre o alias<input autoComplete="nickname" maxLength={80} required className="field mt-2" value={username} onChange={e => setUsername(e.target.value)} /></label>
        <label className="block text-sm">Código de acceso<input type="password" autoComplete="current-password" required maxLength={128} className="field mt-2 font-mono" value={code} onChange={e => setCode(e.target.value)} /></label>
        {error && <p role="alert" className="notice-error">{error}</p>}
        <button className="primary w-full justify-center" disabled={loading}>{loading ? 'Validando acceso…' : 'Entrar a DeportePicks'}<ArrowRight size={17} /></button>
      </form>
      <p className="text-xs text-slate-500 mt-7">Solo mayores de 18 años. Las estimaciones no garantizan resultados ni ganancias. La vigencia comienza con la primera activación.</p>
    </section>
  </main>;
}
