import { createHash } from 'node:crypto';
import { CONFIG } from '../config.js';
import { storage } from '../storage.js';
import { cachedData, fetchJson } from './dataCache.js';

export async function getEffectiveAiConfig() {
  let dbConfig = null;
  try {
    dbConfig = await storage.getAiConfig();
  } catch {}

  const provider = String(dbConfig?.provider || 'openrouter').trim().toLowerCase();
  const apiKey = String(dbConfig?.apiKey || (provider === 'gemini' ? (process.env.GEMINI_API_KEY || '') : (CONFIG.OPENROUTER_API_KEY || ''))).trim();
  const baseUrl = String(dbConfig?.baseUrl || (
    provider === 'openrouter' ? 'https://openrouter.ai/api/v1' :
    provider === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta' :
    provider === 'deepseek' ? 'https://api.deepseek.com/v1' :
    provider === 'groq' ? 'https://api.groq.com/openai/v1' :
    'https://openrouter.ai/api/v1'
  )).trim();

  const selectedModel = String(dbConfig?.selectedModel || (
    provider === 'gemini' ? 'gemini-1.5-flash' :
    provider === 'deepseek' ? 'deepseek-chat' :
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
  const normProvider = String(provider || 'openrouter').trim().toLowerCase();

  if (normProvider === 'openrouter') {
    return cachedData('models:openrouter', 600, async () => {
      try {
        const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
        const url = `${(baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')}/models`;
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data?.data)) return [];
        return data.data.map(m => {
          const isFree = m.id.endsWith(':free') || (m.pricing?.prompt === '0' && m.pricing?.completion === '0');
          return {
            id: m.id,
            name: m.name || m.id,
            description: m.description || '',
            contextLength: m.context_length || null,
            isFree,
            pricing: m.pricing || null
          };
        });
      } catch (err) {
        console.warn('Error fetching OpenRouter models:', err);
        return [
          { id: 'nvidia/nemotron-3.5-lightning:free', name: 'NVIDIA: Nemotron 3.5 Lightning (free)', isFree: true },
          { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'NVIDIA: Nemotron 3 Ultra (free)', isFree: true },
          { id: 'dots-studio/dots-3-note-preview:free', name: 'Dots Studio: Dots3-Note Preview (free)', isFree: true },
          { id: 'liquid/lfm-2.5-2.6b:free', name: 'LiquidAI: LFM 2.5 2.6B (free)', isFree: true },
          { id: 'inclusionai/ling-3.0-flash-vl:free', name: 'inclusionAI: Ling 3.0 Flash VL (free)', isFree: true },
          { id: 'nex-agi/nex-n2.5-mini:free', name: 'Nex AGI: Nex-N2.5-Mini (free)', isFree: true },
          { id: 'openrouter/free', name: 'OpenRouter Free Router (Automático)', isFree: true }
        ];
      }
    });
  }

  if (normProvider === 'gemini') {
    const curatedGemini = [
      { id: 'gemini-2.0-flash', name: 'Google Gemini 2.0 Flash (Última generación recomendada)', isFree: false, contextLength: 1048576 },
      { id: 'gemini-1.5-flash', name: 'Google Gemini 1.5 Flash (Ultra veloz y económico)', isFree: false, contextLength: 1048576 },
      { id: 'gemini-1.5-pro', name: 'Google Gemini 1.5 Pro (Razonamiento profundo)', isFree: false, contextLength: 2097152 },
      { id: 'gemini-2.0-flash-lite', name: 'Google Gemini 2.0 Flash Lite (Alta velocidad)', isFree: false, contextLength: 1048576 },
      { id: 'gemini-2.5-flash', name: 'Google Gemini 2.5 Flash Preview', isFree: false, contextLength: 1048576 }
    ];
    if (!apiKey) return curatedGemini;
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
        signal: AbortSignal.timeout(6000)
      });
      if (!res.ok) return curatedGemini;
      const data = await res.json();
      const dynamicList = (data.models || [])
        .filter(m => m.supportedGenerationMethods?.includes('generateContent') && m.name?.includes('gemini'))
        .map(m => {
          const cleanId = m.name.replace(/^models\//, '');
          return {
            id: cleanId,
            name: m.displayName ? `Google ${m.displayName}` : cleanId,
            description: m.description || '',
            isFree: false,
            contextLength: m.inputTokenLimit || null
          };
        });
      return dynamicList.length > 0 ? dynamicList : curatedGemini;
    } catch {
      return curatedGemini;
    }
  }

  if (normProvider === 'deepseek') {
    const curatedDeepseek = [
      { id: 'deepseek-chat', name: 'DeepSeek V3 (Chat General & Código)', isFree: false, contextLength: 65536 },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1 (Razonamiento Lógico Profundo)', isFree: false, contextLength: 65536 },
      { id: 'qwen-plus', name: 'Qwen Plus (Alibaba DashScope)', isFree: false, contextLength: 131072 },
      { id: 'qwen-turbo', name: 'Qwen Turbo (Alibaba DashScope)', isFree: false, contextLength: 131072 },
      { id: 'qwen-max', name: 'Qwen Max (Alibaba DashScope)', isFree: false, contextLength: 32768 },
      { id: 'glm-4-flash', name: 'GLM 4 Flash (Zhipu AI)', isFree: false, contextLength: 128000 },
      { id: 'moonshot-v1-8k', name: 'Moonshot Kimi (Moonshot AI)', isFree: false, contextLength: 8192 }
    ];
    if (baseUrl && apiKey) {
      try {
        const url = `${baseUrl.replace(/\/+$/, '')}/models`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(6000) });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.data)) {
            return data.data.map(m => ({ id: m.id, name: m.id, isFree: false }));
          }
        }
      } catch {}
    }
    return curatedDeepseek;
  }

  if (normProvider === 'groq') {
    const curatedGroq = [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile (Groq Ultra Rápido)', isFree: false, contextLength: 131072 },
      { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill Llama 70B (Groq)', isFree: false, contextLength: 131072 },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (Groq)', isFree: false, contextLength: 32768 },
      { id: 'gemma2-9b-it', name: 'Gemma 2 9B IT (Groq)', isFree: false, contextLength: 8192 }
    ];
    if (apiKey) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(6000)
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.data)) {
            return data.data.map(m => ({ id: m.id, name: m.id, isFree: false }));
          }
        }
      } catch {}
    }
    return curatedGroq;
  }

  // Custom / Terceros
  if (baseUrl) {
    try {
      const url = `${baseUrl.replace(/\/+$/, '')}/models`;
      const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.data)) {
          return data.data.map(m => ({ id: m.id, name: m.id, isFree: false }));
        }
      }
    } catch {}
  }
  return [];
}

export async function executeAiChatCompletion({ provider = 'openrouter', apiKey, baseUrl, model, systemPrompt, userPrompt }) {
  const normProvider = String(provider || 'openrouter').trim().toLowerCase();

  if (normProvider === 'gemini') {
    const cleanModel = String(model || 'gemini-1.5-flash').replace(/^models\//, '');
    // 1. First try Gemini OpenAI-compatible endpoint
    try {
      const openaiUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
      const resp = await fetch(openaiUrl, {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: cleanModel,
          temperature: 0.2,
          max_tokens: 2500,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning;
        if (content) return content;
      }
    } catch {}

    // 2. Fallback to Gemini native REST endpoint
    const nativeUrl = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey}`;
    const nativeResp = await fetch(nativeUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2500
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

  // OpenRouter or other OpenAI-compatible endpoints
  const finalBaseUrl = (
    baseUrl || (
      normProvider === 'openrouter' ? 'https://openrouter.ai/api/v1' :
      normProvider === 'deepseek' ? 'https://api.deepseek.com/v1' :
      normProvider === 'groq' ? 'https://api.groq.com/openai/v1' :
      'https://openrouter.ai/api/v1'
    )
  ).replace(/\/+$/, '');

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };

  if (normProvider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://deportepicks.vip';
    headers['X-Title'] = CONFIG.APP_NAME;
  }

  const response = await fetch(`${finalBaseUrl}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers,
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 2500,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`${normProvider} error ${response.status}: ${errText.slice(0, 150)}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning;
  if (!raw) throw new Error('El proveedor no devolvió contenido.');
  return raw;
}

export async function testAiConnection({ provider, apiKey, baseUrl, selectedModel }) {
  if (!apiKey || apiKey.trim().length < 3) {
    return { success: false, message: 'Ingresa una clave API para probar la conexión.' };
  }
  const model = selectedModel || (
    provider === 'gemini' ? 'gemini-1.5-flash' :
    provider === 'deepseek' ? 'deepseek-chat' :
    provider === 'groq' ? 'llama-3.3-70b-versatile' :
    'nvidia/nemotron-3.5-lightning:free'
  );
  const start = Date.now();
  try {
    const raw = await executeAiChatCompletion({
      provider,
      apiKey: apiKey.trim(),
      baseUrl,
      model,
      systemPrompt: 'Eres un asistente rápido.',
      userPrompt: 'Responde únicamente con la palabra OK.'
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
    return { success: false, message: err.message || 'Error al conectar con la API de IA.' };
  }
}

export async function availableModels() {
  return fetchProviderModels('openrouter', CONFIG.OPENROUTER_API_KEY, CONFIG.OPENROUTER_BASE_URL);
}

const FALLBACK_MODELS = [
  'nvidia/nemotron-3.5-lightning:free',
  'dots-studio/dots-3-note-preview:free',
  'liquid/lfm-2.5-2.6b:free',
  'openrouter/free',
  'nex-agi/nex-n2.5-mini:free',
  'inclusionai/ling-3.0-flash-vl:free'
];

export async function generateAiMatchReport(match, options = {}) {
  const facts = [
    `Partido: ${match.homeTeam.name} vs ${match.awayTeam.name}. Competición: ${match.leagueName}. Inicio: ${match.kickoff}. Estado ESPN: ${match.status}.`,
    `Enfrentamientos directos (H2H) registrados: ${match.h2h?.length || 0} partidos.`
  ];
  for (const team of [match.homeTeam, match.awayTeam]) {
    if (team.gamesPlayed !== null) {
      facts.push(`${team.name}: ${team.gamesPlayed} PJ, ${team.goalsFor ?? 'N/D'} GF, ${team.goalsAgainst ?? 'N/D'} GC, ${team.points ?? 'N/D'} pts, posición ${team.position ?? 'N/D'}, racha: ${team.form?.join('-') || 'N/D'}.`);
    }
  }
  if (match.model) {
    facts.push(`Modelo Poisson: Victoria Local ${match.probabilities.homeWin?.toFixed(1)}%, Empate ${match.probabilities.draw?.toFixed(1)}%, Victoria Visitante ${match.probabilities.awayWin?.toFixed(1)}%.`);
    facts.push(`Goles estimados: Ambos Anotan ${match.probabilities.bttsYes?.toFixed(1)}%, Más de 2.5 ${match.probabilities.over25?.toFixed(1)}%, Menos de 2.5 ${match.probabilities.under25?.toFixed(1)}%.`);
    facts.push(`Goles esperados (xG lambda/mu): Local ${match.model.expectedGoals?.home?.toFixed(2)}, Visitante ${match.model.expectedGoals?.away?.toFixed(2)}.`);
  } else if (match.probabilities?.homeWin) {
    facts.push(`Probabilidades implícitas del mercado: 1: ${match.probabilities.homeWin?.toFixed(1)}% | X: ${match.probabilities.draw?.toFixed(1)}% | 2: ${match.probabilities.awayWin?.toFixed(1)}%${match.probabilities.over25 ? ` | Over 2.5: ${match.probabilities.over25?.toFixed(1)}%` : ''}.`);
  }
  if (match.h2h?.length) {
    const h2hSummaries = match.h2h.slice(0, 5).map(h => `${h.date.slice(0, 10)}: ${h.home} ${h.score} ${h.away}`).join('; ');
    facts.push(`Últimos H2H directos: ${h2hSummaries}.`);
  }
  if (match.odds?.homeWin) {
    facts.push(`Cuotas publicadas: 1: ${match.odds.homeWin} | X: ${match.odds.draw} | 2: ${match.odds.awayWin}${match.odds.over25 ? ` | Over 2.5: ${match.odds.over25} | Under 2.5: ${match.odds.under25}` : ''}. Proveedor: ${match.oddsProvider || 'Mercado oficial'}.`);
  }

  const baseline = {
    modelUsed: null,
    aiAvailable: false,
    generatedAt: new Date().toISOString(),
    source: match.source,
    sourceUrl: match.sourceUrl,
    dataFetchedAt: match.fetchedAt,
    probabilities: match.probabilities,
    predictedScore: match.model?.predictedScore ?? null,
    topPick: match.aiPick,
    valueBet: null,
    cornerAnalysis: null,
    bttsPrediction: null,
    overUnderPrediction: null,
    summaryVerdict: null,
    facts,
    narrativeAnalysis: facts.join('\n\n'),
    limitations: 'Las apuestas conllevan riesgo. Las estimaciones son análisis cuantitativos y tácticos basados en datos reales de la temporada y forma reciente, no certezas matemáticas.'
  };

  const effectiveConfig = await getEffectiveAiConfig();

  if (!effectiveConfig.isConfigured) {
    return {
      ...baseline,
      aiStatus: 'Clave de IA no configurada en el panel de control. Se muestran únicamente datos y cálculos estadísticos.'
    };
  }

  const candidateModels = effectiveConfig.provider === 'openrouter'
    ? [effectiveConfig.selectedModel, ...FALLBACK_MODELS.filter(m => m !== effectiveConfig.selectedModel)]
    : [effectiveConfig.selectedModel];

  const systemPrompt = `Eres el analista cuantitativo y táctico de DEPORTEPICKS AI VIP.
Responde siempre en español. No uses introducciones ni explicaciones fuera del JSON.
Devuelve EXCLUSIVAMENTE un objeto JSON válido con esta estructura exacta:
{
  "predictedScore": "Marcador proyectado ej: 2 - 1",
  "tacticalAnalysis": "Análisis táctico profundo en español evaluando transiciones, virtudes ofensivas, debilidades defensivas y balance.",
  "topPick": "Selección recomendada principal ej: Real Madrid gana",
  "topStake": "3/5 Unidades",
  "valueBet": "Selección con cuota de valor estadístico",
  "cornersAnalysis": "Proyección y análisis del volumen de córners según juego por bandas.",
  "bttsAnalysis": "Ambos Anotan: Sí o No con argumento clave."
}`;

  const userPrompt = `Analiza este partido de fútbol con los datos oficiales actuales:
${facts.join('\n')}

Devuelve el JSON del informe institucional.`;

  const fingerprint = createHash('sha256').update(JSON.stringify({ id: match.id, facts, provider: effectiveConfig.provider, model: effectiveConfig.selectedModel, force: options.forceRefresh ? Date.now() : 0 })).digest('hex');
  const cacheKey = `ai:${fingerprint}`;

  return cachedData(cacheKey, 600, async () => {
    for (const model of candidateModels) {
      try {
        const rawContent = await executeAiChatCompletion({
          provider: effectiveConfig.provider,
          apiKey: effectiveConfig.apiKey,
          baseUrl: effectiveConfig.baseUrl,
          model,
          systemPrompt,
          userPrompt
        });

        // Strip thinking tags if present
        const cleaned = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

        let jsonString = cleaned;
        const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (fenceMatch) {
          jsonString = fenceMatch[1];
        } else {
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
          if (jsonMatch) jsonString = jsonMatch[0];
        }

        let parsed;
        try { parsed = JSON.parse(jsonString.trim()); } catch { continue; }
        if (!parsed.tacticalAnalysis) continue;

        const formatScore = val => {
          if (!val) return null;
          if (typeof val === 'string') return val;
          if (typeof val === 'object') {
            if (val.summary) return String(val.summary);
            if (val.home != null && val.away != null) return `${val.home} - ${val.away}`;
          }
          return String(val);
        };

        const formatText = val => {
          if (!val) return '';
          if (typeof val === 'string') return val;
          if (typeof val === 'object') {
            return Object.values(val).map(v => typeof v === 'string' ? v : JSON.stringify(v)).join('\n\n');
          }
          return String(val);
        };

        const tacticalText = formatText(parsed.tacticalAnalysis);
        if (!tacticalText) continue;

        const topPickText = typeof parsed.topPick === 'string'
          ? parsed.topPick
          : (parsed.topPick?.selection || match.aiPick?.selection || null);

        const topPickCandidate = topPickText ? {
          selection: topPickText,
          market: parsed.topPick?.market || match.aiPick?.market || '1X2 / Mercado Principal',
          odds: Number(parsed.topPick?.odds) || match.aiPick?.odds || 1.85,
          probability: Number(parsed.topPick?.probability) || match.aiPick?.probability || 65,
          stake: parsed.topStake || parsed.topPick?.stake || '3/5 Unidades',
          rationale: parsed.topPick?.rationale || topPickText
        } : (match.aiPick || null);

        const valueBetCandidate = parsed.valueBet
          ? (typeof parsed.valueBet === 'string' ? { selection: parsed.valueBet, odds: 2.10, rationale: parsed.valueBet } : parsed.valueBet)
          : null;

        const cornerRaw = parsed.cornersAnalysis || parsed.cornerAnalysis || null;
        const cornerAnalysis = cornerRaw ? (typeof cornerRaw === 'string' ? cornerRaw : (cornerRaw.summary || JSON.stringify(cornerRaw))) : null;

        return {
          ...baseline,
          modelUsed: model,
          aiAvailable: true,
          aiStatus: `Informe generado por IA (${effectiveConfig.provider.toUpperCase()} / ${model}) en tiempo real.`,
          generatedAt: new Date().toISOString(),
          predictedScore: formatScore(parsed.predictedScore) || match.model?.predictedScore || null,
          tacticalAnalysis: tacticalText,
          narrativeAnalysis: tacticalText,
          topPick: topPickCandidate,
          valueBet: valueBetCandidate,
          cornerAnalysis,
          bttsPrediction: parsed.bttsAnalysis ? { prediction: formatText(parsed.bttsAnalysis), rationale: formatText(parsed.bttsAnalysis) } : (parsed.bttsPrediction || null),
          overUnderPrediction: parsed.overUnderPrediction || null,
          summaryVerdict: parsed.summaryVerdict || null
        };
      } catch {
        // Try next candidate model if available
      }
    }

    return {
      ...baseline,
      aiStatus: 'Informe estadístico cuantitativo (Poisson y métricas de temporada). Motor de IA en respaldo temporal.',
      narrativeAnalysis: facts.join('\n\n')
    };
  });
}
