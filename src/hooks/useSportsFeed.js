import { useCallback, useEffect, useRef, useState } from 'react';
import { SPORT_LEAGUES } from '../constants/leagues.js';
import { readSportsCache, saveSportsCache, readSportDetail, mergeSportDetail, sportMatchVersion, requestSports } from '../utils/sportsClient.js';

const empty = { matches: [], coverage: [] };
const order = { LIVE: 0, SCHEDULED: 1, FINISHED: 2 };

export default function useSportsFeed({ sport, enabled, sessionKey, revision, onSessionExpired }) {
  const [feed, setFeed] = useState(() => enabled ? readSportsCache(sessionKey, sport) || empty : empty);
  const [pending, setPending] = useState([]);
  const onExpired = useRef(onSessionExpired);
  useEffect(() => { onExpired.current = onSessionExpired; }, [onSessionExpired]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let active = true, busy = false, initialized = false;
    const groups = sport === 'tenis' ? ['all'] : SPORT_LEAGUES[sport].map(league => league.id);
    const saved = readSportsCache(sessionKey, sport);
    const load = async () => {
      await Promise.resolve();
      // Visibility changes and polling must not cancel an in-flight calendar.
      if (busy || !active) return;
      busy = true;
      if (!initialized) {
        initialized = true;
        setFeed(saved || { matches: [], coverage: SPORT_LEAGUES[sport].map(league => ({ leagueId: league.id, name: league.name, status: 'loading' })) });
      }
      setPending(groups);
      await Promise.allSettled(groups.map(async group => {
        let payload;
        try {
          const { response, result } = await requestSports(`/api/sports/${sport}${group === 'all' ? '' : `?league=${group}`}`, { signal: controller.signal });
          if (!active) return;
          if (response.status === 401 || response.status === 403 && result.trialExpired) { onExpired.current?.(result); return; }
          if (!response.ok || !result.success || !Array.isArray(result.matches)) throw new Error(result.message || 'No se pudo consultar el calendario.');
          payload = { matches: result.matches, coverage: result.coverage || [] };
        } catch (error) {
          if (!active) return;
          payload = { matches: [], coverage: SPORT_LEAGUES[sport].filter(league => group === 'all' || league.id === group).map(league => ({ leagueId: league.id, name: league.name, status: 'unavailable', error: error.message || 'Revisa la conexión y reintenta.' })) };
        }
        if (!active) return;
        setFeed(previous => {
          const owns = match => group === 'all' || match.leagueId === group;
          const incoming = payload.matches.filter(owns).map(match => {
            const old = previous.matches.find(item => item.id === match.id);
            const detail = readSportDetail(sessionKey, sport, match);
            // Never apply a report from a different score, date or quote.
            return detail || (old?.detailLoadedAt && Date.now() - old.detailLoadedAt < 60000 && sportMatchVersion(old) === sportMatchVersion(match)
              ? { ...old, ...match, analysis: old.analysis, detailLoadedAt: old.detailLoadedAt } : match);
          });
          const next = {
            matches: [...previous.matches.filter(match => !owns(match)), ...incoming].sort((a, b) => ((order[a.status] ?? 3) - (order[b.status] ?? 3)) || Date.parse(a.kickoff) - Date.parse(b.kickoff)),
            coverage: [...previous.coverage.filter(item => !owns(item)), ...payload.coverage.filter(owns)]
          };
          saveSportsCache(sessionKey, sport, next);
          return next;
        });
        setPending(previous => previous.filter(item => item !== group));
      }));
      busy = false;
    };
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, 60000);
    const visible = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [sport, enabled, sessionKey, revision]);

  const patchMatch = useCallback((original, detail) => {
    setFeed(previous => {
      const next = { ...previous, matches: previous.matches.map(current => {
        if (current.id !== original.id) return current;
        const merged = mergeSportDetail(current, original, detail);
        return merged === current ? current : { ...merged, detailLoadedAt: Date.now() };
      }) };
      saveSportsCache(sessionKey, sport, next);
      return next;
    });
  }, [sessionKey, sport]);
  return { feed: enabled ? feed : empty, pending: enabled ? pending : [], patchMatch };
}
