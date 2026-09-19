import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchProviderModels, executeAiChatCompletion, testAiConnection } from '../server/services/aiProviderClient.js';
import { resolveAiConfig, validateAiConfig } from '../server/security.js';

const config = { provider: 'agentrouter', baseUrl: 'https://agentrouter.org/v1', apiKey: 'test-secret-only', selectedModel: 'chosen-model' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('saved credentials are reused only for the same provider and normalized API base', () => {
  assert.equal(resolveAiConfig({ provider: config.provider }, config).apiKey, config.apiKey);
  for (const target of [
    { provider: 'groq' },
    { provider: 'custom', baseUrl: 'https://other.example/v1' },
    { provider: 'agentrouter', baseUrl: 'https://co.agentrouter.org/v1' }
  ]) assert.equal(resolveAiConfig(target, config).apiKey, '');
  const custom = { ...config, provider: 'custom', baseUrl: 'https://one.example/v1' };
  assert.equal(resolveAiConfig({ provider: 'custom', baseUrl: 'https://two.example/v1' }, custom).apiKey, '');
  assert.equal(resolveAiConfig({ ...config, apiKey: 'Bearer replacement' }, config).apiKey, 'replacement');
  assert.equal(validateAiConfig({ ...config, selectedModel: 'nvidia/custom:free' }).selectedModel, 'nvidia/custom:free');
  assert.equal(validateAiConfig({ ...config, baseUrl: 'https://agentrouter.org/v1/chat/completions' }).baseUrl, config.baseUrl);
  assert.equal(validateAiConfig({ provider: 'custom', baseUrl: 'https://agentrouter.other.example/service/v2' }).baseUrl, 'https://agentrouter.other.example/service/v2');
});

test('catalog errors remain errors and never become invented models or balances', async t => {
  t.mock.method(globalThis, 'fetch', async () => json({ error: { message: 'Invalid token' } }, 401));
  await assert.rejects(fetchProviderModels(config.provider, config.apiKey, config.baseUrl), { code: 'AUTH_ERROR', status: 401 });
  globalThis.fetch = async () => json({ data: [{ id: 'actual-account-model' }] });
  const models = await fetchProviderModels(config.provider, config.apiKey, config.baseUrl);
  assert.deepEqual(models.map(m => m.id), ['actual-account-model']);
  assert.equal(models[0].hasQuota, undefined);
  globalThis.fetch = async () => new Response('<!DOCTYPE html><html>AliyunCaptcha</html>');
  await assert.rejects(fetchProviderModels(config.provider, config.apiKey, config.baseUrl), { code: 'WAF_CHALLENGE' });
});

test('connection test requires real final text, preserves model and makes one request', async t => {
  let calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return json({ choices: [{ message: { content: 'OK' } }] });
  });
  const result = await testAiConnection(config);
  assert.equal(result.success, true); assert.equal(result.sample, 'OK');
  assert.equal(result.model, config.selectedModel);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://agentrouter.org/v1/chat/completions');
  assert.equal(calls[0].body.model, config.selectedModel);
  assert.equal(calls[0].options.headers['User-Agent'], undefined);
  assert.equal(calls[0].body.max_completion_tokens, undefined);
  globalThis.fetch = async () => json({ choices: [{ message: { reasoning_content: 'Thinking only' } }] });
  assert.equal((await testAiConnection(config)).code, 'EMPTY_RESPONSE');
  assert.equal((await testAiConnection({ ...config, selectedModel: '' })).code, 'MISSING_MODEL');
});

test('Claude uses Messages while Gemini uses its native API and excludes thought text', async t => {
  let call;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    call = { url, ...options, body: JSON.parse(options.body) };
    return json({ content: [{ type: 'thinking', thinking: 'private' }, { type: 'text', text: 'OK' }] });
  });
  assert.equal(await executeAiChatCompletion({ ...config, model: 'claude-test', userPrompt: 'OK', systemPrompt: 'test' }), 'OK');
  assert.equal(call.url, 'https://agentrouter.org/v1/messages');
  assert.equal(call.headers['x-api-key'], config.apiKey);
  assert.equal(call.body.system, 'test');
  globalThis.fetch = async (url, options) => {
    call = { url, ...options };
    return json({ candidates: [{ content: { parts: [{ thought: true, text: 'private' }, { text: 'OK' }] } }] });
  };
  assert.equal(await executeAiChatCompletion({ provider: 'gemini', apiKey: 'test-key', model: 'gemini-test', userPrompt: 'OK' }), 'OK');
  assert.equal(call.url.includes('?key='), false);
  assert.equal(call.headers['x-goog-api-key'], 'test-key');
});

test('WAF, quota, auth, timeout and malformed responses are not success and do not retry another protocol', async t => {
  let count = 0, response;
  t.mock.method(globalThis, 'fetch', async () => { count++; if (response instanceof Error) throw response; return response; });
  for (const [upstream, expected] of [
    [new Response('<!DOCTYPE html>AliyunCaptcha', { status: 403 }), 'WAF_CHALLENGE'],
    [json({ error: { message: 'Token invalid test-secret-only' } }, 401), 'AUTH_ERROR'],
    [json({ error: { message: 'unauthorized client detected' } }, 401), 'CLIENT_NOT_AUTHORIZED'],
    [json({ error: { message: 'Budget pool quota has been exhausted' } }, 402), 'QUOTA_ERROR'],
    [json({ error: { message: 'rate limit' } }, 429), 'RATE_LIMIT'],
    [new Response('not json'), 'INVALID_RESPONSE'],
    [new DOMException('deadline', 'TimeoutError'), 'TIMEOUT']
  ]) {
    response = upstream; count = 0;
    const result = await testAiConnection(config);
    assert.equal(result.success, false); assert.equal(result.code, expected); assert.equal(count, 1);
    assert.equal(result.message.includes(config.apiKey), false);
    assert.equal(result.message.includes('deepseek-v4-flash'), false);
  }
});

test('custom reasoning APIs receive exactly one token limit and keep their path', async t => {
  let call;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    call = { url, body: JSON.parse(options.body) };
    return json({ choices: [{ message: { content: 'OK' } }] });
  });
  const custom = { provider: 'custom', baseUrl: 'https://vendor.example/service/v2', apiKey: 'test-key', userPrompt: 'OK' };
  await executeAiChatCompletion({ ...custom, model: 'deepseek-reasoner' });
  assert.equal(call.url, custom.baseUrl + '/chat/completions');
  assert.equal(call.body.max_completion_tokens, undefined); assert.equal(call.body.max_tokens, 4000);
  await executeAiChatCompletion({ ...custom, model: 'o3-mini' });
  assert.equal(call.body.max_tokens, undefined); assert.equal(call.body.max_completion_tokens, 4000);
});
