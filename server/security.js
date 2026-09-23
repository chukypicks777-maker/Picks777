import { PROVIDER_PRESETS } from '../src/constants/aiProviders.js';
export function validateAiConfig(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configuración inválida.');
  const explicitProvider = input.provider === 'openrouter' ? 'custom' : input.provider;
  let provider = input.provider || 'custom';
  if (provider === 'openrouter') provider = 'custom';
  if (!Object.hasOwn(PROVIDER_PRESETS, provider)) throw new Error('Proveedor inválido.');
  let cleanApiKey = input.apiKey;
  if (cleanApiKey !== undefined && cleanApiKey !== null && typeof cleanApiKey === 'string') {
    cleanApiKey = cleanApiKey.trim()
      .replace(/^bearer\s+/i, '')
      .replace(/^["']|["']$/g, '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim();
  }

  const fieldsToCheck = [
    ['apiKey', cleanApiKey, 2048],
    ['selectedModel', typeof input.selectedModel === 'string' ? input.selectedModel.trim() : input.selectedModel, 200],
    ['modelName', typeof input.modelName === 'string' ? input.modelName.trim() : input.modelName, 200],
    ['baseUrl', typeof input.baseUrl === 'string' ? input.baseUrl.trim() : input.baseUrl, 500]
  ];

  for (const [key, val, max] of fieldsToCheck) {
    if (val !== undefined && val !== null) {
      if (typeof val !== 'string' || val.length > max || [...val].some(c => c.charCodeAt(0) < 32)) {
        throw new Error(`Campo ${key} inválido.`);
      }
    }
  }
  let rawUrl = (input.baseUrl && typeof input.baseUrl === 'string' && input.baseUrl.trim()) ? input.baseUrl.trim() : (PROVIDER_PRESETS[provider]?.defaultBaseUrl || 'https://vyceai.com/v1');
  if (rawUrl.includes('openrouter.ai')) {
    rawUrl = PROVIDER_PRESETS[provider]?.defaultBaseUrl || 'https://vyceai.com/v1';
  }
  if (!rawUrl) throw new Error('Ingresa la URL base HTTPS del proveedor.');
  if (!/^https?:\/\//i.test(rawUrl)) {
    rawUrl = 'https://' + rawUrl;
  }
  const url = new URL(rawUrl);
  const h = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/(chat\/completions|models|messages)\/?$/, '').replace(/\/+$/, '') || '/';

  // Inferir automáticamente si el host pertenece a uno conocido
  if (h === 'agentrouter.org' || h === 'co.agentrouter.org') {
    if (explicitProvider !== 'custom') {
      provider = 'agentrouter';
    }
    if (url.pathname === '/' || url.pathname === '') {
      url.pathname = '/v1';
    }
  } else if (explicitProvider !== 'custom') {
    if (h === 'api.deepseek.com') {
      provider = 'deepseek';
    } else if (h === 'api.groq.com') {
      provider = 'groq';
    } else if (h === 'generativelanguage.googleapis.com') {
      provider = 'gemini';
    }
  }

  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) {
    throw new Error('URL de IA no permitida. Usa HTTPS y un endpoint sin puertos especiales ni parámetros.');
  }

  const isPrivateOrLocal = h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]' ||
    h.endsWith('.local') || h.endsWith('.internal') ||
    /^(?:10\.|127\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)/.test(h) ||
    /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':') || h.startsWith('[') || h.endsWith(']') || !h.includes('.');

  if (isPrivateOrLocal) {
    throw new Error('URL de IA no permitida. No se permiten IPs locales o privadas.');
  }

  if (provider === 'custom') {
    // Para proveedor personalizado se permite cualquier dominio público HTTPS de internet
  } else if (provider === 'agentrouter') {
    if (h !== 'agentrouter.org' && h !== 'co.agentrouter.org') {
      throw new Error('URL de IA no permitida para Agent Router.');
    }
  } else {
    const expectedHost = new URL(PROVIDER_PRESETS[provider].defaultBaseUrl).hostname;
    if (h !== expectedHost) {
      throw new Error(`URL de IA no permitida. Usa el host oficial ${expectedHost}.`);
    }
  }

  let selectedModel = input.selectedModel?.trim();
  if (selectedModel && selectedModel.includes('openrouter')) {
    selectedModel = 'deepseek-v4.1';
  }
  let modelName = input.modelName?.trim();
  if (modelName && modelName.toLowerCase().includes('openrouter')) {
    modelName = 'DeepSeek V4.1 Flash';
  }

  return { ...input, apiKey: cleanApiKey, provider, baseUrl: url.href.replace(/\/+$/, ''), selectedModel, modelName };
}

// A saved key belongs to one provider and API base, never to an arbitrary new host.
export function resolveAiConfig(input = {}, current = {}) {
  let inProv = input.provider;
  if (inProv === 'openrouter') inProv = 'custom';
  let curProv = current.provider;
  if (curProv === 'openrouter') curProv = 'custom';
  const provider = inProv || curProv || 'custom';
  const target = validateAiConfig({ ...input, provider,
    baseUrl: input.baseUrl || (provider === curProv ? current.baseUrl : undefined) });
  let sameDestination = false;
  try {
    const saved = validateAiConfig(current);
    sameDestination = target.provider === saved.provider && target.baseUrl === saved.baseUrl;
  } catch { /* No valid saved configuration. */ }
  return { ...target,
    apiKey: target.apiKey || (sameDestination ? current.apiKey : '') || '',
    selectedModel: target.selectedModel ?? (sameDestination ? current.selectedModel : ''),
    modelName: target.modelName ?? (sameDestination ? current.modelName : '') };
}

export function protectMutations(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ success: false, message: 'Origen no permitido.' });
  if (req.headers.origin) {
    try {
      const origin = new URL(req.headers.origin);
      const allowed = (process.env.APP_ORIGINS || '').split(',').map(s => s.trim());
      if (origin.host !== req.get('host') && !allowed.includes(origin.origin)) throw new Error();
    } catch { return res.status(403).json({ success: false, message: 'Origen no permitido.' }); }
  }
  const hasBody = Number(req.headers['content-length']) > 0 || Boolean(req.headers['transfer-encoding']);
  if (hasBody && !req.is('application/json')) return res.status(415).json({ success: false, message: 'Se requiere JSON.' });
  next();
}
