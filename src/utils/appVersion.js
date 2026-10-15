// Users keep the app open for days (installed app, background tab). The build
// served now is published at /version.json; when it differs from the running
// one, the app offers to reload and reloads by itself when the user comes back.
/* global __APP_BUILD__ */
export const APP_BUILD = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'dev';
const CHECK_MS = 5 * 60000;

export async function fetchServedBuild(fetcher = fetch) {
  try {
    const response = await fetcher(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data?.build === 'string' && data.build ? data.build : null;
  } catch { return null; }
}

export const isNewerBuild = served => Boolean(served) && APP_BUILD !== 'dev' && served !== APP_BUILD;

// Calls onUpdate(build) once a different build is served. Returns a stop function.
export function watchAppVersion(onUpdate, { fetcher = fetch, interval = CHECK_MS } = {}) {
  let stopped = false, notified = false;
  const check = async () => {
    if (stopped || notified) return;
    const served = await fetchServedBuild(fetcher);
    if (!stopped && isNewerBuild(served)) { notified = true; onUpdate(served); }
  };
  const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
  const timer = setInterval(check, interval);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  void check();
  return () => { stopped = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible); };
}
