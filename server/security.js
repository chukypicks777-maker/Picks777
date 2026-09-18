import { PROVIDER_PRESETS } from '../src/constants/aiProviders.js';
export function validateAiConfig(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configuración inválida.');
  const provider = input.provider || 'openrouter';
  if (!Object.hasOwn(PROVIDER_PRESETS, provider)) throw new Error('Proveedor inválido.');
  for (const [key, max] of [['apiKey', 2048], ['selectedModel', 200], ['modelName', 200], ['baseUrl', 500]]) {
    if (input[key] !== undefined && (typeof input[key] !== 'string' || input[key].length > max || [...input[key]].some(c => c.charCodeAt(0) < 32))) throw new Error(`Campo ${key} inválido.`);
  }
  let rawUrl = input.baseUrl || PROVIDER_PRESETS[provider].defaultBaseUrl;
  const url = new URL(rawUrl);
  if ((url.hostname === 'agentrouter.org' || url.hostname === 'co.agentrouter.org') && (url.pathname === '/' || url.pathname === '')) {
    url.pathname = '/v1';
  }

  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) {
    throw new Error('URL de IA no permitida. Usa HTTPS y un endpoint sin puertos especiales ni parámetros.');
  }

  const h = url.hostname.toLowerCase();
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

  return { ...input, provider, baseUrl: url.href.replace(/\/+$/, '') };
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
