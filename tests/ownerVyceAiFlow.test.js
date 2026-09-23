import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';

process.env.MASTER_ADMIN_CODE = 'Test-Owner-VyceAI-Code-12345';
process.env.SESSION_SECRET = 'Test-owner-vyceai-session-secret-32-chars-long';

const { storage } = await import('../server/storage.js');
const { default: app } = await import('../server/index.js');
const { generateAiMatchReport } = await import('../server/services/aiService.js');
const { poissonModel } = await import('../server/services/probabilityModel.js');

test('Owner can save VyceAI API key and deepseek-v4.1 model from settings panel even if AI_DEFAULT_CONFIG is invalid', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'picks-owner-vyceai-'));
  const originalFile = storage.file;
  const originalFetch = globalThis.fetch;
  const previousEnv = {
    AI_DEFAULT_CONFIG: process.env.AI_DEFAULT_CONFIG,
    CUSTOM_AI_API_KEY: process.env.CUSTOM_AI_API_KEY
  };

  storage.file = path.join(dir, 'db.json');
  process.env.AI_DEFAULT_CONFIG = '{corrupted-json-from-vercel';
  delete process.env.CUSTOM_AI_API_KEY;

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;

  let cookie = '';
  const outbound = [];

  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).startsWith(base)) return originalFetch(url, options);
    outbound.push({ url: String(url), options, body: options?.body ? JSON.parse(options.body) : null });
    if (String(url).endsWith('/chat/completions')) {
      const resp = {
        choices: [{
          message: {
            content: JSON.stringify({
              factIds: ['fixture', 'result', 'goals'],
              analysis: {
                dataVerification: 'Verificación oficial ESPN con muestra completa de temporada.',
                goalsAnalysis: 'Dinámica de goles proyectada en Over 2.5 y BTTS.',
                positiveFactors: ['Ventaja de volumen ofensivo', 'Regularidad de localía', 'Poisson superior'],
                negativeFactors: ['Riesgo de transición rival', 'Varianza de 90 minutos'],
                verdict: 'Victoria local con gestión disciplinada de banca.'
              }
            })
          }
        }]
      };
      return new Response(JSON.stringify(resp), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ data: [{ id: 'deepseek-v4.1' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });

  const request = async (endpoint, body) => {
    const response = await fetch(base + endpoint, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { response, data: await response.json() };
  };

  try {
    // 1. Login as Master Admin / Owner
    const login = await request('/api/auth/verify-code', { code: process.env.MASTER_ADMIN_CODE });
    assert.equal(login.data.success, true);
    cookie = login.response.headers.get('set-cookie').split(';')[0];

    // 2. GET /api/settings should NOT fail with 500 error when AI_DEFAULT_CONFIG is broken
    const settingsGet = await request('/api/settings');
    assert.equal(settingsGet.response.status, 200);
    assert.equal(settingsGet.data.success, true);
    assert.equal(settingsGet.data.settings.isConfigured, false);

    // 3. POST /api/settings/update allows saving Owner API key and model
    const saveRes = await request('/api/settings/update', {
      provider: 'custom',
      baseUrl: 'https://vyceai.com/v1',
      apiKey: 'sk-vyceai-owner-test-key-12345',
      selectedModel: 'deepseek-v4.1',
      modelName: 'DeepSeek V4.1 Flash'
    });
    assert.equal(saveRes.response.status, 200);
    assert.equal(saveRes.data.success, true);
    assert.equal(saveRes.data.settings.isConfigured, true);
    assert.equal(saveRes.data.settings.selectedModel, 'deepseek-v4.1');

    // 4. GET /api/settings/active-model returns deepseek-v4.1 as configured
    const activeModelRes = await request('/api/settings/active-model');
    assert.equal(activeModelRes.data.success, true);
    assert.equal(activeModelRes.data.selectedModel, 'deepseek-v4.1');
    assert.equal(activeModelRes.data.isConfigured, true);

    // 5. Match AI report uses the saved deepseek-v4.1 model with maxTokens: 4000 and temperature: 0.3
    const team = { name: 'Real Madrid', gamesPlayed: 20, goalsFor: 45, goalsAgainst: 15 };
    const away = { name: 'Barcelona', gamesPlayed: 20, goalsFor: 44, goalsAgainst: 18 };
    const model = poissonModel(team, away);
    const match = {
      id: 'match-owner-test',
      status: 'SCHEDULED',
      kickoff: new Date(Date.now() + 86400000).toISOString(),
      homeTeam: team,
      awayTeam: away,
      model,
      probabilities: model.probabilities
    };

    const report = await generateAiMatchReport(match, { forceRefresh: true });
    assert.equal(report.aiAvailable, true);
    assert.equal(report.modelUsed, 'deepseek-v4.1');
    assert.ok(report.analysisSections.dataVerification.includes('ESPN'));

    // Verify outbound request sent to VyceAI
    const chatCall = outbound.find(c => c.url.includes('/chat/completions'));
    assert.ok(chatCall, 'Chat completion must be called on VyceAI');
    assert.equal(chatCall.url, 'https://vyceai.com/v1/chat/completions');
    assert.equal(chatCall.body.model, 'deepseek-v4.1');
    assert.equal(chatCall.body.max_tokens, 4000);
    assert.equal(chatCall.body.temperature, 0.3);
    assert.equal(chatCall.options.headers.Authorization, 'Bearer sk-vyceai-owner-test-key-12345');

    // 6. Owner can quickly switch model or key from settings panel
    const switchRes = await request('/api/settings/update', {
      provider: 'custom',
      baseUrl: 'https://vyceai.com/v1',
      apiKey: 'sk-vyceai-owner-new-key-67890',
      selectedModel: 'deepseek-chat',
      modelName: 'DeepSeek Chat V3'
    });
    assert.equal(switchRes.data.success, true);
    assert.equal(switchRes.data.settings.selectedModel, 'deepseek-chat');

    const newActiveModel = await request('/api/settings/active-model');
    assert.equal(newActiveModel.data.selectedModel, 'deepseek-chat');
  } finally {
    await new Promise(resolve => server.close(resolve));
    storage.file = originalFile;
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test('extractJsonFromAiResponse cleanly parses DeepSeek reasoning blocks, markdown fences and unescaped newlines', async () => {
  const { extractJsonFromAiResponse } = await import('../server/services/aiService.js');

  // 1. DeepSeek response with <think>...</think> block and markdown ```json
  const rawWithThink = `<think>
Analizando las probabilidades Poisson del encuentro.
El equipo local tiene 52.4% de victoria y Over 2.5 en 58%.
Conclusión clara: seleccionar fixture, result y goals.
</think>
\`\`\`json
{
  "factIds": ["fixture", "result", "goals"],
  "analysis": {
    "dataVerification": "Datos confirmados con ESPN y muestra de 20 jornadas.",
    "goalsAnalysis": "Se prevé dinámica alta de goles con Over 2.5 superando 55%.",
    "positiveFactors": ["Gran regularidad ofensiva", "Ventaja de campo"],
    "negativeFactors": ["Varianza estadística"],
    "verdict": "Victoria del local"
  }
}
\`\`\``;

  const parsed1 = extractJsonFromAiResponse(rawWithThink);
  assert.ok(parsed1, 'Must parse DeepSeek <think> output');
  assert.deepEqual(parsed1.factIds, ['fixture', 'result', 'goals']);
  assert.equal(parsed1.analysis.verdict, 'Victoria del local');

  // 2. Response with unclosed <think> tag cut off or without closing tag
  const rawUnclosedThink = `<think>
Razonando variables y factores climáticos...
{
  "factIds": ["fixture", "goals"],
  "analysis": {
    "dataVerification": "Oficial ESPN",
    "goalsAnalysis": "Under 2.5 esperado",
    "positiveFactors": ["Defensa sólida"],
    "negativeFactors": ["Bajo ritmo"],
    "verdict": "Menos de 2.5 goles"
  }
}`;

  const parsed2 = extractJsonFromAiResponse(rawUnclosedThink);
  assert.ok(parsed2, 'Must parse unclosed <think> output');
  assert.deepEqual(parsed2.factIds, ['fixture', 'goals']);

  // 3. Response with unescaped literal newlines in analysis text and trailing comma
  const rawWithNewlines = `{
  "factIds": ["fixture"],
  "analysis": {
    "dataVerification": "Línea 1 verificada.
Línea 2 de notas adicionales.",
    "goalsAnalysis": "Proyección normal.",
    "positiveFactors": ["Factor A",],
    "negativeFactors": ["Factor B"],
    "verdict": "Recomendación prudente",
  }
}`;

  const parsed3 = extractJsonFromAiResponse(rawWithNewlines);
  assert.ok(parsed3, 'Must parse raw newlines and trailing commas');
  assert.deepEqual(parsed3.factIds, ['fixture']);
  assert.ok(parsed3.analysis.dataVerification.includes('Línea 1'));
});
