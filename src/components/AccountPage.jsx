import { useState } from 'react';
import { useSession } from '../auth/useSession';
import { identityProvider } from '../auth/providers';
import { sessionRequest } from '../auth/sessionClient';
import { clearAllAnalysisCache } from '../utils/analysisCache';

export default function AccountPage() {
  const { auth, setAuth, checking, error } = useSession();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [deleted, setDeleted] = useState(false);
  async function remove() {
    if (!confirmed || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const identity = await identityProvider().signIn();
      const result = await sessionRequest('delete-account', { credential: identity.token });
      await identityProvider().signOut().catch(() => {});
      setAuth(null);
      clearAllAnalysisCache();
      setDeleted(true);
      setMessage(result.message);
    } catch (cause) { setMessage(cause.message || 'No se pudo eliminar la cuenta.'); }
    finally { setBusy(false); }
  }
  return <main className="max-w-xl mx-auto p-6 min-h-dvh space-y-5">
    <a href="/" className="text-sky-400">← Volver a 777 Picks</a>
    <h1 className="text-2xl font-bold">Eliminar mi cuenta</h1>
    <p>Se eliminarán tu perfil, correo, foto, registro de prueba y vínculo de acceso en 777 Picks, incluida la identidad de esta aplicación en Firebase. Tu cuenta de Google permanece intacta.</p>
    <p>Los códigos conservarán su estado de activación y vencimiento sin tu nombre ni correo. Las copias de respaldo del alojamiento se rigen por la política del responsable del servicio.</p>
    <p>Esta operación es permanente. Perderás el acceso asociado a la cuenta.</p>
    {checking ? <p role="status">Comprobando tu sesión…</p> : error ? <p role="alert">{error}</p> : !auth?.user?.id && !deleted ?
      <p>Para verificar que eres el titular, <a href="/" className="text-sky-400 underline">inicia sesión</a> y vuelve a esta página. Puedes eliminar tu cuenta aunque la prueba haya vencido.</p> : !deleted && <>
        <p>Cuenta: {auth?.user?.email}</p>
        <label className="flex gap-3 items-start"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Entiendo y quiero eliminar mi cuenta y mis datos.</label>
        <button className="bg-red-700 text-white rounded-xl p-3 disabled:opacity-50" disabled={!confirmed || busy} onClick={remove}>{busy ? 'Procesando…' : 'Confirmar con Google y eliminar'}</button>
      </>}
    {message && <p role="status">{message}</p>}
  </main>;
}
