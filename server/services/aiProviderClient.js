import { validateAiConfig } from '../security.js';

function providerError(message, code, status = null) {
  return Object.assign(new Error(message), { code, status, isWafChallenge: code === 'WAF_CHALLENGE' });
}

// Preserve upstream diagnostics without returning HTML or credentials.
async function requestJson(url, { apiKey, ...options }) {
  let response, text;
  try {
    response = await fetch(url, { ...options, redirect: 'error' });
    text = await response.text();
  } catch (error) {
    const timeout = error.name === 'TimeoutError' || error.name === 'AbortError';
    throw providerError(timeout ? 'El proveedor agotó el tiempo de espera. Intenta nuevamente.' : 'No se pudo establecer la conexión HTTPS con el proveedor. Revisa la URL y su disponibilidad.', timeout ? 'TIMEOUT' : 'NETWORK_ERROR');
  }
  if (/^\s*</.test(text) || /text\/html/i.test(response.headers.get('content-type') || '')) {
    const waf = /aliyun_waf|AliyunCaptcha|captcha|challenge|cloudflare/i.test(text);
    throw providerError(waf
      ? `El proveedor devolvió un bloqueo o verificación web (HTTP ${response.status}), no una respuesta de API. Revisa su endpoint de API o contacta a su soporte; cambiar el modelo no resuelve este bloqueo.`
      : `La URL devolvió una página HTML (HTTP ${response.status}). Comprueba la URL base de la API.`, waf ? 'WAF_CHALLENGE' : 'INVALID_ENDPOINT', response.status);
  }
  let data;
  try { data = JSON.parse(text); } catch {
    throw providerError(`El proveedor devolvió una respuesta que no es JSON (HTTP ${response.status}).`, 'INVALID_RESPONSE', response.status);
  }
  if (!response.ok || data?.error || data?.success === false) {
    let detail = String(data?.error?.message || data?.message || data?.msg || (typeof data?.error === 'string' ? data.error : '') || 'Solicitud rechazada.');
    if (apiKey) detail = detail.split(apiKey).join('[clave oculta]');
    detail = detail.replace(/Bearer\s+\S+|sk-[\w-]+/gi, '[clave oculta]').replace(/<[^>]*>/g, '').slice(0, 350);
    let code = 'PROVIDER_ERROR', hint = '';
    if (/unauthorized client/i.test(detail)) { code = 'CLIENT_NOT_AUTHORIZED'; hint = 'El proveedor no autoriza este cliente. Solicita a su soporte habilitar el acceso desde tu aplicación; guardar otra vez la clave no elimina este bloqueo.'; }
    else if (response.status === 401) { code = 'AUTH_ERROR'; hint = 'Revisa la clave de este proveedor.'; }
    else if (response.status === 403) { code = 'ACCESS_DENIED'; hint = 'El proveedor denegó el acceso.'; }
    else if (response.status === 429) { code = 'RATE_LIMIT'; hint = 'El proveedor indica un límite de solicitudes o cuota.'; }
    else if (response.status === 402 || /quota|budget|余额|额度/i.test(detail)) { code = 'QUOTA_ERROR'; hint = 'Revisa la cuota del token y del modelo en el proveedor.'; }
    else if (response.status === 404 || /no available channel|无可用渠道|model.*not found/i.test(detail)) { code = 'MODEL_OR_ENDPOINT'; hint = 'Revisa el ID del modelo y el endpoint.'; }
    throw providerError(`HTTP ${response.status}: ${detail}${hint ? ' ' + hint : ''}`, code, response.status);
  }
  return data;
}

export async function fetchProviderModels(provider = 'custom', apiKey = '', baseUrl = '') {
  ({ provider, apiKey, baseUrl } = validateAiConfig({ provider, apiKey, baseUrl }));
  if (!apiKey) throw providerError('Ingresa la clave de este proveedor para consultar sus modelos.', 'MISSING_KEY');
  const gemini = provider === 'gemini';
  const headers = gemini ? { 'x-goog-api-key': apiKey } : apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  const data = await requestJson(`${baseUrl}/models`, { apiKey, headers, signal: AbortSignal.timeout(10000) });
  const models = gemini ? data?.models : data?.data;
  if (!Array.isArray(models)) throw providerError('La API no devolvió un catálogo de modelos válido. Puedes introducir el ID manualmente.', 'INVALID_CATALOG');
  return models.filter(m => gemini ? m.supportedGenerationMethods?.includes('generateContent') : typeof m.id === 'string').map(m => {
    const id = gemini ? m.name.replace(/^models\//, '') : m.id;
    return { id, name: m.displayName || m.name || id, description: m.description || '',
      isReasoning: /reason|think|\br1\b|\bo[134]\b/i.test(id),
      isFree: id.endsWith(':free') || Boolean(m.pricing && Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0),
      contextLength: m.context_length || m.inputTokenLimit || null };
  });
}

export function normalizeModelId(provider, model) {
  if (!model || typeof model !== 'string') return model;
  const trimmed = model.trim();
  if (provider === 'deepseek') {
    if (/^deepseek-v[34](\.[0-9]+)?(-flash)?$/i.test(trimmed)) return 'deepseek-chat';
    if (/^deepseek-r1$/i.test(trimmed)) return 'deepseek-reasoner';
  }
  return trimmed;
}

export async function executeAiChatCompletion({ provider = 'custom', apiKey, baseUrl, model, selectedModel, systemPrompt = '', userPrompt, maxTokens = 4000 }) {
  const chosenModel = model || selectedModel;
  const config = validateAiConfig({ provider, apiKey, baseUrl, selectedModel: chosenModel });
  ({ provider, apiKey, baseUrl } = config);
  model = normalizeModelId(provider, config.selectedModel);
  if (!apiKey) throw providerError('Ingresa la clave API de este proveedor.', 'MISSING_KEY');
  if (!model) throw providerError('Selecciona un modelo del catálogo o escribe su ID exacto.', 'MISSING_MODEL');
  const signal = AbortSignal.timeout(45000); // One request fits within the 60s hosting limit.
  let url, headers, body;
  const agentRouter = ['agentrouter.org', 'co.agentrouter.org'].includes(new URL(baseUrl).hostname);
  const anthropic = agentRouter && /^claude-/i.test(model);
  if (provider === 'gemini') {
    url = `${baseUrl}/models/${encodeURIComponent(model.replace(/^models\//, ''))}:generateContent`;
    headers = { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' };
    body = { ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }], generationConfig: { maxOutputTokens: maxTokens } };
  } else if (anthropic) {
    url = `${baseUrl}/messages`;
    headers = { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' };
    body = { model, max_tokens: maxTokens, ...(systemPrompt ? { system: systemPrompt } : {}), messages: [{ role: 'user', content: userPrompt }] };
  } else {
    url = `${baseUrl}/chat/completions`;
    headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
    body = { model, messages: [...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []), { role: 'user', content: userPrompt }] };
    // Never send both incompatible token-limit parameters.
    body[/^(?:openai\/)?(?:o[134](?:-|$)|gpt-5)/i.test(model) ? 'max_completion_tokens' : 'max_tokens'] = maxTokens;
  }
  const data = await requestJson(url, { method: 'POST', apiKey, headers, body: JSON.stringify(body), signal });
  let choice = data.choices?.[0];
  let content = provider === 'gemini'
    ? data.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text || '').join('')
    : anthropic ? data.content?.filter(p => p.type === 'text').map(p => p.text).join('') : (choice?.message?.content || choice?.message?.reasoning || choice?.text);
  if (provider === 'gemini' && !content) {
    content = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('');
  }
  let text = typeof content === 'string' ? content : Array.isArray(content) ? content.filter(p => p.type === 'text').map(p => p.text).join('') : '';
  if (!text?.trim() && choice?.message?.reasoning) {
    text = String(choice.message.reasoning);
  }
  if (!text?.trim()) throw providerError('El proveedor no devolvió una respuesta final de texto. Puede haber agotado el límite de generación.', 'EMPTY_RESPONSE');
  return text;
}

export async function testAiConnection(config) {
  const start = Date.now();
  try {
    const validated = validateAiConfig(config);
    const raw = await executeAiChatCompletion({ ...validated, model: validated.selectedModel, maxTokens: 1024,
      systemPrompt: 'You are a helpful assistant.', userPrompt: 'Reply with the single word OK.' });
    const latencyMs = Date.now() - start;
    return { success: true, latencyMs, model: validated.selectedModel, provider: validated.provider,
      baseUrl: validated.baseUrl, sample: raw.trim().slice(0, 120),
      message: `Conexión verificada con ${validated.selectedModel} (${latencyMs} ms).` };
  } catch (error) {
    return { success: false, latencyMs: Date.now() - start, code: error.code || 'INVALID_CONFIG',
      upstreamStatus: error.status || null, isWafChallenge: Boolean(error.isWafChallenge), message: error.message };
  }
}
