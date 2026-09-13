import { createHash } from 'node:crypto';
import { CONFIG } from '../config.js';
import { cachedData, fetchJson } from './dataCache.js';

export async function availableModels() {
  return cachedData('openrouter:models', 3600, async () => {
    try {
      const data = await fetchJson(`${CONFIG.OPENROUTER_BASE_URL}/models`);
      if (!Array.isArray(data?.data)) return [];
      return data.data.map(m => ({ id: m.id, name: m.name }));
    } catch {
      return [];
    }
  });
}

const FALLBACK_MODELS = [
  'liquid/lfm-2.5-2.6b:free',
  'openrouter/free',
  'nex-agi/nex-n2.5-mini:free',
  'inclusionai/ling-3.0-flash-vl:free',
  'z-ai/glm-5.2:free'
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

  if (!CONFIG.OPENROUTER_API_KEY) {
    return {
      ...baseline,
      aiStatus: 'OPENROUTER_API_KEY no configurada. Se muestran únicamente datos y cálculos estadísticos.'
    };
  }

  const candidateModels = [
    CONFIG.DEFAULT_MODEL,
    ...FALLBACK_MODELS.filter(m => m !== CONFIG.DEFAULT_MODEL)
  ];

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

  const fingerprint = createHash('sha256').update(JSON.stringify({ id: match.id, facts, force: options.forceRefresh ? Date.now() : 0 })).digest('hex');
  const cacheKey = `ai:${fingerprint}`;

  return cachedData(cacheKey, 600, async () => {
    for (const model of candidateModels) {
      try {
        const response = await fetch(`${CONFIG.OPENROUTER_BASE_URL}/chat/completions`, {
          method: 'POST',
          signal: AbortSignal.timeout(9000),
          headers: {
            Authorization: `Bearer ${CONFIG.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://deportepicks.vip',
            'X-Title': CONFIG.APP_NAME
          },
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

        if (!response.ok) continue;
        const data = await response.json();
        const rawContent = data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning || '';
        let jsonString = rawContent;
        const fenceMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (fenceMatch) {
          jsonString = fenceMatch[1];
        } else {
          const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
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
          modelUsed: data.model || model,
          aiAvailable: true,
          aiStatus: `Informe generado por IA (${data.model || model}) en tiempo real.`,
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
        // Continue to next candidate model in cascade
      }
    }

    return {
      ...baseline,
      aiStatus: 'Informe estadístico cuantitativo (Poisson y métricas de temporada). Motor de IA en respaldo temporal.',
      narrativeAnalysis: facts.join('\n\n')
    };
  });
}
