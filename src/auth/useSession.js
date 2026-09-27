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
    } catch {
      if (!signal?.aborted && started === revision.current) {
        setAuthState(null);
        setError('');
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
  return { auth, setAuth, checking, error, retry: () => refresh() };
}
