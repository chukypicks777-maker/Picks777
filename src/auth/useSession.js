import { useCallback, useEffect, useRef, useState } from 'react';
import { sessionRequest } from './sessionClient.js';
import { getStoredAiConfig } from '../utils/aiSettings.js';

export function useSession() {
  const [auth, setAuthState] = useState(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const revision = useRef(0);
  const setAuth = useCallback(value => {
    revision.current += 1;
    setAuthState(value);
  }, []);
  const refresh = useCallback(async (signal) => {
    const started = revision.current;
    setChecking(true);
    setError('');
    try {
      const data = await sessionRequest('session', {}, signal);
      if (!signal?.aborted && started === revision.current) setAuthState(data.success && data.user ? data : null);
    } catch (cause) {
      if (!signal?.aborted && started === revision.current) {
        // A connection failure cannot prove that the user's session ended.
        // Keep the last confirmed identity; protected data still requires the server.
        setError(cause.message || 'No se pudo comprobar la sesión. Reintenta la conexión.');
      }
    } finally {
      if (!signal?.aborted) setChecking(false);
    }
  }, []);
  useEffect(() => {
    getStoredAiConfig(); // Migrate old installations that persisted provider keys.
    try { localStorage.removeItem('deportepicks_auth'); } catch { /* Storage may be disabled. */ }
    const controller = new AbortController();
    void Promise.resolve().then(() => { if (!controller.signal.aborted) refresh(controller.signal); });
    return () => controller.abort();
  }, [refresh]);
  useEffect(() => {
    if (!auth?.valid || auth.isAdmin || !auth.user?.expiresAt) return;
    const end = Date.parse(auth.user.expiresAt);
    if (!Number.isFinite(end)) return;
    let timer;
    const check = () => {
      clearTimeout(timer);
      const remaining = end - Date.now();
      if (remaining <= 0) void refresh();
      else timer = setTimeout(check, Math.min(remaining, 2147483647));
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', check); };
  }, [auth, refresh]);
  return { auth, setAuth, checking, error, retry: () => refresh() };
}
