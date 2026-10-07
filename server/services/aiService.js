import { createHash, randomUUID } from 'node:crypto';
import { validateAiConfig } from '../security.js';
import { PROVIDER_PRESETS } from '../../src/constants/aiProviders.js';
import { CONFIG } from '../config.js';
import { storage } from '../storage.js';
import { cachedData, readCachedData, redisConfigured, redisCommand } from './dataCache.js';
import { getTop3Opportunities } from '../../src/utils/mathProbabilities.js';
import { applyFootballForecast } from './probabilityModel.js';
import { footballProbabilityLabel } from '../../src/utils/marketProbability.js';

import { fetchProviderModels, executeAiChatCompletion } from './aiProviderClient.js';
export { fetchProviderModels, executeAiChatCompletion, testAiConnection } from './aiProviderClient.js';

// Every page load and report asks for the active provider. A short in-memory
// copy avoids one storage round trip per request; saving settings clears it.
let configMemo = null;
export async function getEffectiveAiConfig() {
  // Only a remote store costs a round trip; local storage is read directly.
  if (!redisConfigured()) return computeEffectiveAiConfig();
  if (configMemo && configMemo.expires > Date.now()) return { ...configMemo.value };
  const value = await computeEffectiveAiConfig();
  configMemo = { value, expires: Date.now() + 30000 };
  return { ...value };
}
export function forgetAiConfig() { configMemo = null; }

async function computeEffectiveAiConfig() {
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

const fmt = n => Number.isFinite(n) ? Number(n.toFixed(1)) : 'N/D';
const lineText = (lines, values) => values.map(([label, key]) => `${label} ${fmt(lines?.[`over${key}`])}%`).join(', ');

// Facts and statistical baseline of one football fixture. They are recomputed
// from current provider data on every request; a cached AI selection only says
// which facts to put first.
export function footballReportInputs(input) {
  const match = applyFootballForecast({ ...input });
  const p = match.model?.probabilities || match.probabilities || {};
  const homePos = match.homeTeam?.position ?? match.homeTeam?.rank;
  const awayPos = match.awayTeam?.position ?? match.awayTeam?.rank;
  const homePoints = match.homeTeam?.points != null ? `${match.homeTeam.points} pts` : '';
  const awayPoints = match.awayTeam?.points != null ? `${match.awayTeam.points} pts` : '';
  const homeName = match.homeTeam?.name || 'Local';
  const awayName = match.awayTeam?.name || 'Visitante';
  const picks = getTop3Opportunities(match);
  const model = match.model;

  const facts = [
    { id: 'fixture', text: `${homeName} vs ${awayName}. Torneo: ${match.leagueName || 'Oficial'}. Estado: ${match.status}. Inicio: ${match.kickoff}.` },
    { id: 'source', text: `Fuente de los registros: ${match.source || 'ESPN'}. Consulta: ${match.fetchedAt || 'N/D'}.` }
  ];
  if (match.status === 'LIVE') {
    facts.push({ id: 'liveState', text: `Marcador en directo: ${homeName} ${match.liveScore?.home ?? 'N/D'} - ${match.liveScore?.away ?? 'N/D'} ${awayName}. Minuto: ${match.liveMinute || match.minute || 'En juego'}.` });
  }
  for (const [side, team, pos, pts] of [['home', match.homeTeam, homePos, homePoints], ['away', match.awayTeam, awayPos, awayPoints]]) {
    const tName = team?.name || (side === 'home' ? homeName : awayName);
    const gpInfo = Number.isFinite(team?.gamesPlayed) ? `${team.gamesPlayed} PJ` : 'En disputa';
    const extra = [pos ? `Posición #${pos}` : '', pts ? `(${pts})` : '', team?.cleanSheetRate != null ? `valla invicta ${team.cleanSheetRate}%` : '',
      team?.avgCorners != null ? `${team.avgCorners} córners/p` : '', team?.avgYellowCards != null ? `${team.avgYellowCards} amarillas/p` : '',
      team?.avgShotsOnTarget != null ? `${team.avgShotsOnTarget} tiros a puerta/p` : ''].filter(Boolean).join(', ');
    facts.push({ id: side, text: `${tName} (${side === 'home' ? 'Local' : 'Visitante'}): ${gpInfo}, ${team?.goalsFor ?? 'N/D'} GF, ${team?.goalsAgainst ?? 'N/D'} GC. ${extra ? `Registros: ${extra}.` : ''}` });
  }
  if ([p.homeWin, p.draw, p.awayWin].every(Number.isFinite)) {
    facts.push({ id: 'result', text: `${footballProbabilityLabel(match)}: ${homeName} ${fmt(p.homeWin)}%, Empate ${fmt(p.draw)}%, ${awayName} ${fmt(p.awayWin)}%. Referencia previa al partido, sin garantía.` });
  }
  if (model) {
    const ratings = Boolean(model.engine);
    if (Number.isFinite(model.expectedGoals?.home) && Number.isFinite(model.expectedGoals?.away)) facts.push({ id: 'expectedGoals', text: ratings
      ? `Goles esperados (ratings de la liga ajustados por rival${model.totalSource === 'published-odds' ? ' y cuotas de goles' : model.probabilitySources?.homeWin === 'published-odds' ? ' y cuota 1X2' : ''}; distribución Poisson con corrección Dixon-Coles): ${homeName} ${fmt(model.expectedGoals.home)} vs ${awayName} ${fmt(model.expectedGoals.away)}. No es xG de tiros observados.`
      : `Media de goles Poisson (no xG observado): ${homeName} ${fmt(model.expectedGoals.home)} goles vs ${awayName} ${fmt(model.expectedGoals.away)} goles.` });
    facts.push({ id: 'goals', text: `Goles totales: Más de 1.5 ${fmt(p.over15)}%, Menos de 1.5 ${fmt(p.under15)}% (${footballProbabilityLabel(match, 'over15')}); Más de 2.5 ${fmt(p.over25)}%, Menos de 2.5 ${fmt(p.under25)}% (${footballProbabilityLabel(match, 'over25')}); Más de 3.5 ${fmt(p.over35)}%, Menos de 3.5 ${fmt(p.under35)}%. Ambos anotan: Sí ${fmt(p.bttsYes)}%, No ${fmt(p.bttsNo)}% (${footballProbabilityLabel(match, 'bttsYes')}).` });
    if (model.predictedScore) facts.push({ id: 'score', text: `Marcador individual más probable: ${model.predictedScore} (${fmt(model.scoreDistribution?.[0]?.probability)}%). Es solo el escenario más frecuente de la distribución, no un resultado esperado.` });
    if (model.homeGoals && model.awayGoals) facts.push({ id: 'teamGoals', text: `Goles por equipo: ${homeName} marca al menos 1 ${fmt(model.homeGoals.over05)}%, 2 o más ${fmt(model.homeGoals.over15)}%; ${awayName} marca al menos 1 ${fmt(model.awayGoals.over05)}%, 2 o más ${fmt(model.awayGoals.over15)}%.` });
    if (model.corners) facts.push({ id: 'corners', text: `Córners esperados (ratings de la liga, binomial negativa): ${homeName} ${fmt(model.corners.expected.home)}, ${awayName} ${fmt(model.corners.expected.away)}, total ${fmt(model.corners.expected.total)}. ${lineText(model.corners.total, [['Más de 8.5', '85'], ['Más de 9.5', '95'], ['Más de 10.5', '105']])}.` });
    if (model.cards) facts.push({ id: 'cards', text: `Tarjetas amarillas esperadas: total ${fmt(model.cards.expected.total)} (${homeName} ${fmt(model.cards.expected.home)}, ${awayName} ${fmt(model.cards.expected.away)}). ${lineText(model.cards.total, [['Más de 3.5', '35'], ['Más de 4.5', '45']])}. No incorpora al árbitro.` });
    if (match.halfGoals?.first && match.halfGoals?.second) facts.push({ id: 'halves', text: `Goles por mitad: 1ª ${fmt(match.halfGoals.first.expectedGoals)} esperados (al menos un gol ${fmt(match.halfGoals.first.over05)}%), 2ª ${fmt(match.halfGoals.second.expectedGoals)} (al menos un gol ${fmt(match.halfGoals.second.over05)}%).` });
    if (ratings && model.statisticalProbabilities && model.probabilitySources?.homeWin === 'published-odds') {
      const s = model.statisticalProbabilities;
      facts.push({ id: 'modelVsMarket', text: `Contraste sin cuotas (solo resultados previos): ${homeName} ${fmt(s.homeWin)}%, Empate ${fmt(s.draw)}%, ${awayName} ${fmt(s.awayWin)}%; mercado sin margen: ${fmt(p.homeWin)}% / ${fmt(p.draw)}% / ${fmt(p.awayWin)}%. Una diferencia no es una apuesta de valor garantizada.` });
    }
    if (match.goalMarketsConflict) facts.push({ id: 'modelConflict', text: model.limitations });
    facts.push({ id: 'sample', text: ratings
      ? `Muestra del modelo: ${model.sampleSize?.home ?? 'N/D'} partidos (local) y ${model.sampleSize?.away ?? 'N/D'} partidos (visitante) en el historial de la liga, con más peso a los recientes.`
      : `Muestra de temporada: ${model.sampleSize?.home ?? 'N/D'} partidos (local) y ${model.sampleSize?.away ?? 'N/D'} partidos (visitante).` });
  } else facts.push({ id: 'missing', text: 'Sin muestra suficiente para un pronóstico estadístico previo al partido.' });

  if (Array.isArray(match.h2h) && match.h2h.length > 0) {
    facts.push({ id: 'h2h', text: `Historial directo H2H (${match.h2h.length} partidos oficiales recientes): ${match.h2h.slice(0, 5).map(h => `${h.home} ${h.score || 'vs'} ${h.away}`).join('; ')}.` });
  }
  if (Number.isFinite(homePos) || Number.isFinite(awayPos)) {
    facts.push({ id: 'standings', text: `Clasificación oficial en ${match.leagueName || 'liga'}: ${homeName} (Puesto #${homePos ?? 'N/D'}, ${homePoints || 'N/D'}) vs ${awayName} (Puesto #${awayPos ?? 'N/D'}, ${awayPoints || 'N/D'}).` });
  }
  if (match.homeTeam?.form?.length || match.awayTeam?.form?.length) {
    facts.push({ id: 'form', text: `Racha de los últimos 5 partidos: ${homeName} [${(match.homeTeam.form || []).join('-') || 'N/D'}] vs ${awayName} [${(match.awayTeam.form || []).join('-') || 'N/D'}].` });
  }
  if (match.odds) {
    const oddsParts = [];
    if (match.odds.homeWin) oddsParts.push(`Gana ${homeName} @${match.odds.homeWin}`);
    if (match.odds.draw) oddsParts.push(`Empate @${match.odds.draw}`);
    if (match.odds.awayWin) oddsParts.push(`Gana ${awayName} @${match.odds.awayWin}`);
    if (match.odds.over25) oddsParts.push(`Más de 2.5 goles @${match.odds.over25}`);
    if (match.odds.under25) oddsParts.push(`Menos de 2.5 goles @${match.odds.under25}`);
    if (match.odds.bttsYes) oddsParts.push(`Ambos Anotan Sí @${match.odds.bttsYes}`);
    if (oddsParts.length) facts.push({ id: 'odds', text: `Cuotas publicadas: ${oddsParts.join(', ')}. Proveedor: ${match.oddsProvider || 'No identificado'}. Consulta: ${match.oddsFetchedAt || 'N/D'}; confirmar vigencia en la casa.` });
  }
  for (const group of Array.isArray(match.recentMatches) ? match.recentMatches : []) {
    const isHome = String(group.teamId) === String(match.homeTeamId) || group.team === homeName;
    const recList = (group.events || []).slice(0, 5).map(e => `${e.opponent || 'Rival'} (${e.score || 'vs'}, res: ${e.result || 'P'})`).join('; ');
    if (recList) facts.push({ id: `recent_${isHome ? 'home' : 'away'}`, text: `Últimos partidos oficiales de ${isHome ? homeName : awayName}: ${recList}.` });
  }

  const fact = id => facts.find(item => item.id === id)?.text || '';
  const baseline = { generatedAt: new Date().toISOString(), modelUsed: null, aiAvailable: false,
    source: match.source, sourceUrl: match.sourceUrl, dataFetchedAt: match.fetchedAt,
    probabilities: p, predictedScore: model?.predictedScore ?? match.probabilities?.predictedScore ?? null,
    topPick: picks[0] ?? null, safePick: picks[1] ?? null, secondaryPick: picks[2] ?? null, valueBet: null,
    facts: facts.map(f => f.text),
    analysisSections: {
      dataVerification: [fact('source'), fact('home'), fact('away'), fact('sample')].filter(Boolean).join(' '),
      goalsAnalysis: model ? [fact('expectedGoals'), fact('goals'), fact('corners'), fact('cards')].filter(Boolean).join(' ') : 'Sin muestra suficiente para el modelo estadístico. Los mercados disponibles pueden proceder de cuotas.',
      positiveFactors: [fact('result'), ...picks.slice(0, 2).map(pick => pick.selection + ': ' + fmt(pick.probability) + '% de probabilidad estimada.')].filter(Boolean),
      negativeFactors: ['Las probabilidades son estimaciones; la validación retrospectiva no garantiza el resultado de un partido concreto.',
        match.status === 'SCHEDULED' ? 'El modelo no incorpora alineaciones, lesiones, sanciones ni noticias verificadas.' : 'Proyección informativa: no es un modelo en vivo ni un pronóstico archivado antes del partido.'],
      verdict: [fact('score'), picks[0] ? 'Selección del modelo: ' + picks[0].selection + ' (' + fmt(picks[0].probability) + '%).' : 'Sin datos suficientes para una selección.'].filter(Boolean).join(' ')
    },
    narrativeAnalysis: facts.map(f => f.text).join('\n\n'),
    aiStatus: 'Informe calculado con registros del proveedor; sin texto predictivo no verificado.',
    limitations: 'Estimaciones sujetas al tamaño de muestra y a errores del proveedor; no garantizan resultados.' };
  return { match, facts, baseline };
}

export async function generateAiMatchReport(match, options = {}) {
  const inputs = footballReportInputs(match);
  return generateGroundedAiReport(inputs.match, inputs.facts, inputs.baseline, options);
}

// Read-only: returns a report only when an AI selection already exists.
export async function readAiMatchReport(match) {
  const inputs = footballReportInputs(match);
  return readGroundedAiReport(inputs.match, inputs.facts, inputs.baseline);
}

async function resolveAiConfig(options = {}) {
  let config;
  try { config = await getEffectiveAiConfig(); }
  catch { config = { provider: 'custom', apiKey: '', baseUrl: 'https://vyceai.com/v1', selectedModel: 'deepseek-v4.1', modelName: 'DeepSeek V4.1 Flash', isConfigured: false, updatedAt: null }; }
  // The Owner's saved configuration wins; a browser override applies only when
  // the server has no active key (the route accepts it from the Owner only).
  if (!config.isConfigured && options.aiConfig && typeof options.aiConfig === 'object') {
    try {
      const validated = validateAiConfig(options.aiConfig);
      if (validated.apiKey && validated.apiKey.length >= 4) config = { ...config, ...validated, isConfigured: true, updatedAt: options.aiConfig.updatedAt || 'client_override' };
    } catch {}
  }
  if (typeof options.model === 'string' && options.model.trim()) config.selectedModel = options.model.trim();
  if (!config.selectedModel) config.selectedModel = PROVIDER_PRESETS[config.provider]?.defaultModel || 'deepseek-v4.1';
  if (config.provider === 'gemini' && !config.selectedModel.startsWith('gemini')) config.selectedModel = PROVIDER_PRESETS.gemini?.defaultModel || 'gemini-2.5-flash';
  if (config.provider === 'groq' && config.selectedModel.startsWith('deepseek-v4')) config.selectedModel = PROVIDER_PRESETS.groq?.defaultModel || 'llama-3.3-70b-versatile';
  return config;
}

export async function isAiConfigured() {
  return (await resolveAiConfig()).isConfigured;
}

// The AI chooses which catalogue facts lead the report; their numbers are always
// rendered from current data. Poll times, prices and probabilities do not change
// that choice, so they stay out of the key and one selection serves every member.
export function aiSelectionKey(match, config) {
  return 'ai:selection:v1:' + createHash('sha256').update(JSON.stringify([match.sport || 'futbol', match.id, match.status,
    config.provider, config.selectedModel, config.updatedAt])).digest('hex');
}

function assembleReport(baseline, facts, selection) {
  if (selection?.aiAvailable === false) return { ...baseline, aiAvailable: false, aiStatus: selection.aiStatus || 'Informe estadístico; la IA no devolvió una respuesta verificable.' };
  const keypoints = [...new Set(selection?.factIds || [])].map(id => facts.find(f => f.id === id)?.text).filter(Boolean);
  if (!keypoints.length) return null;
  return { ...baseline, generatedAt: selection.generatedAt || baseline.generatedAt, aiAvailable: true, modelUsed: selection.modelUsed,
    analyzedAt: selection.generatedAt, isDeepAnalysis: false, dataGrounded: true, analysisMode: 'fact-selection', narrativeVerified: true,
    verifiedStatsCount: facts.length, tacticalKeypoints: keypoints,
    narrativeAnalysis: keypoints.join('\n\n') + '\n\n' + (baseline.narrativeAnalysis || ''),
    aiStatus: `Hechos priorizados por IA (${selection.modelUsed}); cifras del mercado sin margen o del modelo estadístico, según la fuente indicada. La IA no recalcula probabilidades.` };
}

export async function readGroundedAiReport(match, facts, baseline) {
  const config = await resolveAiConfig();
  if (!config.isConfigured) return null;
  const selection = await readCachedData(aiSelectionKey(match, config));
  if (!selection || selection.aiAvailable === false) return null;
  return assembleReport(baseline, facts, selection);
}

// One provider call per fixture across all instances: the first request takes a
// short Redis lease; concurrent requests wait for its stored selection.
async function acquireLease(key) {
  if (!redisConfigured()) return { acquired: true, release: async () => {} };
  const lease = `picks:v2:lock:${createHash('sha256').update(key).digest('hex').slice(0, 32)}`, token = randomUUID();
  try {
    const result = await redisCommand('SET', lease, token, 'NX', 'EX', 60);
    if (result !== 'OK') return { acquired: false };
  } catch { return { acquired: true, release: async () => {} }; }
  return { acquired: true, release: async () => {
    try { await redisCommand('EVAL', "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0", 1, lease, token); } catch {}
  } };
}

async function selectFacts(match, facts, config, deadline) {
  const homeName = match.homeTeam?.name || 'Local', awayName = match.awayTeam?.name || 'Visitante';
  const promptCatalog = facts.map(f => ({ id: f.id, summary: f.text }));
  const validIdsList = facts.map(f => f.id);
  const candidateModels = [];
  let chosenModel = config.selectedModel;
  if (chosenModel && chosenModel.includes('openrouter')) chosenModel = 'deepseek-v4.1';
  if (chosenModel) candidateModels.push(chosenModel);
  const defaultForProvider = PROVIDER_PRESETS[config.provider]?.defaultModel || CONFIG.DEFAULT_MODEL || 'deepseek-v4.1';
  if (defaultForProvider && !candidateModels.includes(defaultForProvider)) candidateModels.push(defaultForProvider);
  const providerFallbacks = { gemini: ['gemini-3.5-flash-lite', 'gemini-flash-latest', 'gemini-3.1-pro-preview'], custom: ['deepseek-chat', 'deepseek-v4-flash'],
    agentrouter: ['deepseek-chat'], deepseek: ['deepseek-reasoner'], groq: ['llama-3.1-8b-instant'] }[config.provider] || [];
  for (const fallback of providerFallbacks) if (!candidateModels.includes(fallback)) candidateModels.push(fallback);
  const systemPrompt = 'Selecciona y ordena los hechos más relevantes del catálogo para explicar el partido, el pick del modelo y sus incertidumbres. Devuelve solo JSON: {"factIds":["id"]}, con 1 a 6 IDs presentes en el catálogo. No generes cifras, selecciones, tácticas, lesiones, cuotas ni texto libre. Las probabilidades no son tasas históricas de aciertos.';
  const userPrompt = `Partido a analizar (${match.leagueName || 'Liga Oficial'}): ${homeName} (Local) vs ${awayName} (Visitante).
Registros del proveedor y estimaciones estadísticas: ${JSON.stringify(promptCatalog)}.
Prioriza entre 1 y 6 hechos del catálogo, incluyendo incertidumbres y falta de datos cuando existan.
Devuelve exclusivamente {"factIds":["id"]} con IDs válidos de ${JSON.stringify(validIdsList)}.
No escribas análisis libre, no calcules probabilidades ni selecciones y no agregues hechos.`;
  const idsOf = parsed => parsed?.factIds ?? parsed?.fact_ids ?? parsed?.facts ?? parsed?.analysis?.factIds ?? parsed?.analysis?.fact_ids ?? parsed?.analysis?.facts;
  for (const candidate of candidateModels) {
    const remaining = deadline - Date.now();
    if (remaining < 1000) break;
    try {
      const requestOptions = { ...config, model: candidate, systemPrompt, userPrompt, maxTokens: 4000, temperature: 0.3, timeoutMs: Math.min(20000, remaining) };
      let raw = await executeAiChatCompletion(requestOptions);
      let parsed = raw ? extractJsonFromAiResponse(raw) : null;
      const initialIds = idsOf(parsed);
      // A provider sometimes copies the whole catalog. Ask it to choose a bounded
      // selection again; never truncate that copy and call it AI.
      if (Array.isArray(initialIds) && initialIds.length > 6 && initialIds.length <= facts.length
        && initialIds.every(id => typeof id === 'string' && validIdsList.includes(id.trim())) && deadline - Date.now() >= 1000) {
        raw = await executeAiChatCompletion({ ...requestOptions,
          userPrompt: `${userPrompt}\n\nCorrección estricta: la respuesta anterior incluyó demasiados IDs. Vuelve a revisar el encuentro y escoge EXACTAMENTE ${Math.min(4, facts.length)} IDs distintos de los hechos más relevantes, incluyendo incertidumbres. No copies el catálogo completo. Devuelve solo JSON con la propiedad factIds y esa selección.`,
          timeoutMs: Math.min(20000, deadline - Date.now()) });
        parsed = extractJsonFromAiResponse(raw);
      }
      let rawIds = idsOf(parsed);
      if (typeof rawIds === 'string') rawIds = rawIds.split(',').map(s => s.trim()).filter(Boolean);
      if (Array.isArray(rawIds) && rawIds.length >= 1 && rawIds.length <= 12 && rawIds.every(id => typeof id === 'string')) {
        const valid = rawIds.map(s => s.trim()).filter(id => validIdsList.includes(id));
        if (valid.length >= 1 && valid.length <= 6 && valid.length === rawIds.length) return { factIds: [...new Set(valid)], modelUsed: candidate };
      }
      console.warn(`[aiService] Candidate model ${candidate} returned an invalid fact selection. Trying next candidate...`);
    } catch (err) {
      console.warn(`[aiService] Candidate model ${candidate} failed: ${err.message}. Trying next candidate...`);
    }
  }
  return null;
}

// All sports share the provider configuration and fact-only validation.
export async function generateGroundedAiReport(match, facts, baseline, options = {}) {
  const deadline = options.deadline ?? Date.now() + 45000;
  const config = await resolveAiConfig(options);
  if (!config.isConfigured) return baseline;
  const key = aiSelectionKey(match, config);
  if (!options.forceRefresh) {
    const cached = await readCachedData(key);
    if (cached) return assembleReport(baseline, facts, cached) || baseline;
  }
  const lease = await acquireLease(key);
  if (!lease.acquired) {
    // Another instance is asking the provider for this fixture: wait for it.
    const waitUntil = Math.min(deadline - 1000, Date.now() + 25000);
    while (Date.now() < waitUntil) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const stored = await readCachedData(key, { fresh: true });
      if (stored) return assembleReport(baseline, facts, stored) || baseline;
    }
    return { ...baseline, aiPending: true, aiStatus: 'La IA está procesando este partido en otra solicitud; el informe estadístico ya está disponible.' };
  }
  try {
    // Selections live until the fixture changes state; failures retry after a minute.
    const ttlSeconds = match.status === 'LIVE' ? 1800 : 21600;
    const selection = await cachedData(key, ttlSeconds, async () => {
      try {
        const chosen = await selectFacts(match, facts, config, deadline);
        return chosen ? { ...chosen, generatedAt: new Date().toISOString() }
          : { aiAvailable: false, aiStatus: 'Informe estadístico; la IA no devolvió una respuesta verificable.', generatedAt: new Date().toISOString() };
      } catch (err) {
        console.error('[aiService] Error generating AI fact selection:', err?.message || err);
        return { aiAvailable: false, aiStatus: 'Informe estadístico; proveedor de IA no disponible.', generatedAt: new Date().toISOString() };
      }
    }, { forceRefresh: Boolean(options.forceRefresh), persist: true });
    return assembleReport(baseline, facts, selection) || baseline;
  } finally { await lease.release(); }
}
