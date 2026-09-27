import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

process.env.MASTER_ADMIN_CODE = 'isolated-test-owner-strong-secret';
process.env.SESSION_SECRET = 'isolated-test-session-secret-minimum-32';
process.env.GOOGLE_CLIENT_ID = 'test-mobile';
const { default: app } = await import('../server/index.js');
const { storage } = await import('../server/storage.js');
const realFetch = globalThis.fetch;

test('logout revokes the original cookie; deleting an account requires its verified identity and removes data', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'picks-account-'));
  const originalFile = storage.file;
  storage.file = path.join(dir, 'accounts.json');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  let deletionAllowed = false;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://oauth2.googleapis.com/tokeninfo')) {
      const token = new URL(url).searchParams.get('id_token');
      return new Response(JSON.stringify({ aud: 'test-mobile', iss: 'https://accounts.google.com', exp: Date.now()/1000+600,
        email_verified: true, sub: token, email: token === 'mine' ? 'mine@example.invalid' : 'other@example.invalid', name: 'Test' }));
    }
    if (String(url).startsWith('https://identitytoolkit.googleapis.com/v1/accounts:delete')) return new Response('{}', { status: deletionAllowed ? 200 : 503 });
    return realFetch(url, init);
  };
  const request = (endpoint, body = {}, cookie = '') => realFetch(base + '/api/auth/' + endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body)
  });
  try {
    const login = await request('google', { credential: 'mine' });
    const profile = await login.json();
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.equal(profile.valid, true);
    assert.equal((await (await request('check-session', {}, cookie)).json()).valid, true);
    assert.equal((await request('logout', {}, cookie)).status, 200);
    assert.equal((await (await request('check-session', {}, cookie)).json()).valid, false, 'Replay of the old cookie must fail');

    const loginAgain = await request('google', { credential: 'mine' });
    const nextCookie = loginAgain.headers.get('set-cookie').split(';')[0];
    assert.equal((await request('delete-account', { credential: 'other' }, nextCookie)).status, 403);
    assert.ok(await storage.getUser(profile.user.id));
    assert.equal((await request('delete-account', { credential: 'mine' }, nextCookie)).status, 503);
    assert.ok(await storage.getUser(profile.user.id), 'Provider failure must not report deletion');
    deletionAllowed = true;
    assert.equal((await request('delete-account', { credential: 'mine' }, nextCookie)).status, 200);
    assert.equal(await storage.getUser(profile.user.id), undefined);
    assert.equal((await (await request('check-session', {}, nextCookie)).json()).valid, false);
    assert.equal((await request('delete-account', { credential: 'mine' })).status, 401);
  } finally {
    globalThis.fetch = realFetch;
    await new Promise(resolve => server.close(resolve));
    storage.file = originalFile;
    await rm(dir, { recursive: true, force: true });
  }
});

test('production API fails closed when security configuration is missing', async () => {
  const previous = process.env.NODE_ENV;
  const secret = process.env.SESSION_SECRET;
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    process.env.NODE_ENV = 'production';
    process.env.SESSION_SECRET = '';
    const response = await realFetch(`http://127.0.0.1:${server.address().port}/api/auth/check-session`, { method: 'POST' });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('set-cookie'), null);
  } finally {
    process.env.NODE_ENV = previous;
    process.env.SESSION_SECRET = secret;
    await new Promise(resolve => server.close(resolve));
  }
});
