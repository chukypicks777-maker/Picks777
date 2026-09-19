const STORAGE_KEY = 'picks_ai_settings';

export function sanitizeApiKey(key) {
  if (!key || typeof key !== 'string') return '';
  return key.trim()
    .replace(/^bearer\s+/i, '')
    .replace(/^["']|["']$/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

export function maskKey(key) {
  const clean = sanitizeApiKey(key);
  if (!clean) return '';
  if (clean.length <= 8) return '••••••••';
  return `${clean.slice(0, 6)}••••••••${clean.slice(-4)}`;
}

export function getStoredAiConfig() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const config = JSON.parse(raw);
      if (config.apiKey) {
        delete config.apiKey;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      }
      return config;
    }
  } catch {}
  return null;
}

export function saveStoredAiConfig(config) {
  if (typeof window === 'undefined' || !config || typeof config !== 'object') return;
  try {
    const prev = getStoredAiConfig() || {};
    const cleanConfig = Object.fromEntries(
      Object.entries(config).filter(([, v]) => v !== undefined)
    );
    const merged = { ...prev, ...cleanConfig, updatedAt: new Date().toISOString() };
    delete merged.apiKey;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent('ai-settings-updated', { detail: merged }));
    return merged;
  } catch {}
}

