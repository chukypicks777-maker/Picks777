import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
process.env.MASTER_ADMIN_CODE = 'Only-Test-Owner-Secret';
process.env.SESSION_SECRET = 'Only-test-session-secret-with-32-characters';
process.env.GOOGLE_CLIENT_ID = 'verified-client';
const { storage, StorageManager } = await import('../server/storage.js');
const { default: app } = await import('../server/index.js');
const { validateAiConfig } = await import('../server/security.js');
const { validateSocialLinks } = await import('../server/socialSettings.js');
const { SOCIAL_LINKS } = await import('../src/constants/socials.js');
const { verifyGoogleToken } = await import('../server/routes/authRoutes.js');

test('social validation blocks scripts, credentials, deceptive domains and duplicate groups', () => {
  for (const url of ['javascript:alert(1)', 'http://t.me/test', 'https://t.me.evil.com/test', 'https://evil@t.me/test', 'https://t.me:444/test', 'https://127.0.0.1/test']) {
    assert.throws(() => validateSocialLinks(SOCIAL_LINKS.map((s, i) => i ? s : { ...s, url })));
  }
  assert.throws(() => validateSocialLinks([SOCIAL_LINKS[0], SOCIAL_LINKS[0], SOCIAL_LINKS[2]]));
  assert.equal(validateSocialLinks(SOCIAL_LINKS)[0].url, SOCIAL_LINKS[0].url);
});
test('AI destinations reject SSRF, credentials, queries and type confusion', () => {
  for (const baseUrl of ['http://127.0.0.1:5000', 'https://169.254.169.254', 'https://openrouter.ai.evil.com', 'https://user:pass@openrouter.ai/api/v1', 'https://openrouter.ai/api/v1?token=bad', 'https://[::1]']) assert.throws(() => validateAiConfig({ provider: 'openrouter', baseUrl }));
  assert.throws(() => validateAiConfig({ provider: '__proto__' }));
  assert.throws(() => validateAiConfig({ apiKey: { key: 'bad' } }));
  assert.equal(validateAiConfig({ provider: 'openrouter' }).baseUrl, 'https://openrouter.ai/api/v1');
});
test('group writes persist and concurrent stale edits do not overwrite a newer save', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'picks-groups-'));
  try {
    const db = new StorageManager(path.join(dir, 'db.json'));
    const links = SOCIAL_LINKS.map(s => ({ ...s, label: 'Test group' }));
    await db.updateSocialSettings(links, 0);
    const results = await Promise.allSettled([db.updateSocialSettings(links, 1), db.updateSocialSettings(links, 1)]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const saved = await new StorageManager(db.file).getSocialSettings(); assert.equal(saved.revision, 2); assert.equal(saved.links[0].label, 'Test group');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('identity verification fails closed for unsigned tokens, wrong audiences and unverified email', async () => {
  const original = globalThis.fetch;
  try {
    for (const invalid of [{}, { email: 'owner@example.com', aud: 'wrong' }, { email: 'owner@example.com', aud: 'verified-client', iss: 'https://accounts.google.com', exp: Date.now() / 1000 + 300, sub: '123', email_verified: false }]) {
      globalThis.fetch = async url => String(url).includes('tokeninfo') ? new Response(JSON.stringify(invalid)) : new Response('{}', { status: 401 });
      assert.equal(await verifyGoogleToken('unsigned.token.value'), null);
    }
  } finally { globalThis.fetch = original; }
});
test('HTTP groups: anonymous/VIP/header forgery/CSRF denied; Owner succeeds; public read exposes only groups', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'picks-http-security-')), original = storage.file;
  storage.file = path.join(dir, 'db.json');
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, body, cookie = '', headers = {}) => fetch(base + url, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Cookie: cookie, ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    const input = { links: SOCIAL_LINKS, revision: 0 };
    assert.equal((await request('/api/settings/groups', input)).status, 401);
    assert.equal((await request('/api/settings/groups', input, '', { 'x-admin-key': 'DeportePicks' })).status, 401);
    assert.equal((await request('/api/auth/google', { demoUser: { email: 'owner@example.com' } })).status, 400);
    const ownerLogin = await request('/api/auth/verify-code', { code: process.env.MASTER_ADMIN_CODE });
    const owner = ownerLogin.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(base + '/api/auth/check-session', { method: 'POST', headers: { Cookie: owner } })).status, 200);
    assert.equal((await request('/api/settings/groups', input, owner, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    await storage.createCode({ code: 'TEST-VIP-123', durationDays: 30 });
    const vipLogin = await request('/api/auth/verify-code', { code: 'TEST-VIP-123' });
    const vip = vipLogin.headers.get('set-cookie').split(';')[0];
    assert.equal((await request('/api/settings/groups', input, vip, { 'x-admin-key': process.env.MASTER_ADMIN_CODE })).status, 403);
    assert.equal((await request('/api/settings/groups', input, owner, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await request('/api/settings/groups', input, owner + 'tampered')).status, 401);
    const saved = await request('/api/settings/groups', input, owner); assert.equal(saved.status, 200);
    assert.equal((await request('/api/settings/groups', input, owner)).status, 400);
    const publicData = await (await request('/api/community')).json(); assert.equal(publicData.settings.revision, 1); assert.equal(publicData.settings.apiKey, undefined);
    const settings = await request('/api/settings/update', { provider: 'openrouter', apiKey: {}, baseUrl: 'https://localhost' }, owner); assert.equal(settings.status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); storage.file = original; await rm(dir, { recursive: true, force: true }); }
});

test('production refuses default secrets and Vercel without persistent storage', async () => {
  const { secureConfiguration } = await import('../server/config.js');
  const names = ['NODE_ENV','VERCEL','MASTER_ADMIN_CODE','SESSION_SECRET','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN'];
  const previous = Object.fromEntries(names.map(n => [n, process.env[n]]));
  try {
    process.env.NODE_ENV = 'production'; process.env.VERCEL = '1';
    process.env.MASTER_ADMIN_CODE = 'DeportePicks';
    assert.equal(secureConfiguration(), false);
    process.env.MASTER_ADMIN_CODE = 'test-owner-secret-long-enough';
    process.env.UPSTASH_REDIS_REST_URL = ''; process.env.UPSTASH_REDIS_REST_TOKEN = '';
    assert.equal(secureConfiguration(), false);
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'; process.env.UPSTASH_REDIS_REST_TOKEN = 'test-only';
    assert.equal(secureConfiguration(), true);
  } finally { for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } }
});
