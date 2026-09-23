import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
process.env.MASTER_ADMIN_CODE = 'Test-AI-Settings-Owner';
process.env.SESSION_SECRET = 'Test-ai-settings-session-secret-at-least-32';
const { storage } = await import('../server/storage.js');
const { default: app } = await import('../server/index.js');
const { getEffectiveAiConfig } = await import('../server/services/aiService.js');

test('private environment default serves as fallback when storage has no key and saved storage takes precedence', async t => {
  const previous = { VERCEL: process.env.VERCEL, AI_DEFAULT_CONFIG: process.env.AI_DEFAULT_CONFIG };
  let stored = { provider: 'custom', apiKey: '', selectedModel: 'legacy-model' };
  t.mock.method(storage, 'getAiConfig', async () => stored);
  t.mock.method(storage, 'updateAiConfig', async updates => {
    stored = { ...stored, ...updates };
    return stored;
  });
  try {
    process.env.VERCEL = '1';
    process.env.AI_DEFAULT_CONFIG = JSON.stringify({ provider: 'agentrouter', baseUrl: 'https://agentrouter.org/v1', apiKey: 'environment-test-key', selectedModel: '' });
    for (let i = 0; i < 3; i++) {
      const config = await getEffectiveAiConfig();
      assert.equal(config.provider, 'agentrouter');
      assert.equal(config.apiKey, 'environment-test-key');
      assert.equal(config.selectedModel, '');
      assert.equal(config.isConfigured, true);
    }
    await storage.updateAiConfig({ provider: 'custom', apiKey: 'saved-key', baseUrl: 'https://vyceai.com/v1', selectedModel: 'deepseek-v4.1' });
    const active = await getEffectiveAiConfig();
    assert.equal(active.provider, 'custom');
    assert.equal(active.apiKey, 'saved-key');
    assert.equal(active.selectedModel, 'deepseek-v4.1');
    stored.apiKey = '';
    process.env.AI_DEFAULT_CONFIG = '{secret-invalid-json';
    await assert.rejects(getEffectiveAiConfig(), error => !error.message.includes('secret-invalid-json'));
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('settings HTTP flow saves, reopens and tests the same key; provider switches never reuse it', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'picks-ai-settings-'));
  const originalFile = storage.file, realFetch = globalThis.fetch;
  storage.file = path.join(dir, 'db.json');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '', outbound = [], upstreamError = false;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).startsWith(base)) return realFetch(url, options);
    outbound.push({ url, ...options });
    if (upstreamError) return new Response(JSON.stringify({ error: { message: 'Invalid account key' } }), { status: 401 });
    return new Response(JSON.stringify(String(url).endsWith('/models')
      ? { data: [{ id: 'actual-model' }] } : { choices: [{ message: { content: 'OK' } }] }));
  });
  const request = async (endpoint, body) => {
    const response = await fetch(base + endpoint, { method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Cookie: cookie }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { response, data: await response.json() };
  };
  try {
    assert.equal((await request('/api/settings/test', {})).response.status, 401);
    const login = await request('/api/auth/verify-code', { code: process.env.MASTER_ADMIN_CODE });
    cookie = login.response.headers.get('set-cookie').split(';')[0];
    const config = { provider: 'agentrouter', baseUrl: 'https://agentrouter.org/v1', selectedModel: 'actual-model', apiKey: 'test-original-secret' };
    const saved = await request('/api/settings/update', config);
    assert.equal(saved.data.success, true); assert.equal(saved.data.settings.apiKey, undefined);
    assert.equal((await request('/api/settings')).data.settings.selectedModel, 'actual-model');
    const unchanged = { ...config }; delete unchanged.apiKey;
    assert.equal((await request('/api/settings/test', unchanged)).data.sample, 'OK');
    assert.equal(outbound.at(-1).headers.Authorization, 'Bearer test-original-secret');
    assert.equal((await request('/api/settings/update', unchanged)).data.success, true);
    assert.equal((await storage.getAiConfig()).apiKey, config.apiKey);
    const changed = { provider: 'custom', baseUrl: 'https://other.example/v1', selectedModel: 'other-model' };
    const count = outbound.length;
    assert.equal((await request('/api/settings/test', changed)).data.code, 'MISSING_KEY');
    assert.equal((await request('/api/settings/models', changed)).data.success, false);
    assert.equal((await request('/api/settings/update', changed)).response.status, 400);
    assert.equal(outbound.length, count);
    assert.equal((await storage.getAiConfig()).provider, config.provider);
    upstreamError = true;
    const catalog = await request('/api/settings/models', unchanged);
    assert.equal(catalog.data.success, false); assert.equal(catalog.data.upstreamStatus, 401);
    assert.equal(catalog.data.models, undefined);
    const pending = await request('/api/settings/update', { ...unchanged, selectedModel: '', modelName: '' });
    assert.equal(pending.data.success, true);
    const reopened = (await request('/api/settings')).data.settings;
    assert.equal(reopened.isConfigured, true);
    assert.equal(reopened.selectedModel, '');
    assert.equal(reopened.modelName, '');
    assert.equal((await storage.getAiConfig()).apiKey, config.apiKey);
    const noModelCount = outbound.length;
    assert.equal((await request('/api/settings/test', {})).data.code, 'MISSING_MODEL');
    assert.equal(outbound.length, noModelCount);
  } finally {
    await new Promise(resolve => server.close(resolve));
    storage.file = originalFile;
    await rm(dir, { recursive: true, force: true });
  }
});
