import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';

process.env.MASTER_ADMIN_CODE = 'Owner-Master-Secret-Test-2026';
process.env.SESSION_SECRET = 'Owner-retry-ai-verification-session-secret-32-chars';

const { storage } = await import('../server/storage.js');
const { default: app } = await import('../server/index.js');

test('Version numbers are consistent across package.json, package-lock.json, App.jsx, public/sw.js and mobile.config.json', () => {
  const pkg = JSON.parse(readFileSync(path.resolve('package.json'), 'utf8'));
  const pkgLock = JSON.parse(readFileSync(path.resolve('package-lock.json'), 'utf8'));
  const appJsx = readFileSync(path.resolve('src/App.jsx'), 'utf8');
  const swJs = readFileSync(path.resolve('public/sw.js'), 'utf8');
  const mobileConfig = JSON.parse(readFileSync(path.resolve('mobile.config.json'), 'utf8'));

  assert.equal(pkg.version, '1.0.5', 'package.json version must be 1.0.5');
  assert.equal(pkgLock.version, '1.0.5', 'package-lock.json version must be 1.0.5');
  assert.equal(pkgLock.packages[''].version, '1.0.5', 'package-lock.json root package version must be 1.0.5');
  assert.ok(appJsx.includes('v1.0.5'), 'src/App.jsx must display v1.0.5 in footer');
  assert.ok(swJs.includes('picks-offline-v1.0.5'), 'public/sw.js must specify CACHE picks-offline-v1.0.5');
  assert.ok(swJs.includes('self.skipWaiting()'), 'public/sw.js must include skipWaiting for instant client updates');
  assert.equal(mobileConfig.versionName, '1.0.5', 'mobile.config.json versionName must be 1.0.5');
  assert.equal(mobileConfig.versionCode, 3, 'mobile.config.json versionCode must be incremented to 3');
});

test('Owner retry and re-analysis bypasses rate limits, prevents 429, and handles forceRefresh without crashing', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'picks-owner-retry-'));
  const originalFile = storage.file;
  const originalFetch = globalThis.fetch;

  storage.file = path.join(dir, 'db.json');

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;

  let ownerCookie = '';

  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).startsWith(base)) return originalFetch(url, options);
    // Mock ESPN and AI external calls
    if (String(url).includes('/scoreboard') || String(url).includes('/summary')) {
      return new Response(JSON.stringify({
        events: [],
        header: { competitions: [{ competitors: [{ homeAway: 'home', score: '2' }, { homeAway: 'away', score: '1' }] }] }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (String(url).endsWith('/chat/completions')) {
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              factIds: ['fixture', 'result', 'goals'],
              analysis: {
                dataVerification: 'Verificación oficial ESPN con muestra completa.',
                goalsAnalysis: 'Over 2.5 favorable con xG positivo.',
                positiveFactors: ['Ataque efectivo', 'Localía'],
                negativeFactors: ['Riesgo menor'],
                verdict: 'Victoria local pronosticada.'
              },
              topPick: {
                selection: 'Victoria Local',
                market: '1X2',
                probability: 75,
                reasoning: 'Poisson y métricas de temporada favorables.'
              }
            })
          }
        }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });

  const request = async (endpoint, body, cookie = '') => {
    const response = await fetch(base + endpoint, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { response, data };
  };

  try {
    // 1. Authenticate as Owner via MASTER_ADMIN_CODE
    const ownerAuth = await request('/api/auth/verify-code', { code: process.env.MASTER_ADMIN_CODE });
    assert.equal(ownerAuth.data.success, true);
    assert.equal(ownerAuth.data.role, 'owner');
    ownerCookie = ownerAuth.response.headers.get('set-cookie').split(';')[0];

    // 2. Generate sample match payload for test
    const testMatch = {
      id: 'test-retry-match-1',
      espnCode: 'eng.1',
      espnEventId: '123456',
      status: 'SCHEDULED',
      kickoff: new Date(Date.now() + 86400000).toISOString(),
      homeTeam: { name: 'Arsenal', gamesPlayed: 10, goalsFor: 22, goalsAgainst: 8 },
      awayTeam: { name: 'Chelsea', gamesPlayed: 10, goalsFor: 15, goalsAgainst: 12 }
    };

    // 3. Trigger multiple consecutive forceRefresh AI analysis calls as Owner
    // Previously, global or user rate limits would risk 429, or feed refresh would collapse
    for (let i = 0; i < 5; i++) {
      const retryRes = await request(`/api/matches/${testMatch.id}/ai-analysis`, {
        forceRefresh: true,
        match: testMatch
      }, ownerCookie);

      assert.equal(retryRes.response.status, 200, `Call ${i + 1} must return 200 OK`);
      assert.equal(retryRes.data.success, true, `Call ${i + 1} must succeed`);
      assert.ok(retryRes.data.match, 'Enriched match must be returned');
      assert.ok(retryRes.data.report, 'AI report must be returned');
      assert.equal(retryRes.response.status !== 429, true, 'Owner must never be blocked by 429');
    }

    // 4. Test external AI provider failure resilience during Owner retry
    // Mock fetch to simulate external LLM API outage (500 internal error)
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      if (String(url).startsWith(base)) return originalFetch(url, options);
      if (String(url).endsWith('/chat/completions')) {
        return new Response(JSON.stringify({ error: { message: 'Provider internal error' } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(url, options);
    });

    const fallbackRes = await request(`/api/matches/${testMatch.id}/ai-analysis`, {
      forceRefresh: true,
      match: testMatch
    }, ownerCookie);

    assert.equal(fallbackRes.response.status, 200, 'When external LLM fails, retry must return 200 with baseline without collapsing');
    assert.equal(fallbackRes.data.success, true);
    assert.equal(fallbackRes.data.report.aiAvailable, false, 'Report must gracefully indicate aiAvailable=false');
    assert.equal(fallbackRes.data.match.isAiAnalyzed, false, 'Match must not falsely claim isAiAnalyzed=true when AI failed');
    assert.ok(fallbackRes.data.report.analysisSections?.goalsAnalysis, 'Grounded Poisson analysis sections must still be present');
  } finally {
    await new Promise(resolve => server.close(resolve));
    storage.file = originalFile;
    globalThis.fetch = originalFetch;
    await rm(dir, { recursive: true, force: true });
  }
});

test('isMatchAnalyzed and MatchDetailModal distinguish between verified AI analysis and baseline report', async () => {
  const { isMatchAnalyzed } = await import('../src/utils/analysisCache.js');
  const matchDetailContent = readFileSync(path.resolve('src/components/MatchDetailModal.jsx'), 'utf8');

  assert.ok(matchDetailContent.includes('const effectiveIsOwner = Boolean('), 'MatchDetailModal must define effectiveIsOwner safely');
  assert.ok(matchDetailContent.includes('onToast = null'), 'MatchDetailModal must accept onToast prop for user feedback');

  const matchBaseline = {
    id: 'm-baseline',
    status: 'SCHEDULED',
    isAiAnalyzed: false,
    aiReport: { aiAvailable: false }
  };
  assert.equal(isMatchAnalyzed('m-baseline', matchBaseline), false, 'Baseline analysis with aiAvailable=false must not be counted as analyzed');

  const matchFullAi = {
    id: 'm-full-ai',
    status: 'SCHEDULED',
    isAiAnalyzed: true,
    aiReport: { aiAvailable: true, modelUsed: 'deepseek-v4.1' }
  };
  assert.equal(isMatchAnalyzed('m-full-ai', matchFullAi), true, 'Full AI report with aiAvailable=true must be counted as analyzed');
});

