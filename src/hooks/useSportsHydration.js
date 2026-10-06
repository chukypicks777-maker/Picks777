import { useEffect, useRef, useState } from 'react';
import { requestSports, saveSportDetail, sportDetailFresh, sportMatchVersion } from '../utils/sportsClient.js';
import { isKnownFixture } from '../utils/fixtureEligibility.js';

// Data work follows the calendar, independently of filters, card visibility and
// scroll. One bounded batch is in flight; a batch causes one React feed update.
export default function useSportsHydration({ sport, enabled, sessionKey, revision, matches, patchMatches, onSessionExpired }) {
  const workerRef = useRef(null), callbackRef = useRef({ patchMatches, onSessionExpired });
  const [state, setState] = useState({ pending: 0, failed: 0 });
  useEffect(() => { callbackRef.current = { patchMatches, onSessionExpired }; }, [patchMatches, onSessionExpired]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const worker = { queue: [], queued: new Set(), attempted: new Map(), busy: false, failed: new Set(), controller };
    workerRef.current = worker;
    worker.pump = async () => {
      if (worker.busy || controller.signal.aborted) return;
      worker.busy = true;
      while (worker.queue.length && !controller.signal.aborted) {
        const league = sport === 'tenis' ? 'all' : worker.queue[0].leagueId;
        const batch = worker.queue.filter(match => league === 'all' || match.leagueId === league).slice(0, sport === 'beisbol' ? 4 : 12);
        const ids = new Set(batch.map(match => match.id));
        worker.queue = worker.queue.filter(match => !ids.has(match.id));
        try {
          const { response, result } = await requestSports(`/api/sports/${sport}/details`, {
            method: 'POST', body: { ids: [...ids], league }, signal: controller.signal, timeoutMs: 55000
          });
          if (controller.signal.aborted) break;
          if (response.status === 401 || response.status === 403 && result.trialExpired) { callbackRef.current.onSessionExpired?.(result); break; }
          if (!response.ok || !result.success || !Array.isArray(result.matches)) throw new Error('Historial no disponible.');
          const returned = new Map(result.matches.map(match => [match.id, match])), updates = [];
          for (const original of batch) {
            const detail = returned.get(original.id);
            if (!detail) { worker.failed.add(original.id); continue; }
            worker.failed.delete(original.id);
            updates.push({ original, detail: saveSportDetail(sessionKey, sport, original, detail) });
          }
          callbackRef.current.patchMatches(updates);
        } catch {
          if (!controller.signal.aborted) batch.forEach(match => worker.failed.add(match.id));
        } finally {
          for (const original of batch) { const key = sportMatchVersion(original); worker.queued.delete(key); worker.attempted.set(key, Date.now()); }
        }
        if (!controller.signal.aborted) setState({ pending: worker.queue.length, failed: worker.failed.size });
      }
      worker.busy = false;
    };
    return () => { controller.abort(); workerRef.current = null; };
  }, [sport, enabled, sessionKey, revision]);

  useEffect(() => {
    const worker = workerRef.current;
    if (!enabled || !worker) return;
    for (const match of matches) {
      if (!isKnownFixture(match) || sportDetailFresh(match)) continue;
      const key = sportMatchVersion(match);
      if (worker.queued.has(key) || Date.now() - (worker.attempted.get(key) || 0) < 60000) continue;
      worker.attempted.set(key, Date.now());
      worker.queued.add(key);
      worker.queue.push(match);
    }
    if (worker.queue.length) {
      setState({ pending: worker.queue.length, failed: worker.failed.size });
      void worker.pump();
    }
  }, [matches, sport, enabled, sessionKey, revision]);
  return state;
}
