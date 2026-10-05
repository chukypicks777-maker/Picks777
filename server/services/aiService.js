import { createHash } from 'node:crypto';
import { validateAiConfig } from '../security.js';
import { PROVIDER_PRESETS } from '../../src/constants/aiProviders.js';
import { CONFIG } from '../config.js';
import { storage } from '../storage.js';
import { cachedData } from './dataCache.js';
import { getTop3Opportunities } from '../../src/utils/mathProbabilities.js';
import { poissonModel, deriveCalibratedPoissonModel, buildPick } from './probabilityModel.js';

import { fetchProviderModels, executeAiChatCompletion } from './aiProviderClient.js';
export { fetchProviderModels, executeAiChatCompletion, testAiConnection } from './aiProviderClient.js';

export async function getEffectiveAiConfig() {
  let dbConfig = await storage.getAiConfig();
  if (!dbConfig?.apiKey && process.env.AI_DEFAULT_CONFIG) {
    try {
      let rawConfig = String(process.env.AI_DEFAULT_CONFIG).trim();
      if (rawConfig.startsWith('sk-') && !rawConfig.startsWith('{')) {
        dbConfig = validateAiConfig({
          provider: 'custom',
          apiKey: rawConfig,
          baseUrl: 'https://vyceai.com/v1',
          selectedModel: 'deepseek-v4.1'
        });
      } else {
        const parsed = JSON.parse(rawConfig);
        if (typeof parsed === 'string' && parsed.startsWith('sk-')) {
          dbConfig = validateAiConfig({
            provider: 'custom',
            apiKey: parsed,
            baseUrl: 'https://vyceai.com/v1',
            selectedModel: 'deepseek-v4.1'
          });
        } else {
          dbConfig = validateAiConfig(parsed);
        }
      }
    } catch {
      throw new Error('La configuración privada predeterminada de IA no es válida.');
    }
  }

  let provider = String(dbConfig?.provider || '').trim().toLowerCase();
  if (provider === 'openrouter') provider = 'custom';
  let apiKey = String(dbConfig?.apiKey || '').trim();
  let baseUrl = String(dbConfig?.baseUrl || '').trim();
  if (baseUrl.includes('openrouter.ai')) baseUrl = 'https://vyceai.com/v1';

  // If no database key is set, seamlessly fall back to environment credentials
  if (!apiKey) {
    if (CONFIG.CUSTOM_AI_API_KEY) {
      provider = 'custom';
      apiKey = CONFIG.CUSTOM_AI_API_KEY;
      baseUrl = CONFIG.CUSTOM_AI_BASE_URL || 'https://vyceai.com/v1';
    } else if (process.env.AGENTROUTER_API_KEY) {
      provider = 'agentrouter';
      apiKey = process.env.AGENTROUTER_API_KEY;
      baseUrl = 'https://agentrouter.org/v1';
    } else if (process.env.DEEPSEEK_API_KEY) {
      provider = 'deepseek';
      apiKey = process.env.DEEPSEEK_API_KEY;
      baseUrl = 'https://api.deepseek.com/v1';
    } else if (process.env.GROQ_API_KEY) {
      provider = 'groq';
      apiKey = process.env.GROQ_API_KEY;
      baseUrl = 'https://api.groq.com/openai/v1';
    } else if (process.env.GEMINI_API_KEY) {
      provider = 'gemini';
      apiKey = process.env.GEMINI_API_KEY;
      baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    }
  }

  provider = provider || 'custom';
  const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.custom;
  baseUrl = baseUrl || preset?.defaultBaseUrl || 'https://vyceai.com/v1';

  let selectedModel;
  if (dbConfig?.selectedModel !== undefined && (!dbConfig?.provider || dbConfig.provider === provider)) {
    selectedModel = String(dbConfig.selectedModel).trim();
  } else {
    selectedModel = String(preset?.defaultModel || CONFIG.DEFAULT_MODEL || 'deepseek-v4.1').trim();
  }
  if (selectedModel.includes('openrouter')) {
    selectedModel = preset?.defaultModel || 'deepseek-v4.1';
  }
  if (provider === 'gemini' && selectedModel && !selectedModel.startsWith('gemini')) {
    selectedModel = preset?.defaultModel || 'gemini-2.5-flash';
  }
  if (provider === 'groq' && selectedModel && selectedModel.startsWith('deepseek-v4')) {
    selectedModel = preset?.defaultModel || 'llama-3.3-70b-versatile';
  }

  const modelName = (dbConfig?.modelName !== undefined && (!dbConfig?.provider || dbConfig.provider === provider))
    ? String(dbConfig.modelName).trim()
    : (selectedModel === 'deepseek-v4.1' ? 'DeepSeek V4.1 Flash' : selectedModel.startsWith('gemini') ? 'Google Gemini 2.5 Flash' : selectedModel);

  return {
    provider,
    apiKey,
    baseUrl,
    selectedModel,
    modelName: modelName || selectedModel,
    isConfigured: Boolean(apiKey && apiKey.length >= 4),
    updatedAt: dbConfig?.updatedAt || null
  };
}

export async function availableModels() {
  const config = await getEffectiveAiConfig();
  if (!config.isConfigured) return [];
  return fetchProviderModels(config.provider, config.apiKey, config.baseUrl);
}

export function extractJsonFromAiResponse(raw) {
  if (!raw || typeof raw !== 'string') return null;

  let cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .trim();

  // Handle unclosed <think> or <thought>
  if (cleaned.includes('<think>') && !cleaned.includes('</think>')) {
    const braceIdx = cleaned.indexOf('{');
    if (braceIdx !== -1) cleaned = cleaned.slice(braceIdx);
  }
  if (cleaned.includes('<thought>') && !cleaned.includes('</thought>')) {
    const braceIdx = cleaned.indexOf('{');
    if (braceIdx !== -1) cleaned = cleaned.slice(braceIdx);
  }

  const tryParse = (str) => {
    if (!str || typeof str !== 'string') return null;
    try {
      const parsed = JSON.parse(str);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {}
    try {
      const fixed = str.replace(/,\s*([}\]])/g, '$1');
      const parsed = JSON.parse(fixed);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {}
    try {
      const sanitized = str.replace(/"(?:[^"\\]|\\.)*"/gs, m =>
        m.replace(/\r?\n/g, '\\n').replace(/\t/g, '\\t')
      ).replace(/,\s*([}\]])/g, '$1');
      const parsed = JSON.parse(sanitized);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {}
    return null;
  };

  // 1. Direct JSON parse
  const direct = tryParse(cleaned);
  if (direct) return direct;

  // 2. Iterate all markdown ```json or ``` code blocks
  const codeBlocks = [...cleaned.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];
  for (const block of codeBlocks) {
    const parsed = tryParse(block[1].trim());
    if (parsed) return parsed;
  }

  // 3. Scan from first { to last }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) {
    const parsed = tryParse(cleaned.slice(start, end + 1));
    if (parsed) return parsed;

    // If there were preceding scratchpad braces, try inner braces
    let cursor = start;
    while (cursor < end) {
      const nextStart = cleaned.indexOf('{', cursor + 1);
      if (nextStart === -1 || nextStart >= end) break;
      const innerParsed = tryParse(cleaned.slice(nextStart, end + 1));
      if (innerParsed) return innerParsed;
      cursor = nextStart;
    }
  }

  return null;
}

export async function generateAiMatchReport(match, options = {}) {
  const deadline = options.deadline ?? Date.now() + 45000;
  let activeMatch = match;
  if (!activeMatch.model && activeMatch.status !== 'POSTPONED' && activeMatch.status !== 'CANCELLED') {
    const computed = poissonModel(activeMatch.homeTeam, activeMatch.awayTeam) ||
      deriveCalibratedPoissonModel(activeMatch.probabilities, activeMatch.homeTeam, activeMatch.awayTeam, activeMatch.odds);
    if (computed) {
      activeMatch = {
        ...activeMatch,
        model: computed,
        probabilities: { ...computed.probabilities },
        aiPick: activeMatch.aiPick || buildPick({ ...activeMatch, model: computed })
      };
    }
  }
  match = activeMatch;
  const p = match.model?.probabilities || match.probabilities || {};
  const fmt = n => Number.isFinite(n) ? Number(n.toFixed(1)) : 'N/D';
  const homePos = match.homeTeam?.position ?? match.homeTeam?.rank;
  const awayPos = match.awayTeam?.position ?? match.awayTeam?.rank;
  const homePoints = match.homeTeam?.points != null ? `${match.homeTeam.points} pts` : '';
  const awayPoints = match.awayTeam?.points != null ? `${match.awayTeam.points} pts` : '';
  const homeName = match.homeTeam?.name || 'Local';
  const awayName = match.awayTeam?.name || 'Visitante';
  const picks = getTop3Opportunities(match);

  const facts = [
    { id: 'fixture', text: `${homeName} vs ${awayName}. Torneo: ${match.leagueName || 'Oficial'}. Estado: ${match.status}. Inicio: ${match.kickoff}.` },
    { id: 'source', text: `Fuente de los registros: ${match.source || 'ESPN'}. Consulta: ${match.fetchedAt || 'N/D'}.` }
  ];
  if (match.status === 'LIVE') {
    facts.push({
      id: 'liveState',
      text: `Marcador en directo: ${homeName} ${match.liveScore?.home ?? 'N/D'} - ${match.liveScore?.away ?? 'N/D'} ${awayName}. Minuto: ${match.liveMinute || match.minute || 'En juego'}.`
    });
  }
  for (const [side, team, pos, pts] of [['home', match.homeTeam, homePos, homePoints], ['away', match.awayTeam, awayPos, awayPoints]]) {
    const tName = team?.name || (side === 'home' ? homeName : awayName);
    const gpInfo = Number.isFinite(team?.gamesPlayed) ? `${team.gamesPlayed} PJ` : 'En disputa';
    const gF = team?.goalsFor ?? 'N/D';
    const gA = team?.goalsAgainst ?? 'N/D';
    const pInfo = pos ? `Posición #${pos}` : '';
    const ptsInfo = pts ? `(${pts})` : '';
    const cRate = team?.cleanSheetRate != null ? `valla invicta ${team.cleanSheetRate}%` : '';
    const corners = team?.avgCorners != null ? `${team.avgCorners} córners/p` : '';
    const cards = team?.avgYellowCards != null ? `${team.avgYellowCards} amarillas/p` : '';
    const extra = [pInfo, ptsInfo, cRate, corners, cards].filter(Boolean).join(', ');
    facts.push({ id: side, text: `${tName} (${side === 'home' ? 'Local' : 'Visitante'}): ${gpInfo}, ${gF} GF, ${gA} GC. ${extra ? `Registros: ${extra}.` : ''}` });
  }
  if (match.model) {
    facts.push({ id: 'result', text: `Estimación Poisson: ${homeName} ${fmt(p.homeWin)}%, Empate ${fmt(p.draw)}%, ${awayName} ${fmt(p.awayWin)}%.` });
    facts.push({ id: 'expectedGoals', text: `Media de goles Poisson (no xG observado): ${homeName} ${fmt(match.model.expectedGoals?.home)} goles vs ${awayName} ${fmt(match.model.expectedGoals?.away)} goles.` });
    facts.push({ id: 'goals', text: `Goles totales: Más de 1.5 ${fmt(p.over15)}%, Menos de 1.5 ${fmt(p.under15)}%; Más de 2.5 ${fmt(p.over25)}%, Menos de 2.5 ${fmt(p.under25)}%; Más de 3.5 ${fmt(p.over35)}%, Menos de 3.5 ${fmt(p.under35)}%. Ambos anotan: Sí ${fmt(p.bttsYes)}%, No ${fmt(p.bttsNo)}%.` });
    facts.push({ id: 'score', text: `Marcador individual más probable: ${match.model.predictedScore} (${fmt(match.model.scoreDistribution?.[0]?.probability)}%). Escenario de máxima probabilidad del modelo Poisson.` });
    facts.push({ id: 'sample', text: `Muestra de temporada: ${match.model.sampleSize?.home ?? 'N/D'} partidos (local) y ${match.model.sampleSize?.away ?? 'N/D'} partidos (visitante).` });
  } else facts.push({ id: 'missing', text: 'Sin muestra suficiente para un pronóstico Poisson previo al partido.' });

  if (Array.isArray(match.h2h) && match.h2h.length > 0) {
    const h2hText = match.h2h.slice(0, 5).map(h => `${h.home} ${h.score || 'vs'} ${h.away}`).join('; ');
    facts.push({ id: 'h2h', text: `Historial directo H2H (${match.h2h.length} partidos oficiales recientes): ${h2hText}.` });
  }

  if (Number.isFinite(homePos) || Number.isFinite(awayPos)) {
    facts.push({
      id: 'standings',
      text: `Clasificación oficial en ${match.leagueName || 'liga'}: ${homeName} (Puesto #${homePos ?? 'N/D'}, ${homePoints || 'N/D'}) vs ${awayName} (Puesto #${awayPos ?? 'N/D'}, ${awayPoints || 'N/D'}).`
    });
  }

  if ((match.homeTeam?.form && match.homeTeam.form.length > 0) || (match.awayTeam?.form && match.awayTeam.form.length > 0)) {
    facts.push({
      id: 'form',
      text: `Racha de los últimos 5 partidos: ${homeName} [${(match.homeTeam.form || []).join('-') || 'N/D'}] vs ${awayName} [${(match.awayTeam.form || []).join('-') || 'N/D'}].`
    });
  }

  if (match.odds) {
    const oddsParts = [];
    if (match.odds.homeWin) oddsParts.push(`Gana ${homeName} @${match.odds.homeWin}`);
    if (match.odds.draw) oddsParts.push(`Empate @${match.odds.draw}`);
    if (match.odds.awayWin) oddsParts.push(`Gana ${awayName} @${match.odds.awayWin}`);
    if (match.odds.over25) oddsParts.push(`Más de 2.5 goles @${match.odds.over25}`);
    if (match.odds.under25) oddsParts.push(`Menos de 2.5 goles @${match.odds.under25}`);
    if (match.odds.bttsYes) oddsParts.push(`Ambos Anotan Sí @${match.odds.bttsYes}`);
    if (oddsParts.length > 0) {
      facts.push({
        id: 'odds',
        text: `Cuotas oficiales de apuestas en el mercado: ${oddsParts.join(', ')}. Proveedor: ${match.oddsProvider || 'Oficial'}.`
      });
    }
  }

  if (Array.isArray(match.recentMatches) && match.recentMatches.length > 0) {
    for (const group of match.recentMatches) {
      const isHome = String(group.teamId) === String(match.homeTeamId) || group.team === homeName;
      const tName = isHome ? homeName : awayName;
      const recList = (group.events || []).slice(0, 5).map(e => `${e.opponent || 'Rival'} (${e.score || 'vs'}, res: ${e.result || 'P'})`).join('; ');
      if (recList) {
        facts.push({
          id: `recent_${isHome ? 'home' : 'away'}`,
          text: `Últimos partidos oficiales de ${tName}: ${recList}.`
        });
      }
    }
  }

  const narrative = facts.map(f => f.text).join('\n\n');
  const fact = id => facts.find(item => item.id === id)?.text || '';
  const baselineSections = {
    dataVerification: [fact('source'), fact('home'), fact('away'), fact('sample')].filter(Boolean).join(' '),
    goalsAnalysis: match.model ? [fact('expectedGoals'), fact('goals')].join(' ') : 'Sin muestra suficiente para el modelo Poisson. Los mercados disponibles pueden proceder de cuotas.',
    positiveFactors: [fact('result'), ...picks.slice(0, 2).map(pick => pick.selection + ': ' + fmt(pick.probability) + '% de probabilidad estimada.')].filter(Boolean),
    negativeFactors: ['No hay una tasa histórica de aciertos validada. Las probabilidades son estimaciones.',
      match.status === 'SCHEDULED' ? 'El modelo supone independencia entre los goles de ambos equipos; no incorpora alineaciones ni lesiones verificadas.' : 'Proyección informativa: no es un modelo en vivo ni un pronóstico archivado antes del partido.'],
    verdict: [fact('score'), picks[0] ? 'Selección del modelo: ' + picks[0].selection + ' (' + fmt(picks[0].probability) + '%).' : 'Sin datos suficientes para una selección.'].filter(Boolean).join(' ')
  };

  const baseline = { generatedAt: new Date().toISOString(), modelUsed: null, aiAvailable: false,
    source: match.source, sourceUrl: match.sourceUrl, dataFetchedAt: match.fetchedAt,
    probabilities: p, predictedScore: match.model?.predictedScore ?? match.probabilities?.predictedScore ?? null,
    topPick: picks[0] ?? null, safePick: picks[1] ?? null, secondaryPick: picks[2] ?? null, valueBet: null,
    facts: facts.map(f => f.text), analysisSections: baselineSections, narrativeAnalysis: narrative,
    aiStatus: 'Informe calculado con registros del proveedor; sin texto predictivo no verificado.',
    limitations: 'Estimaciones sujetas al tamaño de muestra y a errores del proveedor; no garantizan resultados.' };
  return generateGroundedAiReport(match, facts, baseline, { ...options, deadline });
}

// All sports share the same provider configuration and fact-only validation.
export async function generateGroundedAiReport(match, facts, baseline, options = {}) {
  const deadline = options.deadline ?? Date.now() + 45000;
  const p = baseline.probabilities || {};
  const baselineSections = baseline.analysisSections || {};
  const narrative = baseline.narrativeAnalysis || '';
  const homeName = match.homeTeam?.name || 'Local';
  const awayName = match.awayTeam?.name || 'Visitante';
  let config;
  try {
    config = await getEffectiveAiConfig();
  } catch {
    config = {
      provider: 'custom',
      apiKey: '',
      baseUrl: 'https://vyceai.com/v1',
      selectedModel: 'deepseek-v4.1',
      modelName: 'DeepSeek V4.1 Flash',
      isConfigured: false,
      updatedAt: null
    };
  }

  // La configuración persistente guardada por el Owner en base de datos tiene prioridad absoluta.
  // Solo si el servidor no tiene una clave activa configurada, se permite options.aiConfig de fallback.
  if (!config.isConfigured && options.aiConfig && typeof options.aiConfig === 'object') {
    try {
      const validated = validateAiConfig(options.aiConfig);
      if (validated.apiKey && validated.apiKey.length >= 4) {
        config = {
          ...config,
          ...validated,
          isConfigured: true,
          updatedAt: options.aiConfig.updatedAt || 'client_override'
        };
      }
    } catch {}
  }
  if (options.model && typeof options.model === 'string' && options.model.trim()) {
    config.selectedModel = options.model.trim();
  }
  if (!config.selectedModel) {
    config.selectedModel = PROVIDER_PRESETS[config.provider]?.defaultModel || 'deepseek-v4.1';
  }
  if (config.provider === 'gemini' && config.selectedModel && !config.selectedModel.startsWith('gemini')) {
    config.selectedModel = PROVIDER_PRESETS.gemini?.defaultModel || 'gemini-2.5-flash';
  }
  if (config.provider === 'groq' && config.selectedModel && config.selectedModel.startsWith('deepseek-v4')) {
    config.selectedModel = PROVIDER_PRESETS.groq?.defaultModel || 'llama-3.3-70b-versatile';
  }
  if (!config.isConfigured) return baseline;
  const cacheKey = 'ai:grounded-v6:' + createHash('sha256').update(JSON.stringify([facts, p, config.updatedAt, config.provider, config.selectedModel])).digest('hex');
  const generate = async () => {
    try {
      const promptCatalog = facts.map(f => ({ id: f.id, summary: f.text }));
      const validIdsList = facts.map(f => f.id);

      // Candidate models list: configured model first, followed by preset default and resilient fallback candidates
      const candidateModels = [];
      let chosenModel = config.selectedModel;
      if (chosenModel && chosenModel.includes('openrouter')) chosenModel = 'deepseek-v4.1';
      if (chosenModel) candidateModels.push(chosenModel);
      const defaultForProvider = PROVIDER_PRESETS[config.provider]?.defaultModel || CONFIG.DEFAULT_MODEL || 'deepseek-v4.1';
      if (defaultForProvider && !candidateModels.includes(defaultForProvider)) {
        candidateModels.push(defaultForProvider);
      }
      const providerFallbacks = {
        gemini: ['gemini-3.5-flash-lite', 'gemini-flash-latest', 'gemini-3.1-pro-preview'],
        custom: ['deepseek-chat', 'deepseek-v4-flash'],
        agentrouter: ['deepseek-chat'],
        deepseek: ['deepseek-reasoner'],
        groq: ['llama-3.1-8b-instant']
      }[config.provider] || [];
      for (const fallback of providerFallbacks) {
        if (!candidateModels.includes(fallback)) candidateModels.push(fallback);
      }

      let parsed = null;
      let usedModel = config.selectedModel;

      const systemPrompt = 'Selecciona y ordena los hechos más relevantes del catálogo para explicar el partido y sus incertidumbres. Devuelve solo JSON: {"factIds":["id"]}, con 1 a 6 IDs presentes en el catálogo. No generes cifras, selecciones, tácticas, lesiones, cuotas ni texto libre. Las probabilidades no son tasas históricas de aciertos.';

      for (const candidate of candidateModels) {
        const remaining = deadline - Date.now();
        if (remaining < 1000) break;
        try {
          const raw = await executeAiChatCompletion({
            ...config,
            model: candidate,
            systemPrompt,
            userPrompt: `Partido a analizar (${match.leagueName || 'Liga Oficial'}): ${homeName} (Local) vs ${awayName} (Visitante).
Registros del proveedor y estimaciones estadísticas: ${JSON.stringify(promptCatalog)}.
Prioriza entre 1 y 6 hechos del catálogo, incluyendo incertidumbres y falta de datos cuando existan.
Devuelve exclusivamente {"factIds":["id"]} con IDs válidos de ${JSON.stringify(validIdsList)}.
No escribas análisis libre, no calcules probabilidades ni selecciones y no agregues hechos.`,
            maxTokens: 4000,
            temperature: 0.3,
            timeoutMs: Math.min(20000, remaining)
          });

          if (raw) {
            const candidateParsed = extractJsonFromAiResponse(raw);
            if (candidateParsed && typeof candidateParsed === 'object') {
              let rawIds = candidateParsed.factIds ?? candidateParsed.fact_ids ?? candidateParsed.facts ??
                candidateParsed.analysis?.factIds ?? candidateParsed.analysis?.fact_ids ?? candidateParsed.analysis?.facts;
              if (typeof rawIds === 'string') {
                rawIds = rawIds.split(',').map(s => s.trim()).filter(Boolean);
              }
              if (Array.isArray(rawIds) && rawIds.length >= 1 && rawIds.length <= 12) {
                const allStrings = rawIds.every(id => typeof id === 'string');
                const validSelected = allStrings ? rawIds.map(s => s.trim()).filter(id => validIdsList.includes(id)) : [];
                if (allStrings && validSelected.length >= 1 && validSelected.length <= 6 && validSelected.length === rawIds.length) {
                  candidateParsed.factIds = validSelected;
                  if (!candidateParsed.analysis || typeof candidateParsed.analysis !== 'object') {
                    const fallbackSource = (candidateParsed.analysisSections && typeof candidateParsed.analysisSections === 'object')
                      ? candidateParsed.analysisSections
                      : candidateParsed;
                    candidateParsed.analysis = {
                      dataVerification: fallbackSource.dataVerification,
                      goalsAnalysis: fallbackSource.goalsAnalysis,
                      positiveFactors: fallbackSource.positiveFactors,
                      negativeFactors: fallbackSource.negativeFactors,
                      verdict: fallbackSource.verdict
                    };
                  }
                  parsed = candidateParsed;
                  usedModel = candidate;
                  break;
                } else {
                  console.warn(`[aiService] Candidate model ${candidate} returned unauthorized or invalid factIds. Trying next candidate...`);
                }
              } else {
                console.warn(`[aiService] Candidate model ${candidate} returned missing or non-array factIds. Trying next candidate...`);
              }
            } else {
              console.warn(`[aiService] Candidate model ${candidate} responded but JSON was unparseable. Trying next candidate...`);
            }
          }
        } catch (err) {
          console.warn(`[aiService] Candidate model ${candidate} failed: ${err.message}. Trying next candidate...`);
        }
      }

      if (!parsed) {
        // If external AI models fail, gracefully return verified baseline without throwing
        return {
          ...baseline,
          aiAvailable: false,
          aiStatus: 'Informe estadístico; la IA no devolvió una respuesta verificable.'
        };
      }

      const keypoints = [...new Set(parsed.factIds)].map(id => facts.find(f => f.id === id)?.text).filter(Boolean);

      // Render source facts, never unverified free-form claims from the provider.
      const analysisSections = baselineSections;
      const finalNarrative = keypoints.join('\n\n') + '\n\n' + narrative;

      // Language models never set numerical probabilities, selections or bookmaker odds.
      const finalTopPick = baseline.topPick;

      return {
        ...baseline,
        topPick: finalTopPick,
        aiAvailable: true,
        modelUsed: usedModel,
        analyzedAt: new Date().toISOString(),
        isDeepAnalysis: false,
        dataGrounded: true,
        analysisMode: 'fact-selection',
        narrativeVerified: true,
        verifiedStatsCount: facts.length,
        tacticalKeypoints: keypoints.length ? keypoints : [facts[0].text],
        analysisSections,
        narrativeAnalysis: finalNarrative,
        aiStatus: `Hechos priorizados por IA (${usedModel}); cifras y conclusiones calculadas por el modelo estadístico. Sin calibración histórica de aciertos.`
      };
    } catch (err) {
      console.error('[aiService] Error generating or validating AI match report:', err?.message || err);
      return {
        ...baseline,
        aiAvailable: false,
        aiStatus: 'Informe estadístico; proveedor de IA no disponible.'
      };
    }
  };
  let ttlSeconds = 300;
  if (match.status === 'FINISHED') {
    ttlSeconds = 3600;
  } else if (match.status === 'LIVE') {
    ttlSeconds = 30;
  } else if (match.status === 'SCHEDULED' && match.kickoff && Date.now() > Date.parse(match.kickoff)) {
    ttlSeconds = 30;
  }
  return cachedData(cacheKey, ttlSeconds, generate, { forceRefresh: Boolean(options.forceRefresh) });
}
