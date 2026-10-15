import { useSyncExternalStore } from 'react';

// A single shared clock keeps freshness badges and disabled actions in sync. It
// ticks every 30 seconds while any component uses it (no provider needed: the
// previous context had lost its provider and always answered 0).
let now = Date.now(), timer = null;
const listeners = new Set();
function subscribe(listener) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => { now = Date.now(); listeners.forEach(notify => notify()); }, 30000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { clearInterval(timer); timer = null; }
  };
}
export function useClock() { return useSyncExternalStore(subscribe, () => now, () => now); }
