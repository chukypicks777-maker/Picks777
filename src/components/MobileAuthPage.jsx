import { useEffect, useState } from 'react';
import { loginWithRealGoogle, loginWithRealApple, logoutIdentity } from '../utils/firebase.js';
import { sessionRequest } from '../auth/sessionClient.js';
export default function MobileAuthPage() {
  const [id] = useState(() => window.location.hash.slice(1));
  const [provider] = useState(() => new URLSearchParams(window.location.search).get('provider') === 'apple' ? 'apple' : 'google');
  useEffect(() => { window.history.replaceState(null, '', '/mobile-auth'); }, []);
  const [identity, setIdentity] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const valid = /^[a-f0-9]{64}$/.test(id);
  async function login() {
    setBusy(true); setError('');
    try { setIdentity(await (provider === 'apple' ? loginWithRealApple : loginWithRealGoogle)()); }
    catch (cause) { setError(cause.message || 'No se pudo abrir Google.'); }
    finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true); setError('');
    try {
      await sessionRequest('mobile/complete', { id, credential: identity.token, ...(provider === 'apple' ? { provider } : {}) });
      setIdentity(null); setDone(true);
      await logoutIdentity().catch(() => {});
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }
  return <main className="max-w-lg mx-auto p-6 min-h-dvh space-y-5">
    <h1 className="text-2xl font-bold">Acceso a 777 Picks</h1>
    <p>Confirma únicamente solicitudes que acabas de iniciar desde tu aplicación. No compartas este enlace.</p>
    {!valid ? <p role="alert">Solicitud no válida. Vuelve a la aplicación y pulsa Continuar con Google.</p> : done ? <>
      <p role="status">Identidad confirmada. Vuelve a la aplicación para continuar.</p>
      <a className="inline-block bg-emerald-700 rounded-xl p-3" href="picks777://auth-return">Volver a 777 Picks</a>
      <p>Si el enlace no abre la app, vuelve con el selector de aplicaciones del teléfono.</p>
    </> : identity ? <>
      <p>Vas a confirmar esta cuenta en tu aplicación: <strong>{identity.user.email}</strong></p>
      <button className="bg-emerald-700 rounded-xl p-3" disabled={busy} onClick={confirm}>Confirmar esta cuenta</button>
      <button className="block p-3" disabled={busy} onClick={() => setIdentity(null)}>Elegir otra cuenta</button>
    </> : <button className="bg-emerald-700 rounded-xl p-3" disabled={busy} onClick={login}>{busy ? 'Conectando…' : provider === 'apple' ? 'Continuar con Apple' : 'Continuar con Google'}</button>}
    {error && <p role="alert">{error}</p>}
  </main>;
}
