import { createHash } from 'node:crypto';
import { validateAiConfig } from '../security.js';
import { PROVIDER_PRESETS } from '../../src/constants/aiProviders.js';
import { CONFIG } from '../config.js';
import { storage } from '../storage.js';
import { cachedData, redisConfigured } from './dataCache.js';
import { getTop3Opportunities } from '../../src/utils/mathProbabilities.js';

import { fetchProviderModels, executeAiChatCompletion } from './aiProviderClient.js';
export { fetchProviderModels, executeAiChatCompletion, testAiConnection } from './aiProviderClient.js';

export async function getEffectiveAiConfig() {
  let dbConfig = await storage.getAiConfig();
  if (process.env.AI_DEFAULT_CONFIG && ((!redisConfigured() && process.env.VERCEL) || !dbConfig?.apiKey)) {
    try {
      dbConfig = validateAiConfig(JSON.parse(process.env.AI_DEFAULT_CONFIG));
    } catch {
      throw new Error('La configuración privada predeterminada de IA no es válida.');
    }
  }
  const provider = String(dbConfig?.provider || 'openrouter').trim().toLowerCase();
  const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.openrouter;
  const envKey = provider === 'openrouter' ? CONFIG.OPENROUTER_API_KEY : provider === 'gemini' ? process.env.GEMINI_API_KEY : '';
  const apiKey = String(dbConfig?.apiKey ?? envKey ?? '').trim();
  const baseUrl = String(dbConfig?.baseUrl || preset.defaultBaseUrl).trim();
  const selectedModel = String(dbConfig?.selectedModel ?? (provider === 'openrouter' ? CONFIG.DEFAULT_MODEL || preset.defaultModel : preset.defaultModel)).trim();

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
      const isAgentRouter = config.provider === 'agentrouter' || (config.baseUrl && config.baseUrl.includes('agentrouter.org'));
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
