import { useEffect, useSyncExternalStore } from 'react';
import { SOCIAL_LINKS } from '../constants/socials';
let links = SOCIAL_LINKS;
let pending;
let revision = -1;
const listeners = new Set();
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export function updateSocialLinks(settings) {
  if (!Array.isArray(settings?.links) || settings.links.length !== 3) return;
  if (!Number.isInteger(settings.revision) || settings.revision < revision) return;
  revision = settings.revision;
  links = settings.links;
  for (const listener of listeners) listener();
}
async function refresh() {
  if (pending) return pending;
  pending = fetch('/api/community').then(r => r.json()).then(d => { if (d.success) updateSocialLinks(d.settings); }).catch(() => {}).finally(() => { pending = null; });
  return pending;
}
export function useSocialLinks() {
  const value = useSyncExternalStore(subscribe, () => links, () => SOCIAL_LINKS);
  useEffect(() => { refresh(); const timer = setInterval(refresh, 60000); return () => clearInterval(timer); }, []);
  return value;
}
