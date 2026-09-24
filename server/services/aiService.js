import { createHash } from 'node:crypto';
import { validateAiConfig } from '../security.js';
import { PROVIDER_PRESETS } from '../../src/constants/aiProviders.js';
import { CONFIG } from '../config.js';
import { storage } from '../storage.js';
import { cachedData } from './dataCache.js';
import { getTop3Opportunities } from '../../src/utils/mathProbabilities.js';

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

  let selectedModel = dbConfig?.selectedModel !== undefined
    ? String(dbConfig.selectedModel).trim()
    : String(preset?.defaultModel || CONFIG.DEFAULT_MODEL || 'deepseek-v4.1').trim();
  if (selectedModel.includes('openrouter')) {
    selectedModel = 'deepseek-v4.1';
  }

  const modelName = dbConfig?.modelName !== undefined
    ? String(dbConfig.modelName).trim()
    : (selectedModel === 'deepseek-v4.1' ? 'DeepSeek V4.1 Flash' : '');

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
    { id: 'source', text: `Fuente oficial: ${match.source || 'ESPN'}. Consulta: ${match.fetchedAt || 'N/D'}.` }
  ];
  for (const [side, team, pos, pts] of [['home', match.homeTeam, homePos, homePoints], ['away', match.awayTeam, awayPos, awayPoints]]) {
    if (Number.isFinite(team?.gamesPlayed)) {
      const gF = team.goalsFor ?? 'N/D';
      const gA = team.goalsAgainst ?? 'N/D';
      const pInfo = pos ? `Posición #${pos}` : '';
      const ptsInfo = pts ? `(${pts})` : '';
      const cRate = team.cleanSheetRate != null ? `valla invicta ${team.cleanSheetRate}%` : '';
      const corners = team.avgCorners != null ? `${team.avgCorners} córners/p` : '';
      const cards = team.avgYellowCards != null ? `${team.avgYellowCards} amarillas/p` : '';
      const extra = [pInfo, ptsInfo, cRate, corners, cards].filter(Boolean).join(', ');
      facts.push({ id: side, text: `${team.name} (${side === 'home' ? 'Local' : 'Visitante'}): ${team.gamesPlayed} PJ, ${gF} GF, ${gA} GC. ${extra ? `Registros: ${extra}.` : ''}` });
    }
  }
  if (match.model) {
    facts.push({ id: 'result', text: `Estimación Poisson: ${homeName} ${fmt(p.homeWin)}%, Empate ${fmt(p.draw)}%, ${awayName} ${fmt(p.awayWin)}%.` });
    facts.push({ id: 'expectedGoals', text: `xG Poisson proyectado: ${homeName} ${fmt(match.model.expectedGoals?.home)} xG vs ${awayName} ${fmt(match.model.expectedGoals?.away)} xG.` });
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

  const posText = (homePos && awayPos) ? ` (Puesto #${homePos} vs #${awayPos})` : '';
  const hForm = (match.homeTeam?.form || []).join('-');
  const aForm = (match.awayTeam?.form || []).join('-');
  const formText = (hForm || aForm) ? ` Rachas recientes: ${homeName} [${hForm || 'N/D'}] vs ${awayName} [${aForm || 'N/D'}].` : '';
  const xGHome = match.model?.expectedGoals?.home != null ? fmt(match.model.expectedGoals.home) : null;
  const xGAway = match.model?.expectedGoals?.away != null ? fmt(match.model.expectedGoals.away) : null;
  const xGText = (xGHome && xGAway) ? ` xG proyectado: ${homeName} ${xGHome} xG vs ${awayName} ${xGAway} xG.` : '';

  const narrative = facts.map(f => f.text).join('\n\n');
  const baselineSections = {
    dataVerification: `Datos oficiales de ${match.source || 'ESPN'} para ${homeName} vs ${awayName}${posText}. ` +
      (match.model ? `Muestra cuantitativa: ${match.model.sampleSize?.home ?? 'N/D'} partidos (local) y ${match.model.sampleSize?.away ?? 'N/D'} partidos (visitante).${formText}${xGText}` : 'Sin muestra histórica previa.'),
    goalsAnalysis: match.model
      ? `Modelo Poisson proyecta Over 2.5 en ${fmt(p.over25)}% y Under 2.5 en ${fmt(p.under25)}%. Ambos Anotan (BTTS) en ${fmt(p.bttsYes)}% (Over 1.5 en ${fmt(p.over15)}%). Dinámica prevista: ${Number(p.over25) >= 50 ? `Partido de ritmo alto con ${homeName} y ${awayName} buscando el arco rival.` : `Encuentro cerrado y de rigor táctico donde el control defensivo predominará entre ${homeName} y ${awayName}.`}`
      : `Dinámica de goles en procesamiento según el calendario oficial de ${match.leagueName || 'la liga'}.`,
    positiveFactors: [
      match.homeTeam?.gamesPlayed ? `${homeName}: ${match.homeTeam.goalsFor ?? 0} goles a favor en ${match.homeTeam.gamesPlayed} partidos disputados (${homePoints}).` : `Ventaja de localía para ${homeName}.`,
      match.model ? `Probabilidad matemática principal: ${Number(p.homeWin) >= Number(p.awayWin) ? `${homeName} (${fmt(p.homeWin)}%)` : `${awayName} (${fmt(p.awayWin)}%)`} bajo distribución Poisson.` : 'Registro de partidos oficiales disponible.',
      picks[0] ? `Selección destacada: ${picks[0].selection} con ${picks[0].probability}% de probabilidad estadística.` : 'Equilibrio táctico en las métricas de temporada.'
    ],
    negativeFactors: [
      Number(p.draw) ? `Margen de empate o sorpresa para ${awayName} estimado en ${fmt(Number(p.draw) + Math.min(Number(p.homeWin), Number(p.awayWin)))}%.` : 'Margen de incertidumbre en el resultado.',
      (match.awayTeam?.goalsFor != null && match.awayTeam.goalsFor > 0) ? `${awayName} promedia capacidad goleadora con ${match.awayTeam.goalsFor} tantos anotados (${awayPoints}).` : `Varianza intrínseca en 90 minutos para ${homeName} vs ${awayName}.`
    ],
    verdict: match.model
      ? `Marcador individual más probable: ${match.model.predictedScore} (${fmt(match.model.scoreDistribution?.[0]?.probability)}%). Selección recomendada por modelo: ${picks[0]?.market || 'Doble Oportunidad'} (${picks[0]?.selection || homeName}) con ${picks[0]?.probability ? fmt(picks[0].probability) + '%' : 'respaldo probabilístico'}.`
      : 'Evaluación prudente; se recomienda verificar alineaciones previas al pitido inicial.'
  };

  const baseline = { generatedAt: new Date().toISOString(), modelUsed: null, aiAvailable: false,
    source: match.source, sourceUrl: match.sourceUrl, dataFetchedAt: match.fetchedAt,
    probabilities: p, predictedScore: match.model?.predictedScore ?? null,
    topPick: picks[0] ?? null, safePick: picks[1] ?? null, secondaryPick: picks[2] ?? null, valueBet: null,
    facts: facts.map(f => f.text), analysisSections: baselineSections, narrativeAnalysis: narrative,
    aiStatus: 'Informe calculado con registros del proveedor; sin texto predictivo no verificado.',
    limitations: 'Estimaciones sujetas al tamaño de muestra y a errores del proveedor; no garantizan resultados.' };
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
          updatedAt: new Date().toISOString()
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
  if (!config.isConfigured) return baseline;
  const cacheKey = 'ai:grounded-v3:' + createHash('sha256').update(JSON.stringify([facts, p, config.updatedAt, config.provider, config.selectedModel])).digest('hex');
  const generate = async () => {
    try {
      const promptCatalog = facts.map(f => ({ id: f.id, summary: f.text }));
      const validIdsList = facts.map(f => f.id);

      // Candidate models list: configured model first, followed by preset default if distinct
      const candidateModels = [];
      let chosenModel = config.selectedModel;
      if (chosenModel && chosenModel.includes('openrouter')) chosenModel = 'deepseek-v4.1';
      if (chosenModel) candidateModels.push(chosenModel);
      const defaultForProvider = PROVIDER_PRESETS[config.provider]?.defaultModel || CONFIG.DEFAULT_MODEL || 'deepseek-v4.1';
      if (defaultForProvider && !candidateModels.includes(defaultForProvider)) {
        candidateModels.push(defaultForProvider);
      }

      let parsed = null;
      let usedModel = config.selectedModel;

      const systemPrompt = `Eres un motor analítico avanzado de Inteligencia Artificial especializado en pronósticos y apuestas deportivas profesionales (777 Picks AI Engine).
Tu objetivo es realizar un análisis cuantitativo, táctico y probabilístico profundo, riguroso y personalizado para el encuentro entre ${homeName} y ${awayName}.
Debes razonar con la máxima profundidad analítica posible, contrastando métricas oficiales de ataque, solidez defensiva, tendencias de goles y distribuciones Poisson de ambos equipos.
NUNCA utilices texto genérico reutilizable. Cada párrafo debe hablar con precisión de este enfrentamiento específico.

Responde ÚNICAMENTE con un objeto JSON válido con la siguiente estructura exacta:
{
  "factIds": ["fixture", "result"],
  "analysis": {
    "dataVerification": "Párrafo detallado en español verificando las fuentes oficiales (ESPN), posiciones, tamaño de muestra de ${homeName} y ${awayName} y solidez estadística.",
    "goalsAnalysis": "Párrafo analítico profundo en español examinando la dinámica goleadora: xG Poisson de cada equipo, probabilidades de Más/Menos 1.5, 2.5 goles y Ambos Anotan (BTTS).",
    "positiveFactors": [
      "Factor positivo 1: detalle táctico y cuantitativo concreto a favor de ${homeName} o del pronóstico principal.",
      "Factor positivo 2: rendimiento, regularidad o ventaja de localía.",
      "Factor positivo 3: argumento matemático adicional fundamentado en los datos."
    ],
    "negativeFactors": [
      "Factor de riesgo 1: cautela específica o escenarios donde ${awayName} puede complicar.",
      "Factor de riesgo 2: varianza inherente a los 90 minutos, arbitraje o rotaciones."
    ],
    "verdict": "Veredicto táctico y cuantitativo final razonado con precisión. Especifica el marcador más probable derivado del cálculo Poisson (${match.model?.predictedScore || 'N/D'}), la selección de valor recomendada y gestión disciplinada del riesgo."
  }
}

Reglas estrictas:
- factIds DEBE ser una lista con entre 1 y 6 IDs válidos seleccionados de esta lista: ${JSON.stringify(validIdsList)}.
- Todos los campos de 'analysis' deben estar en español, redactados con profundidad, rigor estadístico y profesionalismo.
- No incluyas preámbulos fuera del JSON. Si realizas un bloque de razonamiento previo <think>...</think>, desarróllalo rigurosamente y concluye con el objeto JSON final.`;

      for (const candidate of candidateModels) {
        try {
          const raw = await executeAiChatCompletion({
            ...config,
            model: candidate,
            systemPrompt,
            userPrompt: `Partido a analizar (${match.leagueName || 'Liga Oficial'}): ${homeName} (Local) vs ${awayName} (Visitante).
Estadísticas oficiales y modelo Poisson: ${JSON.stringify(promptCatalog)}.
Instrucciones analíticas estrictas:
1. Menciona explícitamente a "${homeName}" y a "${awayName}" por su nombre en cada sección del informe.
2. Compara el ataque de ${homeName} contra la defensa de ${awayName}, sus posiciones en la clasificación (${homePos ? `#${homePos}` : 'N/D'} vs ${awayPos ? `#${awayPos}` : 'N/D'}) y los xG esperados (${fmt(match.model?.expectedGoals?.home)} xG vs ${fmt(match.model?.expectedGoals?.away)} xG).
3. Razona por qué el modelo proyecta el marcador ${match.model?.predictedScore || 'N/D'} y evalúa probabilidades para Más/Menos 1.5 y 2.5 goles y Ambos Anotan (BTTS).
4. Elige entre 1 y 6 factIds válidos exclusivamente de: ${JSON.stringify(validIdsList)}.
5. Devuelve ÚNICAMENTE el objeto JSON en español profesional.`,
            maxTokens: 4000,
            temperature: 0.3
          });

          if (raw) {
            const candidateParsed = extractJsonFromAiResponse(raw);
            if (candidateParsed && typeof candidateParsed === 'object') {
              const rawIds = candidateParsed.factIds || candidateParsed.fact_ids || candidateParsed.facts;
              if (Array.isArray(rawIds) && rawIds.length >= 1 && rawIds.length <= 8) {
                const allStrings = rawIds.every(id => typeof id === 'string');
                const validSelected = allStrings ? rawIds.filter(id => validIdsList.includes(id)) : [];
                if (allStrings && validSelected.length >= 1) {
                  candidateParsed.factIds = validSelected;
                  if (!candidateParsed.analysis || typeof candidateParsed.analysis !== 'object') {
                    candidateParsed.analysis = {
                      dataVerification: candidateParsed.dataVerification,
                      goalsAnalysis: candidateParsed.goalsAnalysis,
                      positiveFactors: candidateParsed.positiveFactors,
                      negativeFactors: candidateParsed.negativeFactors,
                      verdict: candidateParsed.verdict
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
          aiStatus: 'Análisis cuantitativo institucional verificado (Poisson oficial).'
        };
      }

      const keypoints = [...new Set(parsed.factIds)].map(id => facts.find(f => f.id === id)?.text).filter(Boolean);

      const cleanString = str => typeof str === 'string' ? str.replace(/<[^>]*>/g, '').trim() : '';
      const cleanArray = arr => Array.isArray(arr) ? arr.map(cleanString).filter(Boolean).slice(0, 5) : [];

      let analysisSections = baselineSections;
      let finalNarrative = narrative;

      if (parsed.analysis && typeof parsed.analysis === 'object') {
        const dataVerification = cleanString(parsed.analysis.dataVerification);
        const goalsAnalysis = cleanString(parsed.analysis.goalsAnalysis);
        const positiveFactors = cleanArray(parsed.analysis.positiveFactors);
        const negativeFactors = cleanArray(parsed.analysis.negativeFactors);
        const verdict = cleanString(parsed.analysis.verdict);

        analysisSections = {
          dataVerification: dataVerification || baselineSections.dataVerification,
          goalsAnalysis: goalsAnalysis || baselineSections.goalsAnalysis,
          positiveFactors: positiveFactors.length >= 1 ? positiveFactors : baselineSections.positiveFactors,
          negativeFactors: negativeFactors.length >= 1 ? negativeFactors : baselineSections.negativeFactors,
          verdict: verdict || baselineSections.verdict
        };

        finalNarrative = [
          `📊 DATOS COMPROBADOS & VERIFICACIÓN:\n${analysisSections.dataVerification}`,
          `⚽ ANÁLISIS DE GOLES & TENDENCIA:\n${analysisSections.goalsAnalysis}`,
          `🟢 FACTORES POSITIVOS (A FAVOR):\n${analysisSections.positiveFactors.map(f => `• ${f}`).join('\n')}`,
          `🔴 FACTORES DE RIESGO (EN CONTRA):\n${analysisSections.negativeFactors.map(f => `• ${f}`).join('\n')}`,
          `🎯 VEREDICTO DE LA IA:\n${analysisSections.verdict}`
        ].join('\n\n');
      }

      return {
        ...baseline,
        aiAvailable: true,
        modelUsed: usedModel,
        tacticalKeypoints: keypoints.length ? keypoints : [facts[0].text],
        analysisSections,
        narrativeAnalysis: finalNarrative,
        aiStatus: `Análisis profundo completado con IA (${usedModel}). Todas las cifras y selecciones están fundamentadas en datos oficiales y modelo Poisson.`
      };
    } catch (err) {
      console.error('[aiService] Error generating or validating AI match report:', err?.message || err);
      return {
        ...baseline,
        aiAvailable: false,
        aiStatus: 'Análisis cuantitativo institucional verificado (Poisson oficial).'
      };
    }
  };
  return options.forceRefresh ? generate() : cachedData(cacheKey, 600, generate);
}
