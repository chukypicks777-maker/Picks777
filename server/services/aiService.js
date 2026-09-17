import { createHash } from 'node:crypto';
import { CONFIG } from '../config.js';
import { storage } from '../storage.js';
import { cachedData } from './dataCache.js';
import { getBestBankerPick } from '../../src/utils/mathProbabilities.js';

function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractFirstSentence(text) {
  if (!text || typeof text !== 'string') return '';
  const sentences = text.trim().split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ])/);
  const first = sentences[0]?.trim() || '';
  return first.length > 20 ? first : text.trim().slice(0, 180);
}

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
  const keyHash = createHash('md5').update(`${normProvider}:${apiKey || 'public'}:${baseUrl || ''}`).digest('hex').slice(0, 8);

  if (normProvider === 'openrouter') {
    return cachedData(`models:openrouter:${keyHash}`, 300, async () => {
      try {
        const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
        const url = `${(baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')}/models`;
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
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
        signal: AbortSignal.timeout(8000)
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
      const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(8000) });
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
        signal: AbortSignal.timeout(8000)
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
        signal: AbortSignal.timeout(timeoutMs),
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
      signal: AbortSignal.timeout(timeoutMs),
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

  // OpenRouter, DeepSeek, Groq u otros endpoints compatibles con OpenAI
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
    headers['HTTP-Referer'] = 'https://picks777.vercel.app';
    headers['X-Title'] = 'Picks777';
  }

  const requestBody = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
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
    signal: AbortSignal.timeout(timeoutMs),
    headers,
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`${normProvider} error ${response.status}: ${errText.slice(0, 150)}`);
  }

  const data = await response.json();
  const msg = data.choices?.[0]?.message || {};
  let raw = (typeof msg.content === 'string' && msg.content.trim()) ? msg.content : (msg.reasoning_content || msg.reasoning || '');
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

  const defaultBanker = getBestBankerPick(match);
  const homeWinProb = match.probabilities?.homeWin != null ? Number(match.probabilities.homeWin) : 50;
  const awayWinProb = match.probabilities?.awayWin != null ? Number(match.probabilities.awayWin) : 25;
  const drawProb = match.probabilities?.draw != null ? Number(match.probabilities.draw) : 25;
  const favoredTeam = homeWinProb >= awayWinProb ? match.homeTeam.name : match.awayTeam.name;

  const hasProbabilities = Boolean(match.model || (match.probabilities && (match.probabilities.homeWin != null || match.probabilities.awayWin != null)));

  const isDefaultBankerDC = defaultBanker && /gana o empata|o empate|1x|x2|doble oportunidad/i.test(defaultBanker.selection);
  const over15ProbBaseline = Math.round(Number(match.probabilities?.over15 != null
    ? match.probabilities.over15
    : (match.probabilities?.over25 != null ? Math.min(96, Math.round(Number(match.probabilities.over25) + 26)) : 82)));
  const under35ProbBaseline = Math.round(Number(match.probabilities?.under35 != null
    ? match.probabilities.under35
    : (match.probabilities?.over25 != null ? Math.min(94, Math.round(100 - (Number(match.probabilities.over25) - 24))) : 78)));

  const baselineSafePick = hasProbabilities ? (isDefaultBankerDC ? (
    under35ProbBaseline >= over15ProbBaseline ? {
      selection: 'Menos de 3.5 Goles',
      market: 'Total de Goles Asegurado',
      probability: under35ProbBaseline,
      odds: Number((match.odds?.under35 || Math.max(1.15, Math.min(1.48, (100 / under35ProbBaseline) * 0.96))).toFixed(2)),
      rationale: `Línea defensiva segura: ${under35ProbBaseline}% de probabilidad de registrar un máximo de 3 anotaciones según distribución Poisson.`
    } : {
      selection: 'Más de 1.5 Goles',
      market: 'Total de Goles Asegurado',
      probability: over15ProbBaseline,
      odds: Number((match.odds?.over15 || Math.max(1.15, Math.min(1.48, (100 / over15ProbBaseline) * 0.96))).toFixed(2)),
      rationale: `Línea ofensiva segura: ${over15ProbBaseline}% de probabilidad estadística de ver al menos dos goles en el partido.`
    }
  ) : {
    selection: homeWinProb >= awayWinProb ? `${match.homeTeam?.shortName || match.homeTeam?.name || 'Local'} o Empate (1X)` : `${match.awayTeam?.shortName || match.awayTeam?.name || 'Visita'} o Empate (X2)`,
    market: homeWinProb >= awayWinProb ? 'Doble Oportunidad (1X)' : 'Doble Oportunidad (X2)',
    probability: Math.min(97, Math.max(50, Math.round(Math.max(homeWinProb, awayWinProb) + drawProb))),
    odds: Number(Math.max(1.12, Math.min(1.60, (100 / Math.min(97, Math.max(50, Math.round(Math.max(homeWinProb, awayWinProb) + drawProb)))) * 0.96)).toFixed(2)),
    rationale: `Cobertura de alta probabilidad respaldada por la distribución estadística Poisson y control de riesgo ante paridad.`
  }) : null;

  const over25ProbBaseline = Number(match.probabilities?.over25 || 50);
  const baselineSecondary = hasProbabilities ? (
    over25ProbBaseline >= 52 ? {
      selection: 'Más de 2.5 Goles',
      market: 'Total Goles Over 2.5',
      probability: Math.round(over25ProbBaseline),
      odds: Number(Number(match.odds?.over25 || 1.85).toFixed(2)),
      rationale: `Ritmo ofensivo con promedio combinado superior a 2.5 goles esperados (${Math.round(over25ProbBaseline)}% probabilidad).`
    } : {
      selection: 'Menos de 2.5 Goles',
      market: 'Total Goles Under 2.5',
      probability: Math.round(100 - over25ProbBaseline),
      odds: Number(Number(match.odds?.under25 || 1.80).toFixed(2)),
      rationale: `Bloques defensivos compactos que limitan la generación de ocasiones claras.`
    }
  ) : null;

  const baseline = {
    modelUsed: null,
    aiAvailable: false,
    generatedAt: new Date().toISOString(),
    source: match.source,
    sourceUrl: match.sourceUrl,
    dataFetchedAt: match.fetchedAt,
    probabilities: match.probabilities,
    predictedScore: match.model?.predictedScore ?? null,
    topPick: hasProbabilities ? (defaultBanker ? {
      selection: defaultBanker.selection,
      market: defaultBanker.market,
      odds: defaultBanker.odds,
      probability: defaultBanker.probability,
      stake: '3/5 Unidades',
      rationale: defaultBanker.rationale
    } : match.aiPick) : null,
    valueBet: baselineSecondary,
    safePick: baselineSafePick,
    secondaryPick: baselineSecondary,
    cornerAnalysis: null,
    bttsPrediction: null,
    overUnderPrediction: null,
    summaryVerdict: null,
    facts,
    narrativeAnalysis: facts.join('\n\n'),
    limitations: 'Las apuestas conllevan riesgo. Las estimaciones son análisis cuantitativos y tácticos basados en datos reales de la temporada y forma reciente, no certezas matemáticas.'
  };

  const effectiveConfig = await getEffectiveAiConfig();
  const chosenModel = String(effectiveConfig.selectedModel || options.model || CONFIG.DEFAULT_MODEL || 'nvidia/nemotron-3.5-lightning:free').trim();

  if (!effectiveConfig.isConfigured) {
    return {
      ...baseline,
      aiStatus: 'Análisis cuantitativo oficial basado en el modelo matemático de Poisson y estadísticas de temporada.'
    };
  }

  const candidateModels = [chosenModel].filter(Boolean);

  facts.push(`Favorito cuantitativo por estadísticas y Poisson: ${favoredTeam} (Probabilidad: ${Math.max(homeWinProb, awayWinProb).toFixed(1)}%). Marcador proyectado oficial: ${match.model?.predictedScore || (homeWinProb >= awayWinProb ? '2 - 1' : '1 - 2')}.`);
  if (defaultBanker) {
    facts.push(`Pick Banquero cuantitativo de referencia (máxima seguridad): ${defaultBanker.selection} (Mercado: ${defaultBanker.market}, Probabilidad: ${defaultBanker.probability}%, Cuota estimada: ${defaultBanker.odds}).`);
  }

  const bankerExampleSelection = defaultBanker?.selection || `${favoredTeam} o Empate (1X)`;
  const bankerExampleMarket = defaultBanker?.market || 'Doble Oportunidad';
  const bankerExampleProb = defaultBanker?.probability || Math.min(97, Math.max(65, Math.round(Math.max(homeWinProb, awayWinProb) + drawProb)));
  const bankerExampleOdds = defaultBanker?.odds || Number(Math.max(1.15, Math.min(1.50, (100 / bankerExampleProb) * 0.96)).toFixed(2));
  const bankerExampleRationale = defaultBanker?.rationale || `Dominio táctico y solidez en temporada con ${bankerExampleProb}% de probabilidad estadística Poisson.`;

  const systemPrompt = `Eres el analista cuantitativo y táctico institucional de DEPORTEPICKS AI VIP.
Responde siempre en español y exclusivamente en formato JSON válido.

REGLAS CRÍTICAS DE COHERENCIA Y FIDELIDAD DE DATOS (OBLIGATORIAS):
1. NO CONTRADECIR LAS ESTADÍSTICAS: Tu análisis táctico, tu 'topPick' y tu 'predictedScore' DEBEN coincidir con el equipo favorecido por el Modelo Poisson, el xG y las estadísticas oficiales provistas. Jamás pronostiques la victoria directa del rival con menor probabilidad.
2. SELECCIÓN 'topPick' (PICK BANQUERO PRINCIPAL): Debe ser una apuesta de máxima seguridad institucional (probabilidad real estimada >= 65% y cuota segura entre 1.15 y 1.55).
   - Si recomiendas al equipo favorecido (${favoredTeam}), usa Doble Oportunidad (${favoredTeam} o Empate) para cubrir el empate, a menos que su probabilidad de victoria directa supere el 60%.
   - También puedes seleccionar una línea segura de goles (ej: "Menos de 3.5 Goles" o "Más de 1.5 Goles") si los datos defensivos/ofensivos lo sustentan con >= 75% de probabilidad.
3. FORMATO OBLIGATORIO DE 'topPick': Debe ser un OBJETO JSON con las siguientes propiedades:
   - "selection": nombre exacto de la apuesta (ej: "${bankerExampleSelection}").
   - "market": categoría del mercado (ej: "${bankerExampleMarket}").
   - "rationale": justificación táctica y estadística profunda (2 a 3 oraciones completas detallando xG, balance goles a favor/en contra, racha y por qué esta selección ofrece cobertura y alta certeza matemática). NUNCA repitas simplemente el nombre de la selección como justificación.
   - "probability": número entero de probabilidad del mercado seleccionado (ej: ${bankerExampleProb}).
   - "odds": cuota decimal acorde a dicha probabilidad y mercado (ej: ${bankerExampleOdds}).
4. Marcador proyectado ('predictedScore'): Debe reflejar fielmente los goles esperados (xG) y dar como ganador o con ventaja a ${favoredTeam} (${match.model?.predictedScore || (homeWinProb >= awayWinProb ? '2 - 1' : '1 - 2')}).
5. 'bttsAnalysis': Debe coincidir con la probabilidad de Ambos Anotan indicada en los datos (si es >= 55% argumenta Sí, si es < 50% argumenta No).
6. 'valueBet': Debe ser un objeto con "selection", "odds", "probability", "rationale" con valor matemático positivo.

Estructura exacta JSON requerida:
{
  "predictedScore": "${match.model?.predictedScore || (homeWinProb >= awayWinProb ? '2 - 1' : '1 - 2')}",
  "tacticalAnalysis": "Análisis táctico profundo que sustenta las virtudes ofensivas, control de transiciones y solidez defensiva de ${favoredTeam}.",
  "topPick": {
    "selection": "${bankerExampleSelection}",
    "market": "${bankerExampleMarket}",
    "rationale": "${bankerExampleRationale}",
    "probability": ${bankerExampleProb},
    "odds": ${bankerExampleOdds}
  },
  "topStake": "3/5 Unidades",
  "valueBet": {
    "selection": "Selección con cuota de valor estadístico",
    "odds": 2.10,
    "probability": 50,
    "rationale": "Justificación de valor estadístico positivo"
  },
  "cornersAnalysis": "Proyección y balance de córners basado en ataque por bandas",
  "bttsAnalysis": "Ambos Anotan: Sí o No con argumento clave"
}`;

  const userPrompt = `Analiza este partido de fútbol con los datos oficiales actuales:
${facts.join('\n')}

Devuelve el JSON del informe institucional.`;

  const fingerprint = createHash('sha256').update(JSON.stringify({ id: match.id, facts, provider: effectiveConfig.provider, model: chosenModel, force: options.forceRefresh ? Date.now() : 0 })).digest('hex');
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

        // Limpieza de etiquetas de razonamiento (DeepSeek, GLM, Claude, Nemotron, etc.)
        let cleaned = String(rawContent || '')
          .replace(/<think>[\s\S]*?<\/think>/gi, '')
          .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
          .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
          .replace(/```thought[\s\S]*?```/gi, '')
          .trim();

        // En caso de corte de tokens en un tag <think> sin cerrar:
        if (cleaned.includes('<think>')) {
          const lastClose = cleaned.lastIndexOf('</think>');
          if (lastClose !== -1) {
            cleaned = cleaned.substring(lastClose + 8).trim();
          } else {
            // Si el tag quedó abierto, buscar si ya empezó el JSON
            const jsonIdx = cleaned.indexOf('{');
            if (jsonIdx !== -1) {
              cleaned = cleaned.substring(jsonIdx).trim();
            }
          }
        }

        let jsonString = cleaned;
        const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (fenceMatch) {
          jsonString = fenceMatch[1];
        } else {
          // Extraer el objeto JSON delimitado más externo { ... }
          const firstOpen = cleaned.indexOf('{');
          const lastClose = cleaned.lastIndexOf('}');
          if (firstOpen !== -1 && lastClose > firstOpen) {
            jsonString = cleaned.substring(firstOpen, lastClose + 1);
          }
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

        const homeShort = match.homeTeam.shortName || match.homeTeam.name;
        const awayShort = match.awayTeam.shortName || match.awayTeam.name;
        const homeNameLower = match.homeTeam.name.toLowerCase();
        const homeShortLower = homeShort.toLowerCase();
        const awayNameLower = match.awayTeam.name.toLowerCase();
        const awayShortLower = awayShort.toLowerCase();

        let rawTopPick = parsed.topPick;
        let topPickSel = null;
        let topPickMkt = null;
        let topPickOdds = null;
        let topPickProb = null;
        let topPickStake = parsed.topStake || '3/5 Unidades';
        let topPickRationale = null;

        if (typeof rawTopPick === 'string') {
          topPickSel = rawTopPick.trim();
        } else if (rawTopPick && typeof rawTopPick === 'object') {
          topPickSel = rawTopPick.selection || rawTopPick.pick || null;
          topPickMkt = rawTopPick.market || null;
          topPickOdds = Number(rawTopPick.odds);
          topPickProb = Number(rawTopPick.probability);
          topPickStake = rawTopPick.stake || topPickStake;
          topPickRationale = rawTopPick.rationale || null;
        }

        if (!topPickSel) {
          topPickSel = defaultBanker?.selection || match.aiPick?.selection || `${favoredTeam} o Empate (1X)`;
        }

        // Armonización cuantitativa: evitar contradicciones entre IA y estadísticas oficiales (solo para selecciones de victoria directa 1X2 del rival)
        const isAwayDirectWin = (/gana|victoria/i.test(topPickSel) || topPickMkt?.includes('1X2') || topPickMkt?.includes('Victoria')) &&
          (topPickSel.toLowerCase().includes(awayNameLower) || (awayShortLower && new RegExp(`\\b${escapeRegex(awayShortLower)}\\b`, 'i').test(topPickSel))) &&
          !/empata|1x|x2|doble oportunidad/i.test(topPickSel);
        const isHomeDirectWin = (/gana|victoria/i.test(topPickSel) || topPickMkt?.includes('1X2') || topPickMkt?.includes('Victoria')) &&
          (topPickSel.toLowerCase().includes(homeNameLower) || (homeShortLower && new RegExp(`\\b${escapeRegex(homeShortLower)}\\b`, 'i').test(topPickSel))) &&
          !/empata|1x|x2|doble oportunidad/i.test(topPickSel);

        if (homeWinProb >= awayWinProb + 10 && isAwayDirectWin) {
          topPickSel = `${homeShort} o Empate (1X)`;
          topPickMkt = 'Doble Oportunidad (1X)';
          topPickProb = Math.min(97, Math.max(50, Math.round(homeWinProb + drawProb)));
          topPickOdds = match.odds?.dc1X && match.odds.dc1X <= 1.65 ? match.odds.dc1X : null;
          topPickRationale = defaultBanker?.rationale || null;
        } else if (awayWinProb >= homeWinProb + 10 && isHomeDirectWin) {
          topPickSel = `${awayShort} o Empate (X2)`;
          topPickMkt = 'Doble Oportunidad (X2)';
          topPickProb = Math.min(97, Math.max(50, Math.round(awayWinProb + drawProb)));
          topPickOdds = match.odds?.dcX2 && match.odds.dcX2 <= 1.65 ? match.odds.dcX2 : null;
          topPickRationale = defaultBanker?.rationale || null;
        }

        const isDC = /gana o empata|o empate|1x|x2|doble oportunidad/i.test(topPickSel);
        if (isDC) {
          const normSel = topPickSel.toLowerCase();
          const isAwayDC = /x2|\bvisita\b|\bvisitante\b|\baway\b/i.test(normSel) ||
            (awayNameLower && normSel.includes(awayNameLower)) ||
            (awayShortLower && new RegExp(`\\b${escapeRegex(awayShortLower)}\\b`, 'i').test(normSel));
          const isHomeDC = /1x|\blocal\b|\bhome\b/i.test(normSel) ||
            (homeNameLower && normSel.includes(homeNameLower)) ||
            (homeShortLower && new RegExp(`\\b${escapeRegex(homeShortLower)}\\b`, 'i').test(normSel));

          const isTargetAway = isAwayDC ? true : (isHomeDC ? false : (awayWinProb > homeWinProb));
          const teamLabel = isTargetAway ? (match.awayTeam.name || awayShort) : (match.homeTeam.name || homeShort);
          const tag = isTargetAway ? '(X2)' : '(1X)';
          topPickSel = `${teamLabel} o Empate ${tag}`;
          topPickMkt = isTargetAway ? 'Doble Oportunidad (X2)' : 'Doble Oportunidad (1X)';

          const dcProb = isTargetAway
            ? Math.min(97, Math.max(50, Math.round(awayWinProb + drawProb)))
            : Math.min(97, Math.max(50, Math.round(homeWinProb + drawProb)));

          if (!Number.isFinite(topPickProb) || topPickProb < 60 || topPickProb === Math.round(homeWinProb) || topPickProb === Math.round(awayWinProb)) {
            topPickProb = dcProb;
          }

          const dcFairOdds = Number(Math.max(1.12, Math.min(1.60, (100 / topPickProb) * 0.96)).toFixed(2));
          const marketDcOdds = isTargetAway ? match.odds?.dcX2 : match.odds?.dc1X;

          if (!Number.isFinite(topPickOdds) || topPickOdds > 1.65 || topPickOdds < 1.05 ||
              (!isTargetAway && match.odds?.homeWin && Math.abs(topPickOdds - match.odds.homeWin) < 0.05) ||
              (isTargetAway && match.odds?.awayWin && Math.abs(topPickOdds - match.odds.awayWin) < 0.05)) {
            topPickOdds = marketDcOdds && marketDcOdds <= 1.65 ? marketDcOdds : dcFairOdds;
          }
        } else {
          const normSel = topPickSel.toLowerCase();
          const isHomeWin = /gana|victoria/i.test(topPickSel) && (normSel.includes(homeNameLower) || (homeShortLower && new RegExp(`\\b${escapeRegex(homeShortLower)}\\b`, 'i').test(normSel)));
          const isAwayWin = /gana|victoria/i.test(topPickSel) && (normSel.includes(awayNameLower) || (awayShortLower && new RegExp(`\\b${escapeRegex(awayShortLower)}\\b`, 'i').test(normSel)));

          if (isHomeWin || isAwayWin) {
            const straightProb = isAwayWin ? Math.round(awayWinProb) : Math.round(homeWinProb);
            if (straightProb < 60) {
              const teamLabel = isAwayWin ? (match.awayTeam.name || awayShort) : (match.homeTeam.name || homeShort);
              const tag = isAwayWin ? '(X2)' : '(1X)';
              topPickSel = `${teamLabel} o Empate ${tag}`;
              topPickMkt = isAwayWin ? 'Doble Oportunidad (X2)' : 'Doble Oportunidad (1X)';
              topPickProb = isAwayWin ? Math.min(97, Math.max(50, Math.round(awayWinProb + drawProb))) : Math.min(97, Math.max(50, Math.round(homeWinProb + drawProb)));
              const marketDcOdds = isAwayWin ? match.odds?.dcX2 : match.odds?.dc1X;
              const dcFairOdds = Number(Math.max(1.12, Math.min(1.60, (100 / topPickProb) * 0.96)).toFixed(2));
              topPickOdds = marketDcOdds && marketDcOdds <= 1.65 ? marketDcOdds : dcFairOdds;
            } else {
              topPickProb = straightProb;
              topPickOdds = (isAwayWin ? match.odds?.awayWin : match.odds?.homeWin) || topPickOdds || Number((100 / straightProb * 0.95).toFixed(2));
              topPickMkt = isAwayWin ? '1X2 (Victoria Visita)' : '1X2 (Victoria Local)';
            }
          } else {
            if (!Number.isFinite(topPickProb) || topPickProb < 60) {
              topPickProb = defaultBanker?.probability || 70;
            }
            if (!Number.isFinite(topPickOdds) || topPickOdds < 1.05 || topPickOdds > 2.20) {
              topPickOdds = defaultBanker?.odds || 1.35;
            }
            if (!topPickMkt) {
              topPickMkt = defaultBanker?.market || 'Línea de Seguridad';
            }
          }
        }

        const isRationaleInvalid = !topPickRationale ||
          typeof topPickRationale !== 'string' ||
          topPickRationale.trim().length <= 15 ||
          topPickRationale.trim().toLowerCase() === topPickSel.trim().toLowerCase() ||
          topPickRationale.trim().toLowerCase().replace(/[()1x2]/gi, '').trim() === topPickSel.trim().toLowerCase().replace(/[()1x2]/gi, '').trim() ||
          topPickRationale.trim().toLowerCase() === `${homeNameLower} gana o empata` ||
          topPickRationale.trim().toLowerCase() === `${awayNameLower} gana o empata` ||
          topPickRationale.trim().toLowerCase() === `${favoredTeam.toLowerCase()} gana o empata` ||
          (topPickRationale.trim().toLowerCase().includes('gana o empata') && topPickRationale.trim().length <= 30);

        if (isRationaleInvalid) {
          topPickRationale = defaultBanker?.rationale ||
            (tacticalText ? extractFirstSentence(tacticalText) : null) ||
            `Selección de máxima seguridad respaldada por ${topPickProb}% de probabilidad estadística y solidez táctica de temporada.`;
        }

        const topPickCandidate = {
          selection: topPickSel,
          market: topPickMkt || 'Doble Oportunidad',
          odds: Number(Number(topPickOdds).toFixed(2)),
          probability: Math.round(Number(topPickProb)),
          stake: topPickStake,
          rationale: topPickRationale
        };

        let predictedScoreCandidate = formatScore(parsed.predictedScore) || match.model?.predictedScore || null;
        if (predictedScoreCandidate && predictedScoreCandidate.includes('-')) {
          const [hStr, aStr] = predictedScoreCandidate.split('-').map(s => parseInt(s.trim(), 10));
          if (!isNaN(hStr) && !isNaN(aStr)) {
            if (homeWinProb >= awayWinProb + 4 && aStr >= hStr) {
              predictedScoreCandidate = aStr > hStr ? `${aStr} - ${hStr}` : `${hStr + 1} - ${aStr}`;
            } else if (awayWinProb >= homeWinProb + 4 && hStr >= aStr) {
              predictedScoreCandidate = hStr > aStr ? `${aStr} - ${hStr}` : `${hStr} - ${aStr + 1}`;
            }
          }
        }

        let valueBetCandidate = null;
        if (parsed.valueBet) {
          if (typeof parsed.valueBet === 'string') {
            valueBetCandidate = {
              selection: parsed.valueBet,
              market: 'Mercado de Valor',
              odds: 2.10,
              probability: 50,
              rationale: parsed.valueBet.length > 15 ? parsed.valueBet : 'Selección con cuota de valor esperado positivo frente a las probabilidades del mercado.'
            };
          } else if (typeof parsed.valueBet === 'object') {
            valueBetCandidate = {
              selection: parsed.valueBet.selection || 'Selección de Valor',
              market: parsed.valueBet.market || 'Mercado de Valor',
              odds: Number(Number(parsed.valueBet.odds || 2.10).toFixed(2)),
              probability: Math.round(Number(parsed.valueBet.probability || 50)),
              rationale: parsed.valueBet.rationale || 'Selección con ventaja matemática y valor esperado positivo según xG.'
            };
          }
        }

        const isTopPickDC = /gana o empata|o empate|1x|x2|doble oportunidad/i.test(topPickCandidate.selection);

        const over15Prob = Math.round(Number(match.probabilities?.over15 != null
          ? match.probabilities.over15
          : (match.probabilities?.over25 != null ? Math.min(96, Math.round(Number(match.probabilities.over25) + 26)) : 82)));
        const under35Prob = Math.round(Number(match.probabilities?.under35 != null
          ? match.probabilities.under35
          : (match.probabilities?.over25 != null ? Math.min(94, Math.round(100 - (Number(match.probabilities.over25) - 24))) : 78)));

        let safePickCandidate;
        if (isTopPickDC) {
          if (under35Prob >= over15Prob) {
            safePickCandidate = {
              selection: 'Menos de 3.5 Goles',
              market: 'Total de Goles Asegurado',
              probability: under35Prob,
              odds: Number((match.odds?.under35 || Math.max(1.15, Math.min(1.48, (100 / under35Prob) * 0.96))).toFixed(2)),
              rationale: `Línea defensiva segura: ${under35Prob}% de probabilidad de registrar un máximo de 3 anotaciones según distribución Poisson.`
            };
          } else {
            safePickCandidate = {
              selection: 'Más de 1.5 Goles',
              market: 'Total de Goles Asegurado',
              probability: over15Prob,
              odds: Number((match.odds?.over15 || Math.max(1.15, Math.min(1.48, (100 / over15Prob) * 0.96))).toFixed(2)),
              rationale: `Línea ofensiva segura: ${over15Prob}% de probabilidad estadística de ver al menos dos goles en el partido.`
            };
          }
        } else {
          const isHomeFavored = homeWinProb >= awayWinProb;
          const teamLabel = isHomeFavored ? (match.homeTeam.name || homeShort) : (match.awayTeam.name || awayShort);
          const tag = isHomeFavored ? '(1X)' : '(X2)';
          const dcProb = Math.min(97, Math.max(50, Math.round((isHomeFavored ? homeWinProb : awayWinProb) + drawProb)));
          const marketDcOdds = isHomeFavored ? match.odds?.dc1X : match.odds?.dcX2;
          const dcFairOdds = Number(Math.max(1.12, Math.min(1.60, (100 / dcProb) * 0.96)).toFixed(2));
          const dcOdds = marketDcOdds && marketDcOdds <= 1.65 ? marketDcOdds : dcFairOdds;
          safePickCandidate = {
            selection: `${teamLabel} o Empate ${tag}`,
            market: isHomeFavored ? 'Doble Oportunidad (1X)' : 'Doble Oportunidad (X2)',
            probability: dcProb,
            odds: dcOdds,
            rationale: `Cobertura de alta probabilidad (${dcProb}%) respaldada por la distribución estadística Poisson y control de riesgo ante paridad.`
          };
        }

        if (valueBetCandidate && /ambos anotan|btts/i.test(valueBetCandidate.selection || '')) {
          valueBetCandidate = null;
        }

        const over25Prob = Number(match.probabilities?.over25 || 50);
        const defaultSecondary = over25Prob >= 52 ? {
          selection: 'Más de 2.5 Goles',
          market: 'Total Goles Over 2.5',
          probability: Math.round(over25Prob),
          odds: Number(Number(match.odds?.over25 || 1.85).toFixed(2)),
          rationale: `Ritmo ofensivo con promedio combinado superior a 2.5 goles esperados (${Math.round(over25Prob)}% probabilidad).`
        } : {
          selection: 'Menos de 2.5 Goles',
          market: 'Total Goles Under 2.5',
          probability: Math.round(100 - over25Prob),
          odds: Number(Number(match.odds?.under25 || 1.80).toFixed(2)),
          rationale: `Bloques defensivos compactos que limitan la generación de ocasiones claras.`
        };

        const secondaryPickCandidate = valueBetCandidate &&
          valueBetCandidate.selection !== topPickCandidate.selection &&
          valueBetCandidate.selection !== safePickCandidate.selection
            ? valueBetCandidate
            : defaultSecondary;

        const cornerRaw = parsed.cornersAnalysis || parsed.cornerAnalysis || null;
        const cornerAnalysis = cornerRaw ? (typeof cornerRaw === 'string' ? cornerRaw : (cornerRaw.summary || JSON.stringify(cornerRaw))) : null;

        return {
          ...baseline,
          modelUsed: model,
          aiAvailable: true,
          aiStatus: `Informe generado por IA (${effectiveConfig.provider.toUpperCase()} / ${model}) en tiempo real.`,
          generatedAt: new Date().toISOString(),
          predictedScore: predictedScoreCandidate,
          tacticalAnalysis: tacticalText,
          narrativeAnalysis: tacticalText,
          topPick: topPickCandidate,
          valueBet: valueBetCandidate,
          safePick: safePickCandidate,
          secondaryPick: secondaryPickCandidate,
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
      aiStatus: 'Análisis cuantitativo institucional basado en el modelo matemático de Poisson y estadísticas oficiales.',
      narrativeAnalysis: facts.join('\n\n')
    };
  });
}
