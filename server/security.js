import { PROVIDER_PRESETS } from '../src/constants/aiProviders.js';
export function validateAiConfig(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configuración inválida.');
  let provider = input.provider || 'openrouter';
  if (!Object.hasOwn(PROVIDER_PRESETS, provider)) throw new Error('Proveedor inválido.');
  for (const [key, max] of [['apiKey', 2048], ['selectedModel', 200], ['modelName', 200], ['baseUrl', 500]]) {
    if (input[key] !== undefined && (typeof input[key] !== 'string' || input[key].length > max || [...input[key]].some(c => c.charCodeAt(0) < 32))) throw new Error(`Campo ${key} inválido.`);
  }
  let rawUrl = (input.baseUrl && typeof input.baseUrl === 'string' && input.baseUrl.trim()) ? input.baseUrl.trim() : PROVIDER_PRESETS[provider].defaultBaseUrl;
  if (!/^https?:\/\//i.test(rawUrl)) {
    rawUrl = 'https://' + rawUrl;
  }
  const url = new URL(rawUrl);
  const h = url.hostname.toLowerCase();

  // Si no es un proveedor 'custom' explícito, inferir automáticamente el proveedor si el host pertenece a uno conocido
  if (provider !== 'custom') {
    if (h === 'agentrouter.org' || h === 'co.agentrouter.org') {
      provider = 'agentrouter';
    } else if (h === 'openrouter.ai') {
      provider = 'openrouter';
    } else if (h === 'api.deepseek.com') {
      provider = 'deepseek';
    } else if (h === 'api.groq.com') {
      provider = 'groq';
    } else if (h === 'generativelanguage.googleapis.com') {
      provider = 'gemini';
    }
  }

  if ((h === 'agentrouter.org' || h === 'co.agentrouter.org') && (url.pathname === '/' || url.pathname === '')) {
    url.pathname = '/v1';
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

  let selectedModel = input.selectedModel;
  let modelName = input.modelName;
  const isAgentRouter = provider === 'agentrouter' || h === 'agentrouter.org' || h === 'co.agentrouter.org';
  if (isAgentRouter && (!selectedModel || selectedModel === 'gpt-4o-mini' || selectedModel.startsWith('~') || selectedModel.includes(':free') || selectedModel.includes('nemotron'))) {
    selectedModel = 'deepseek-v4-flash';
    if (!modelName || modelName === 'gpt-4o-mini' || modelName.startsWith('~') || modelName.includes(':free') || modelName.includes('nemotron')) modelName = 'deepseek-v4-flash';
  }

  return { ...input, provider, baseUrl: url.href.replace(/\/+$/, ''), selectedModel, modelName };
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
