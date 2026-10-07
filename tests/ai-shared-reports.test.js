import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import express from 'express';
process.env.SESSION_SECRET = 'shared-ai-session-secret-at-least-32-chars';
process.env.MASTER_ADMIN_CODE = 'shared-ai-owner-code';
process.env.AI_MAX_ANALYSES = '1';
const { storage } = await import('../server/storage.js');
const { setSession } = await import('../server/session.js');
const { clearCachePattern } = await import('../server/services/dataCache.js');
const { forgetLeagueModels } = await import('../server/services/footballHistory.js');
const { compressJson } = await import('../server/compression.js');
const { default: app } = await import('../server/index.js');
const realFetch = globalThis.fetch;
const kickoff = new Date(Date.now() + 2 * 86400000).toISOString();
const fixtureEvent = id => ({ id, date: kickoff, season: { year: 2026 }, competitions: [{
  status: { type: { name: 'STATUS_SCHEDULED', state: 'pre', completed: false } },
  competitors: [{ homeAway: 'home', team: { id: `h${id}`, displayName: `Local ${id}` } }, { homeAway: 'away', team: { id: `a${id}`, displayName: `Visita ${id}` } }],
  odds: [{ provider: { name: 'DraftKings' }, moneyline: { home: { close: { odds: '-150' } }, draw: { close: { odds: '+280' } }, away: { close: { odds: '+400' } } } }]
}] });

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'picks-shared-ai-')), previous = storage.file;
  storage.file = path.join(dir, 'accounts.json');
  clearCachePattern(''); forgetLeagueModels();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const providerCalls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const href = String(url);
    if (href.startsWith(base)) return realFetch(url, init);
    if (href.includes('vyceai.com')) { providerCalls.push(JSON.parse(init.body)); return new Response(JSON.stringify({ choices: [{ message: { content: '{"factIds":["result","goals"]}' } }] })); }
    if (href.includes('/eng.1/scoreboard') && !/dates=\d{4}&/.test(href)) return new Response(JSON.stringify({ events: ['101', '102', '103'].map(fixtureEvent) }));
    if (href.includes('/standings')) return new Response(JSON.stringify({ children: [] }));
    if (href.includes('espn.com')) return new Response(JSON.stringify({ events: [] }));
    throw new Error(`Unexpected request ${href}`);
  });
  await storage.updateAiConfig({ provider: 'custom', baseUrl: 'https://vyceai.com/v1', apiKey: 'isolated-shared-key', selectedModel: 'shared-model' });
  const member = async email => {
    const user = await storage.upsertGoogleUser({ googleId: email, email });
    let cookie;
    setSession({ cookie: (name, value) => { cookie = `${name}=${value}`; } }, { userId: user.id, role: user.role, expires: user.expires });
    return (url, body) => realFetch(base + url, { method: body ? 'POST' : 'GET', headers: { cookie, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  };
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    storage.file = previous; clearCachePattern(''); forgetLeagueModels();
    await rm(dir, { recursive: true, force: true });
  });
  return { member, providerCalls };
}

test('one AI selection serves every member; reading it costs no quota and the batch read never calls the provider', async t => {
  const { member, providerCalls } = await fixture(t);
  const first = await member('first@example.invalid'), second = await member('second@example.invalid');
  const generated = await (await first('/api/matches/espn-101/ai-analysis', {})).json();
  assert.equal(generated.report.aiAvailable, true);
  assert.equal(providerCalls.length, 1);
  assert.match(generated.report.tacticalKeypoints[0], /Mercado sin margen/);

  // Another member reads the same fixture: no provider call and no quota use.
  const shared = await (await second('/api/matches/espn-101/ai-analysis', {})).json();
  assert.equal(shared.report.aiAvailable, true);
  assert.deepEqual(shared.report.tacticalKeypoints, generated.report.tacticalKeypoints);
  assert.equal(providerCalls.length, 1);
  // The quota (one generation per window here) is charged only for new work.
  assert.equal((await second('/api/matches/espn-102/ai-analysis', {})).status, 200);
  assert.equal(providerCalls.length, 2);
  const limited = await second('/api/matches/espn-103/ai-analysis', {});
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  assert.equal(providerCalls.length, 2);

  const batch = await (await second('/api/matches/ai-reports', { ids: ['espn-101', 'espn-102', 'espn-103'] })).json();
  assert.deepEqual(Object.keys(batch.reports).sort(), ['espn-101', 'espn-102']);
  assert.equal(providerCalls.length, 2, 'Reading stored reports never starts AI work');
  assert.equal((await second('/api/matches/ai-reports', { ids: ['not-a-fixture'] })).status, 400);
  assert.equal((await second('/api/matches/ai-reports', { ids: Array.from({ length: 101 }, (_, i) => `espn-${i}`) })).status, 400);
});

test('calendar polls return the lean list view and unknown fixtures cannot force repeated provider refreshes', async t => {
  const { member } = await fixture(t);
  const request = await member('calendar@example.invalid');
  const feed = await (await request('/api/matches?timezone=UTC')).json();
  assert.equal(feed.success, true);
  const match = feed.matches.find(m => m.id === 'espn-101');
  assert.ok(match.model.probabilities.homeWin > 50);
  for (const heavy of ['scoreDistribution', 'statisticalProbabilities', 'corners', 'limitations']) assert.equal(match.model[heavy], undefined, heavy);
  const detail = await (await request('/api/matches/espn-101')).json();
  assert.ok(detail.match.model.scoreDistribution.length > 0, 'The report endpoint keeps the complete model');
  let refreshes = 0;
  const counting = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (url, init) => { if (String(url).includes('/eng.1/scoreboard')) refreshes++; return counting(url, init); });
  for (let i = 0; i < 5; i++) assert.equal((await request(`/api/matches/espn-99999${i}`)).status, 404);
  assert.ok(refreshes <= 10, `At most one forced calendar refresh, saw ${refreshes} league requests`);
  assert.equal((await request('/api/matches/..%2Fadmin')).status, 400);
});

test('a fixture already being analyzed by another instance waits for that selection instead of paying twice', async t => {
  const { generateGroundedAiReport, getEffectiveAiConfig, forgetAiConfig, aiSelectionKey } = await import('../server/services/aiService.js');
  const previous = { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN };
  process.env.KV_REST_API_URL = 'https://lease-fixture.upstash.io'; process.env.KV_REST_API_TOKEN = 'isolated-token';
  t.after(() => { process.env.KV_REST_API_URL = previous.url || ''; process.env.KV_REST_API_TOKEN = previous.token || ''; forgetAiConfig(); clearCachePattern(''); });
  t.mock.method(storage, 'getAiConfig', async () => ({ provider: 'custom', apiKey: 'isolated-lease-key', baseUrl: 'https://vyceai.com/v1', selectedModel: 'lease-model' }));
  forgetAiConfig(); clearCachePattern('');
  const match = { id: 'espn-777', sport: 'futbol', status: 'SCHEDULED', homeTeam: { name: 'A' }, awayTeam: { name: 'B' } };
  const facts = [{ id: 'fixture', text: 'A vs B.' }, { id: 'result', text: 'Mercado: A 50%.' }];
  const baseline = { aiAvailable: false, modelUsed: null, facts: facts.map(f => f.text), narrativeAnalysis: 'Base.' };
  const selectionKey = `picks:v2:cache:${aiSelectionKey(match, await getEffectiveAiConfig())}`;
  let reads = 0, providerCalls = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).includes('vyceai.com')) { providerCalls++; return new Response('{}'); }
    const [command, key, , ...flags] = JSON.parse(init.body);
    // The lease belongs to another instance; its selection lands after a few reads.
    if (command === 'SET' && flags.includes('NX')) return new Response(JSON.stringify({ result: null }));
    if (command === 'GET' && key === selectionKey && ++reads >= 3) {
      return new Response(JSON.stringify({ result: JSON.stringify({ value: { factIds: ['result'], modelUsed: 'lease-model', generatedAt: '2026-10-07T10:00:00Z' }, expires: Date.now() + 60000 }) }));
    }
    return new Response(JSON.stringify({ result: null }));
  });
  const report = await generateGroundedAiReport(match, facts, baseline, { deadline: Date.now() + 20000 });
  assert.equal(report.aiAvailable, true);
  assert.deepEqual(report.tacticalKeypoints, ['Mercado: A 50%.']);
  assert.equal(providerCalls, 0);
});

test('large JSON responses are gzip-compressed off Vercel and left to the CDN on Vercel', async t => {
  const local = express();
  local.use(compressJson);
  local.get('/big', (req, res) => res.json({ rows: Array.from({ length: 500 }, (_, i) => ({ id: i, text: 'Partido de prueba' })) }));
  local.get('/small', (req, res) => res.json({ ok: true }));
  const server = local.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const previous = process.env.VERCEL;
  delete process.env.VERCEL;
  try {
    const big = await realFetch(`${base}/big`, { headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(big.headers.get('content-encoding'), 'gzip');
    assert.equal((await big.json()).rows.length, 500);
    assert.equal((await realFetch(`${base}/small`, { headers: { 'Accept-Encoding': 'gzip' } })).headers.get('content-encoding'), null);
    process.env.VERCEL = '1';
    assert.equal((await realFetch(`${base}/big`, { headers: { 'Accept-Encoding': 'gzip' } })).headers.get('content-encoding'), null);
  } finally { if (previous === undefined) delete process.env.VERCEL; else process.env.VERCEL = previous; }
});
