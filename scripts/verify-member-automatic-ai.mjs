// Real provider verification through authenticated member HTTP requests.
// The member and storage are temporary; production accounts are never changed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { getEffectiveAiConfig } from '../server/services/aiService.js';
import { storage } from '../server/storage.js';
import { setSession } from '../server/session.js';
import { isUpcomingFixture } from '../src/utils/fixtureEligibility.js';
import app from '../server/index.js';

const config = await getEffectiveAiConfig();
assert.ok(config.isConfigured, 'A real AI provider must be configured.');
for (const key of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']) process.env[key] = '';
process.env.VERCEL = '';
process.env.NODE_ENV = 'development';
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'picks-member-ai-audit-'));
const originalFile = storage.file, nativeFetch = globalThis.fetch, requests = [], checks = [];
const startedAt = new Date().toISOString();
storage.file = path.join(directory, 'access.json');
let server, activeSport;
try {
  await storage.updateAiConfig(config);
  const user = await storage.upsertGoogleUser({ googleId: randomUUID(), email: 'isolated-member-audit@example.invalid', name: 'Temporary local audit member' });
  let cookie;
  setSession({ cookie: (name, value) => { cookie = `${name}=${value}`; } }, { role: 'trial_user', userId: user.id, expires: Date.now() + 3600000 });
  const providerOrigin = new URL(config.baseUrl).origin;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (new URL(url).origin !== providerOrigin || !/chat\/completions|generateContent|\/messages/.test(url)) return nativeFetch(input, init);
    const started = Date.now(), response = await nativeFetch(input, init);
    requests.push({ sport: activeSport, httpStatus: response.status, latencyMs: Date.now() - started, requestedAt: new Date(started).toISOString() });
    return response;
  };
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const read = async (pathname, body) => {
    const response = await fetch(base + pathname, { method: body ? 'POST' : 'GET', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000) });
    const data = await response.json(); return { status: response.status, data };
  };
  for (const [sport, feedPath] of [['futbol', '/api/matches'], ['beisbol', '/api/sports/beisbol?league=mlb'], ['tenis', '/api/sports/tenis?league=atp'], ['basquetbol', '/api/sports/basquetbol?league=nba_preseason']]) {
    activeSport = sport;
    const feed = await read(feedPath); assert.equal(feed.status, 200);
    const match = feed.data.matches.find(match => isUpcomingFixture(match));
    assert.ok(match, `${sport} must have a real upcoming match.`);
    const route = sport === 'futbol' ? `/api/matches/${encodeURIComponent(match.id)}/ai-analysis` : `/api/sports/${sport}/${encodeURIComponent(match.id)}/ai-analysis?league=${match.leagueId}`;
    for (const body of [{ forceRefresh: true }, { model: 'not-permitted-member-override' }]) assert.equal((await read(route, body)).status, 403);
    const before = requests.length, result = await read(route, {});
    assert.equal(result.status, 200); assert.equal(result.data.success, true);
    const report = result.data.report;
    assert.equal(report.aiAvailable, true); assert.equal(report.dataGrounded, true); assert.equal(report.analysisMode, 'fact-selection');
    assert.ok(requests.length > before, 'This must include a fresh real AI HTTP request, not a fixture or cached claim.');
    const expected = sport === 'futbol' ? result.data.match.probabilities || result.data.match.model?.probabilities : result.data.match.analysis.winner;
    assert.deepEqual(report.probabilities, expected, 'The language model cannot invent percentages.');
    const requestCount = requests.length, shared = await read(route, {});
    assert.equal(shared.data.report.aiAvailable, true); assert.equal(requests.length, requestCount, 'A second ordinary request must reuse the verified report.');
    checks.push({ sport, id: match.id, teams: [match.homeTeam.name, match.awayTeam.name], kickoff: match.kickoff,
      source: result.data.match.source, sourceUrl: result.data.match.sourceUrl, fetchedAt: result.data.match.fetchedAt,
      modelUsed: report.modelUsed, analyzedAt: report.analyzedAt, aiConfirmed: true, probabilities: report.probabilities,
      normalMemberStatus: result.status, ownerOverridesDenied: true, cachedRequestReused: true });
    console.log(JSON.stringify({ sport, memberStatus: result.status, model: report.modelUsed, realProviderCalls: requests.length - before, pass: true }));
  }
  await fs.writeFile('artifacts/member-automatic-ai-real-2026-10-06.json', JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), pass: true, requests, checks,
    limitation: 'Real sports data and AI provider; local authenticated member with isolated storage. Predictive accuracy is not established by a successful AI response.' }, null, 2));
} finally {
  globalThis.fetch = nativeFetch;
  if (server) await new Promise(resolve => server.close(resolve));
  storage.file = originalFile;
  await fs.rm(path.join(directory, 'access.json'), { force: true });
  await fs.rmdir(directory);
}
