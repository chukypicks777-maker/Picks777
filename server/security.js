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
  // Custom hosts must be explicitly allowlisted by the deployment owner or belong to known trusted providers
  const allowed = provider === 'custom'
    ? ['api.openai.com', 'agentrouter.org', 'co.agentrouter.org', 'api.together.xyz', 'api.mistral.ai', 'api.perplexity.ai', ...(process.env.AI_ALLOWED_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean)]
    : provider === 'agentrouter'
    ? ['agentrouter.org', 'co.agentrouter.org']
    : [new URL(PROVIDER_PRESETS[provider].defaultBaseUrl).hostname];
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || !allowed.includes(url.hostname)) throw new Error('URL de IA no permitida. Usa HTTPS y un proveedor autorizado.');
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
