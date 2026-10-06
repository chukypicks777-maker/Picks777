// Explicit real-provider audit: four fresh AI requests, no fixture responses,
// no credential output, and no change to accounts or provider configuration.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { getFootballFeed, enrichMatchWithRealData } from '../server/services/footballDataService.js';
import { getSportsFeed, getSportsMatch } from '../server/services/sportsDataService.js';
import { getEffectiveAiConfig, generateAiMatchReport, extractJsonFromAiResponse } from '../server/services/aiService.js';
import { generateAiSportsReport } from '../server/services/sportsAiService.js';
import { isUpcomingFixture } from '../src/utils/fixtureEligibility.js';

const output = 'artifacts/ai-real-verification-2026-10-06.json';
const nativeFetch = globalThis.fetch, requests = [], results = [];
const keepAlive = setInterval(() => {}, 1000);
const startedAt = new Date().toISOString();
let activeSport = null;
try {
  const config = await getEffectiveAiConfig();
  assert.ok(config.isConfigured, 'El proveedor real de IA debe estar configurado.');
  const providerOrigin = new URL(config.baseUrl).origin;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const aiRequest = new URL(url).origin === providerOrigin && /chat\/completions|generateContent|\/messages(?:$|\?)/.test(url);
    if (!aiRequest) return nativeFetch(input, init);
    const body = JSON.parse(init.body), prompt = body.messages?.find(message => message.role === 'user')?.content || body.contents?.[0]?.parts?.[0]?.text || '';
    const catalogText = prompt.match(/estimaciones estadísticas: (\[[\s\S]*\])\.\s*Prioriza/)?.[1];
    const catalog = catalogText ? JSON.parse(catalogText) : [];
    const observed = { sport: activeSport, requestedAt: new Date().toISOString(), requestedModel: body.model || config.selectedModel,
      catalogSize: catalog.length, catalogIds: catalog.map(fact => fact.id), promptSha256: createHash('sha256').update(prompt).digest('hex') };
    requests.push(observed);
    const start = performance.now();
    const response = await nativeFetch(input, init);
    observed.httpStatus = response.status;
    observed.latencyMs = Math.round(performance.now() - start);
    const raw = await response.clone().text();
    observed.responseSha256 = createHash('sha256').update(raw).digest('hex');
    try {
      const data = JSON.parse(raw);
      const content = data.choices?.[0]?.message?.content || data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || data.content?.find(part => part.type === 'text')?.text;
      const parsed = extractJsonFromAiResponse(content || '');
      observed.responseModel = data.model || null;
      observed.returnedFactIds = parsed?.factIds || parsed?.fact_ids || parsed?.facts || parsed?.analysis?.factIds || parsed?.analysis?.fact_ids || parsed?.analysis?.facts || [];
      observed.usage = data.usage ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens } : null;
    } catch { observed.unparseableResponse = true; }
    return response;
  };

  for (const [sport, leagueId] of [['futbol', null], ['beisbol', 'mlb'], ['tenis', 'wta'], ['basquetbol', 'nba_preseason']]) {
    activeSport = sport;
    const feed = sport === 'futbol' ? await getFootballFeed() : await getSportsFeed(sport, { leagueId, calendarOnly: true });
    const upcoming = feed.matches.filter(match => isUpcomingFixture(match));
    const chosen = sport === 'futbol' ? upcoming.find(match => match.leagueId === 'mls') || upcoming[0]
      : sport === 'tenis' ? upcoming.find(match => /Guo Hanyu/.test(match.homeTeam.name + match.awayTeam.name)) || upcoming[0] : upcoming[0];
    assert.ok(chosen, `${sport}: debe existir un encuentro real próximo.`);
    const detail = sport === 'futbol' ? await enrichMatchWithRealData(chosen) : await getSportsMatch(sport, chosen.id, { leagueId });
    const inputHash = createHash('sha256').update(JSON.stringify(detail)).digest('hex');
    const beforeRequests = requests.length, requestStarted = Date.now();
    const report = await (sport === 'futbol' ? generateAiMatchReport : generateAiSportsReport)(detail, { forceRefresh: true, deadline: Date.now() + 50000 });
    const calls = requests.slice(beforeRequests);
    const confirmed = calls.find(call => call.httpStatus === 200 && Array.isArray(call.returnedFactIds) && call.returnedFactIds.length
      && call.returnedFactIds.every(id => call.catalogIds.includes(id)));
    assert.ok(confirmed, `${sport}: debe observarse una respuesta HTTP nueva del proveedor con hechos válidos.`);
    assert.ok(report.aiAvailable && report.dataGrounded && report.narrativeVerified && report.analysisMode === 'fact-selection', `${sport}: el informe debe confirmar validación de hechos.`);
    assert.equal(report.modelUsed, confirmed.requestedModel, `${sport}: la etiqueta debe identificar el modelo realmente solicitado.`);
    assert.ok(Date.parse(report.analyzedAt) >= requestStarted, `${sport}: la respuesta no puede ser un informe anterior en caché.`);
    assert.ok(report.tacticalKeypoints.length > 0 && report.tacticalKeypoints.every(text => report.facts.includes(text)), `${sport}: no pueden aparecer afirmaciones ajenas a las fuentes.`);
    const probabilities = sport === 'futbol' ? detail.model?.probabilities || detail.probabilities : detail.analysis.winner;
    assert.deepEqual(report.probabilities, probabilities, `${sport}: la IA no debe cambiar porcentajes estadísticos.`);
    assert.equal(createHash('sha256').update(JSON.stringify(detail)).digest('hex'), inputHash, `${sport}: los datos de entrada no pueden ser alterados.`);
    results.push({ sport, id: detail.id, teams: [detail.homeTeam.name, detail.awayTeam.name], sourceUrl: detail.sourceUrl,
      dataFetchedAt: detail.fetchedAt, aiConfirmed: true, modelUsed: report.modelUsed, analyzedAt: report.analyzedAt,
      analysisMode: report.analysisMode, sampleSize: detail.analysis?.sampleSize || null,
      probabilities: report.probabilities, selectedSourceFacts: report.tacticalKeypoints, freshProviderCalls: calls.length });
    console.log(JSON.stringify({ sport, aiConfirmed: true, modelUsed: report.modelUsed, freshProviderCalls: calls.length }));
  }
  await fs.writeFile(output, JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), pass: true,
    configuredProvider: config.provider, configuredModel: config.selectedModel, requests, results,
    limits: 'Actual HTTP replies from the configured provider, not cached AI. AI reviews and prioritizes a catalog of verified facts; probabilities and selections are calculated statistically. This does not verify future predictive accuracy or the provider internal model implementation.' }, null, 2));
  console.log(JSON.stringify({ pass: true, sports: results.length, providerCalls: requests.length, evidence: output }));
} catch (error) {
  await fs.writeFile(output, JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), pass: false, requests, results, error: error.message }, null, 2));
  console.error(error.message);
  process.exitCode = 1;
} finally {
  globalThis.fetch = nativeFetch;
  clearInterval(keepAlive);
}
