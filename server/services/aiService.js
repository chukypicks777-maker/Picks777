import { createHash } from 'node:crypto';
import { validateAiConfig } from '../security.js';
import { CONFIG } from '../config.js';
import { storage } from '../storage.js';
import { cachedData } from './dataCache.js';
import { getTop3Opportunities } from '../../src/utils/mathProbabilities.js';

export const AGENTROUTER_KNOWN_MODELS = [
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash (AgentRouter)', isReasoning: true },
  { id: 'claude-opus-4-8', name: 'Claude Opus 4.8 (AgentRouter)', isReasoning: false },
  { id: 'claude-opus-5', name: 'Claude Opus 5 (AgentRouter)', isReasoning: false },
  { id: 'gpt-5.6-sol', name: 'GPT 5.6 Sol (AgentRouter)', isReasoning: true },
  { id: 'gpt-6-astra', name: 'GPT 6 Astra (AgentRouter)', isReasoning: true }
];

export async function getEffectiveAiConfig() {
  let dbConfig = null;
  try {
    dbConfig = await storage.getAiConfig();
  } catch {}

  const provider = String(dbConfig?.provider || 'openrouter').trim().toLowerCase();
  const apiKey = String(dbConfig?.apiKey != null ? dbConfig.apiKey : (provider === 'gemini' ? (process.env.GEMINI_API_KEY || '') : (CONFIG.OPENROUTER_API_KEY || ''))).trim();
  const baseUrl = String(dbConfig?.baseUrl || (
    provider === 'openrouter' ? 'https://openrouter.ai/api/v1' :
    provider === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta' :
    provider === 'deepseek' ? 'https://api.deepseek.com/v1' :
    provider === 'groq' ? 'https://api.groq.com/openai/v1' :
    provider === 'agentrouter' ? 'https://agentrouter.org/v1' :
    'https://openrouter.ai/api/v1'
  )).trim();

  const selectedModel = String(dbConfig?.selectedModel || (
    provider === 'gemini' ? 'gemini-1.5-flash' :
    provider === 'deepseek' ? 'deepseek-chat' :
    provider === 'groq' ? 'llama-3.3-70b-versatile' :
    provider === 'agentrouter' ? 'deepseek-v4-flash' :
    CONFIG.DEFAULT_MODEL || 'nvidia/nemotron-3.5-lightning:free'
  )).trim();

  return {
    provider,
    apiKey,
    baseUrl,
    selectedModel,
    modelName: String(dbConfig?.modelName || '').trim(),
    isConfigured: Boolean(apiKey && apiKey.length >= 4),
    updatedAt: dbConfig?.updatedAt || null
  };
}

export async function fetchProviderModels(provider = 'openrouter', apiKey = '', baseUrl = '') {
  ({ provider, apiKey, baseUrl } = validateAiConfig({ provider, apiKey, baseUrl }));
  const normProvider = String(provider || 'openrouter').trim().toLowerCase();
  const keyHash = createHash('md5').update(`${normProvider}:${apiKey || 'public'}:${baseUrl || ''}`).digest('hex').slice(0, 8);

  if (normProvider === 'openrouter') {
    return cachedData(`models:openrouter:${keyHash}`, 300, async () => {
      try {
        const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
        const url = `${(baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')}/models`;
        const res = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data?.data)) return [];

        return data.data.map(m => {
          const idLower = String(m.id || '').toLowerCase();
          const nameLower = String(m.name || '').toLowerCase();
          const isFree = idLower.endsWith(':free') || idLower.includes(':free') ||
            (m.pricing && parseFloat(m.pricing.prompt) === 0 && parseFloat(m.pricing.completion) === 0);
          const isReasoning = /o1|o3|r1|reason|think|glm|opus|qwq|sonnet.*think/i.test(idLower) ||
            /reason|pensamiento|thinking/i.test(nameLower);

          return {
            id: m.id,
            name: m.name || m.id,
            description: m.description || '',
            contextLength: m.context_length || null,
            isFree: Boolean(isFree),
            isReasoning: Boolean(isReasoning),
            pricing: m.pricing || null
          };
        });
      } catch (err) {
        console.warn('Error al consultar modelos de OpenRouter:', err.message);
        return [];
      }
    });
  }

  if (normProvider === 'gemini') {
    if (!apiKey) return [];
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
        redirect: 'error', signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.models || [])
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => {
          const cleanId = m.name.replace(/^models\//, '');
          const idLower = cleanId.toLowerCase();
          return {
            id: cleanId,
            name: m.displayName || cleanId,
            description: m.description || '',
            isFree: false,
            isReasoning: /pro|think|reason/i.test(idLower),
            contextLength: m.inputTokenLimit || null
          };
        });
    } catch {
      return [];
    }
  }

  if (normProvider === 'deepseek') {
    if (!apiKey) return [];
    try {
      const url = `${(baseUrl || 'https://api.deepseek.com/v1').replace(/\/+$/, '')}/models`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, redirect: 'error', signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.data)) {
          return data.data.map(m => {
            const idLow = String(m.id || '').toLowerCase();
            return {
              id: m.id,
              name: m.id,
              isFree: false,
              isReasoning: /r1|reason|think|glm|qwq/i.test(idLow)
            };
          });
        }
      }
    } catch {}
    return [];
  }

  if (normProvider === 'groq') {
    if (!apiKey) return [];
    try {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        redirect: 'error', signal: AbortSignal.timeout(8000)
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.data)) {
          return data.data.map(m => {
            const idLow = String(m.id || '').toLowerCase();
            return {
              id: m.id,
              name: m.id,
              isFree: false,
              isReasoning: /r1|reason|think/i.test(idLow)
            };
          });
        }
      }
    } catch {}
    return [];
  }

  let cleanBaseUrl = String(baseUrl || '').trim();
  const isAgentRouterHost = normProvider === 'agentrouter' ||
    cleanBaseUrl.includes('agentrouter.org') ||
    cleanBaseUrl.includes('co.agentrouter.org');

  if (isAgentRouterHost) {
    if (!cleanBaseUrl.includes('/v1')) {
      cleanBaseUrl = cleanBaseUrl ? (cleanBaseUrl.replace(/\/+$/, '') + '/v1') : 'https://agentrouter.org/v1';
    }
    if (!apiKey) return AGENTROUTER_KNOWN_MODELS;
    try {
      const url = `${cleanBaseUrl.replace(/\/+$/, '')}/models`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'User-Agent': 'claude-cli/2.1.195 (external, cli)',
          'x-app': 'cli'
        },
        redirect: 'error',
        signal: AbortSignal.timeout(8000)
      });
      const resText = await res.text().catch(() => '');
      let data = null;
      try { data = JSON.parse(resText); } catch {}
      if (res.ok && Array.isArray(data?.data) && data.data.length > 0) {
        return data.data.map(m => {
          const idLow = String(m.id || '').toLowerCase();
          return {
            id: m.id,
            name: m.id,
            isFree: false,
            isReasoning: /r1|reason|think|sol|astra|flash|opus|claude/i.test(idLow)
          };
        });
      }
    } catch (err) {
      console.warn('Error al consultar modelos de AgentRouter:', err.message);
    }
    return AGENTROUTER_KNOWN_MODELS;
  }

  // Custom / Terceros
  if (cleanBaseUrl) {
    try {
      const url = `${cleanBaseUrl.replace(/\/+$/, '')}/models`;
      const headers = {
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      };
      const res = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(6000) });
      const resText = await res.text().catch(() => '');
      let data = null;
      try { data = JSON.parse(resText); } catch {}
      if (res.ok && Array.isArray(data?.data)) {
        return data.data.map(m => ({ id: m.id, name: m.id, isFree: false }));
      }
    } catch {}
  }
  return [];
}

export async function executeAiChatCompletion({ provider = 'openrouter', apiKey, baseUrl, model, systemPrompt, userPrompt }) {
  ({ provider, apiKey, baseUrl } = validateAiConfig({ provider, apiKey, baseUrl, selectedModel: model }));
  const normProvider = String(provider || 'openrouter').trim().toLowerCase();
  const modelStr = String(model || '').toLowerCase();
  const isReasoning = /o1|o3|r1|reason|think|glm|opus|sonnet.*think|qwq/i.test(modelStr);
  const timeoutMs = 50000; // 50 segundos para modelos de razonamiento profundo

  if (normProvider === 'gemini') {
    const cleanModel = String(model || 'gemini-2.0-flash').replace(/^models\//, '');
    // 1. Primero intentar endpoint OpenAI-compatible de Gemini
    try {
      const openaiUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
      const geminiBody = {
        model: cleanModel,
        max_tokens: 4000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      };
      if (!isReasoning) geminiBody.temperature = 0.2;

      const resp = await fetch(openaiUrl, {
        method: 'POST',
        redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(geminiBody)
      });
      if (resp.ok) {
        const data = await resp.json();
        const msg = data.choices?.[0]?.message || {};
        const content = (typeof msg.content === 'string' && msg.content.trim()) ? msg.content : (msg.reasoning_content || msg.reasoning);
        if (content) return content;
      }
    } catch {}

    // 2. Respaldo a endpoint REST nativo de Gemini
    const nativeUrl = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey}`;
    const nativeResp = await fetch(nativeUrl, {
      method: 'POST',
      redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }
        ],
        generationConfig: {
          ...(isReasoning ? {} : { temperature: 0.2 }),
          maxOutputTokens: 4000
        }
      })
    });
    if (!nativeResp.ok) {
      const errText = await nativeResp.text().catch(() => '');
      throw new Error(`Google Gemini error ${nativeResp.status}: ${errText.slice(0, 150)}`);
    }
    const nativeData = await nativeResp.json();
    const text = nativeData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Google Gemini no devolvió texto de respuesta.');
    return text;
  }

  // OpenRouter, DeepSeek, Groq, AgentRouter u otros endpoints compatibles con OpenAI
  let effectiveBaseUrl = baseUrl || (
    normProvider === 'openrouter' ? 'https://openrouter.ai/api/v1' :
    normProvider === 'deepseek' ? 'https://api.deepseek.com/v1' :
    normProvider === 'groq' ? 'https://api.groq.com/openai/v1' :
    normProvider === 'agentrouter' ? 'https://agentrouter.org/v1' :
    'https://openrouter.ai/api/v1'
  );

  const isAgentRouter = normProvider === 'agentrouter' || effectiveBaseUrl.includes('agentrouter.org') || effectiveBaseUrl.includes('co.agentrouter.org');
  if (isAgentRouter && !effectiveBaseUrl.includes('/v1')) {
    effectiveBaseUrl = effectiveBaseUrl.replace(/\/+$/, '') + '/v1';
  }
  const finalBaseUrl = effectiveBaseUrl.replace(/\/+$/, '');

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };

  if (isAgentRouter) {
    headers['User-Agent'] = 'claude-cli/2.1.195 (external, cli)';
    headers['x-app'] = 'cli';
  }

  if (normProvider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://picks777.vercel.app';
    headers['X-Title'] = 'Picks777';
  }

  const messages = isAgentRouter
    ? [{ role: 'user', content: systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt }]
    : [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];

  const requestBody = {
    model,
    messages
  };

  if (!isReasoning) {
    requestBody.temperature = 0.2;
    requestBody.max_tokens = 4000;
  } else {
    // Modelos de razonamiento (o1, o3, R1, GLM, etc.): usan max_completion_tokens o tokens de razonamiento
    requestBody.max_completion_tokens = 4000;
    requestBody.max_tokens = 4000;
    if (normProvider === 'openrouter') {
      requestBody.reasoning = { effort: 'medium' };
    }
  }

  const response = await fetch(`${finalBaseUrl}/chat/completions`, {
    method: 'POST',
    redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
    headers,
    body: JSON.stringify(requestBody)
  });

  const responseText = await response.text().catch(() => '');

  if (!response.ok) {
    let cleanErr = responseText.slice(0, 200);
    try {
      const errObj = JSON.parse(responseText);
      if (errObj.error?.message) {
        cleanErr = errObj.error.message;
        if (cleanErr.includes('无可用渠道') || cleanErr.includes('no available channel')) {
          cleanErr = `El modelo '${model}' no está habilitado en tu cuenta de AgentRouter. Te recomendamos seleccionar 'deepseek-v4-flash'.`;
        } else if (cleanErr.includes('Budget pool quota has been exhausted') || cleanErr.includes('quota has been exhausted')) {
          cleanErr = `La cuota para '${model}' está agotada en tu cuenta de AgentRouter. Te recomendamos seleccionar 'deepseek-v4-flash'.`;
        } else if (cleanErr.includes('unauthorized client detected')) {
          cleanErr = `Cliente no autorizado por AgentRouter. La solicitud debe realizarse a través del servidor del sistema con el modelo con cuota activa ('deepseek-v4-flash').`;
        }
      }
    } catch {}
    throw new Error(`${normProvider} error ${response.status}: ${cleanErr}`);
  }

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`[IA Endpoint] Status ${response.status} (${response.statusText}): ${responseText.slice(0, 250)}`);
  }

  const msg = data.choices?.[0]?.message || {};
  let raw = (typeof msg.content === 'string' && msg.content.trim()) ? msg.content : (msg.reasoning_content || msg.reasoning || '');
  if (!raw) throw new Error('El proveedor no devolvió contenido.');
  return raw;
}

export async function testAiConnection({ provider, apiKey, baseUrl, selectedModel }) {
  if (!apiKey || apiKey.trim().length < 3) {
    return { success: false, message: 'Ingresa una clave API para probar la conexión.' };
  }
  const cleanBase = String(baseUrl || '').toLowerCase();
  const isAgentRouter = provider === 'agentrouter' || cleanBase.includes('agentrouter.org') || cleanBase.includes('co.agentrouter.org');
  let model = (selectedModel || '').trim();
  if (!model || (isAgentRouter && (model === 'gpt-4o-mini' || model.startsWith('~') || model.startsWith('openai/') || model.includes('nemotron')))) {
    model = isAgentRouter ? 'deepseek-v4-flash' :
      provider === 'gemini' ? 'gemini-1.5-flash' :
      provider === 'deepseek' ? 'deepseek-chat' :
      provider === 'groq' ? 'llama-3.3-70b-versatile' :
      'nvidia/nemotron-3.5-lightning:free';
  }
  const start = Date.now();
  try {
    const raw = await executeAiChatCompletion({
      provider,
      apiKey: apiKey.trim(),
      baseUrl,
      model,
      systemPrompt: 'You are a fast AI assistant.',
      userPrompt: 'Reply with the single word OK.'
    });
    const latencyMs = Date.now() - start;
    if (raw && (raw.includes('OK') || raw.trim().length > 0)) {
      return {
        success: true,
        latencyMs,
        model,
        sample: raw.trim().slice(0, 60),
        message: `✅ Conexión exitosa con ${model} (${latencyMs}ms)`
      };
    }
    return { success: false, latencyMs, message: 'El modelo no devolvió una respuesta válida.' };
  } catch (err) {
    return { success: false, message: err.message || 'No se pudo conectar con el proveedor o modelo configurado.' };
  }
}

export async function availableModels() {
  return fetchProviderModels('openrouter', CONFIG.OPENROUTER_API_KEY, CONFIG.OPENROUTER_BASE_URL);
}

export async function generateAiMatchReport(match, options = {}) {
  const p = match.model?.probabilities || match.probabilities || {};
  const fmt = n => Number.isFinite(n) ? Number(n.toFixed(1)) : 'N/D';
  const facts = [
    { id: 'fixture', text: `${match.homeTeam.name} vs ${match.awayTeam.name}. Estado del proveedor: ${match.status}. Inicio: ${match.kickoff}.` },
    { id: 'source', text: `Fuente: ${match.source || 'N/D'}. Consulta: ${match.fetchedAt || 'N/D'}.` }
  ];
  for (const [side, team] of [['home', match.homeTeam], ['away', match.awayTeam]]) {
    if (Number.isFinite(team.gamesPlayed)) facts.push({ id: side, text: `${team.name}: ${team.gamesPlayed} partidos, ${team.goalsFor ?? 'N/D'} goles a favor y ${team.goalsAgainst ?? 'N/D'} en contra.` });
  }
  if (match.model) {
    facts.push({ id: 'result', text: `Estimación Poisson: local ${fmt(p.homeWin)}%, empate ${fmt(p.draw)}%, visitante ${fmt(p.awayWin)}%.` });
    facts.push({ id: 'goals', text: `Goles totales: más de 2.5 ${fmt(p.over25)}%; menos de 2.5 ${fmt(p.under25)}%. Ambos anotan: ${fmt(p.bttsYes)}%.` });
    facts.push({ id: 'score', text: `Marcador individual más probable: ${match.model.predictedScore} (${fmt(match.model.scoreDistribution?.[0]?.probability)}%). Es un escenario, no un resultado asegurado.` });
    facts.push({ id: 'sample', text: `Muestra de temporada: ${match.model.sampleSize?.home ?? 'N/D'} y ${match.model.sampleSize?.away ?? 'N/D'} partidos. Modelo sin calibración retrospectiva de precisión.` });
  } else facts.push({ id: 'missing', text: 'Sin muestra suficiente para un pronóstico Poisson previo al partido.' });
  const picks = getTop3Opportunities(match);
  const narrative = facts.map(f => f.text).join('\n\n');
  const baseline = { generatedAt: new Date().toISOString(), modelUsed: null, aiAvailable: false,
    source: match.source, sourceUrl: match.sourceUrl, dataFetchedAt: match.fetchedAt,
    probabilities: p, predictedScore: match.model?.predictedScore ?? null,
    topPick: picks[0] ?? null, safePick: picks[1] ?? null, secondaryPick: picks[2] ?? null, valueBet: null,
    facts: facts.map(f => f.text), narrativeAnalysis: narrative,
    aiStatus: 'Informe calculado con registros del proveedor; sin texto predictivo no verificado.',
    limitations: 'Estimaciones sujetas al tamaño de muestra y a errores del proveedor; no garantizan resultados.' };
  let config = await getEffectiveAiConfig();
  if (options.aiConfig && typeof options.aiConfig === 'object') {
    try {
      const validated = validateAiConfig(options.aiConfig);
      if (validated.apiKey && validated.apiKey.length >= 4) {
        config = {
          ...config,
          ...validated,
          isConfigured: true,
          updatedAt: new Date().toISOString()
        };
      }
    } catch {}
  }
  if (options.model && typeof options.model === 'string' && options.model.trim()) {
    config.selectedModel = options.model.trim();
  }
  if (!config.isConfigured) return baseline;
  const cacheKey = 'ai:grounded-v1:' + createHash('sha256').update(JSON.stringify([facts, p, config.updatedAt, config.provider, config.selectedModel])).digest('hex');
  const generate = async () => {
    try {
      // The model may prioritize verified facts, but cannot introduce numbers,
      // tactics, injuries, scores, odds or picks that are absent from the data.
      const isAgentRouter = config.provider === 'agentrouter' || (config.baseUrl && (config.baseUrl.includes('agentrouter.org') || config.baseUrl.includes('co.agentrouter.org')));
      const promptCatalog = isAgentRouter
        ? facts.map(f => {
            if (f.id === 'fixture') return { id: f.id, summary: `Match fixture: ${match.homeTeam?.name} vs ${match.awayTeam?.name} (${match.status})` };
            if (f.id === 'home') return { id: f.id, summary: `${match.homeTeam?.name}: ${match.homeTeam?.gamesPlayed} matches, ${match.homeTeam?.goalsFor} scored, ${match.homeTeam?.goalsAgainst} conceded` };
            if (f.id === 'away') return { id: f.id, summary: `${match.awayTeam?.name}: ${match.awayTeam?.gamesPlayed} matches, ${match.awayTeam?.goalsFor} scored, ${match.awayTeam?.goalsAgainst} conceded` };
            if (f.id === 'result') return { id: f.id, summary: `Poisson win probability: Home ${fmt(p.homeWin)}%, Draw ${fmt(p.draw)}%, Away ${fmt(p.awayWin)}%` };
            if (f.id === 'goals') return { id: f.id, summary: `Goals probability: Over 2.5 ${fmt(p.over25)}%, Under 2.5 ${fmt(p.under25)}%, BTTS ${fmt(p.bttsYes)}%` };
            if (f.id === 'score') return { id: f.id, summary: `Most probable predicted score: ${match.model?.predictedScore}` };
            if (f.id === 'sample') return { id: f.id, summary: `Sample size: ${match.model?.sampleSize?.home} and ${match.model?.sampleSize?.away} matches` };
            return { id: f.id, summary: `Fact: ${f.id}` };
          })
        : facts;

      const raw = await executeAiChatCompletion({ ...config, model: config.selectedModel,
        systemPrompt: 'Select the most relevant fact IDs from the catalog to summarize the fixture. Return only JSON object {"factIds":["id"]} choosing between 1 and 6 IDs from the catalog. Do not alter or fabricate facts.',
        userPrompt: JSON.stringify(promptCatalog) });
      const parsed = JSON.parse(raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''));
      if (!Array.isArray(parsed.factIds) || !parsed.factIds.length || parsed.factIds.length > 6 || parsed.factIds.some(id => typeof id !== 'string' || !facts.some(f => f.id === id))) throw new Error('Invalid fact selection');
      const keypoints = [...new Set(parsed.factIds)].map(id => facts.find(f => f.id === id).text);
      return { ...baseline, aiAvailable: true, modelUsed: config.selectedModel, tacticalKeypoints: keypoints,
        aiStatus: 'La IA prioriza hechos comprobables del informe. Las cifras y selecciones proceden del cálculo estadístico.' };
    } catch { return { ...baseline, aiStatus: 'La respuesta de IA no pudo validarse; se muestra el informe estadístico verificable.' }; }
  };
  return options.forceRefresh ? generate() : cachedData(cacheKey, 600, generate);
}
