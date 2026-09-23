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
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        let changed = false;
        if (parsed.provider === 'openrouter') {
          parsed.provider = 'custom';
          parsed.baseUrl = 'https://vyceai.com/v1';
          changed = true;
        }
        if (typeof parsed.baseUrl === 'string' && parsed.baseUrl.includes('openrouter.ai')) {
          parsed.baseUrl = 'https://vyceai.com/v1';
          changed = true;
        }
        if (typeof parsed.selectedModel === 'string' && parsed.selectedModel.includes('openrouter')) {
          parsed.selectedModel = 'deepseek-v4.1';
          parsed.modelName = 'DeepSeek V4.1 Flash';
          changed = true;
        }
        if (changed) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        }
        return parsed;
      }
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
    if (cleanConfig.provider === 'openrouter') {
      cleanConfig.provider = 'custom';
      cleanConfig.baseUrl = 'https://vyceai.com/v1';
    }
    if (typeof cleanConfig.baseUrl === 'string' && cleanConfig.baseUrl.includes('openrouter.ai')) {
      cleanConfig.baseUrl = 'https://vyceai.com/v1';
    }
    if (typeof cleanConfig.selectedModel === 'string' && cleanConfig.selectedModel.includes('openrouter')) {
      cleanConfig.selectedModel = 'deepseek-v4.1';
      cleanConfig.modelName = 'DeepSeek V4.1 Flash';
    }
    // Preserve existing key if new key was not provided or is empty
    if (!cleanConfig.apiKey && prev.apiKey && cleanConfig.clearApiKey !== true) {
      cleanConfig.apiKey = prev.apiKey;
    }
    const merged = { ...prev, ...cleanConfig, updatedAt: new Date().toISOString() };
    delete merged.clearApiKey;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent('ai-settings-updated', { detail: merged }));
    return merged;
  } catch {}
}

