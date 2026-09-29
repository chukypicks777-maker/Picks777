import { useEffect, useSyncExternalStore } from 'react';
import { SOCIAL_LINKS } from '../constants/socials';

const STORAGE_KEY = 'picks_social_settings';

const loadInitialState = () => {
  if (typeof window === 'undefined') return { links: SOCIAL_LINKS, revision: -1 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.links) && parsed.links.length === 3) {
        return { links: parsed.links, promoImageVisible: parsed.promoImageVisible !== false, revision: Number.isInteger(parsed.revision) ? parsed.revision : 0 };
      }
    }
  } catch {}
  return { links: SOCIAL_LINKS, revision: -1 };
};

const initialState = loadInitialState();
let links = initialState.links;
// Wait for the server before showing the promotion; a cached "on" must not
// briefly reveal an image the Owner has since disabled.
let promoImageVisible = false;
let pending;
let revision = initialState.revision;
const listeners = new Set();
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };

export function getSocialLink(socialLinks, platformId) {
  const list = Array.isArray(socialLinks) ? socialLinks : links;
  const found = list.find(s => s && s.id === platformId);
  if (found && found.url) return found;
  const fallback = SOCIAL_LINKS.find(s => s.id === platformId);
  return fallback || { id: platformId, name: platformId, label: '', handle: '', url: '#' };
}

export function updateSocialLinks(settings) {
  if (!Array.isArray(settings?.links) || settings.links.length !== 3) return;
  const targetRevision = Number.isInteger(settings.revision) ? settings.revision : (revision < 0 ? 1 : revision + 1);
  if (Number.isInteger(settings.revision) && settings.revision < revision) return;
  revision = targetRevision;
  links = settings.links;
  promoImageVisible = settings.promoImageVisible !== false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      links,
      promoImageVisible,
      revision,
      updatedAt: settings.updatedAt || new Date().toISOString()
    }));
  } catch {}
  for (const listener of listeners) listener();
}

async function refresh() {
  if (pending) return pending;
  pending = fetch('/api/community')
    .then(r => r.json())
    .then(d => {
      if (d.success && d.settings) {
        if (d.settings.revision >= revision) {
          updateSocialLinks(d.settings);
        }
      }
    })
    .catch(() => {})
    .finally(() => { pending = null; });
  return pending;
}

export function useSocialLinks() {
  const value = useSyncExternalStore(subscribe, () => links, () => SOCIAL_LINKS);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 60000);
    return () => clearInterval(timer);
  }, []);
  return value;
}
export function usePromoImageVisible() {
  return useSyncExternalStore(subscribe, () => promoImageVisible, () => false);
}
