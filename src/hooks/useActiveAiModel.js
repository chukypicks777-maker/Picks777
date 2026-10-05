import { useEffect, useState } from 'react';
import { requestSports } from '../utils/sportsClient.js';

export default function useActiveAiModel(enabled) {
  const [model, setModel] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let controller;
    const load = async () => {
      controller?.abort();
      const request = new AbortController(); controller = request;
      try {
        const { response, result } = await requestSports('/api/settings/active-model', { signal: request.signal });
        if (active && !request.signal.aborted && response.ok && result.success) setModel(result);
      } catch { if (active && !request.signal.aborted) setModel(null); }
    };
    load();
    window.addEventListener('ai-settings-updated', load);
    return () => { active = false; controller?.abort(); window.removeEventListener('ai-settings-updated', load); };
  }, [enabled]);
  return enabled ? model : null;
}
