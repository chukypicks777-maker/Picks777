import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.SESSION_SECRET = 'apple-test-session-secret-at-least-32-characters';
process.env.MASTER_ADMIN_CODE = 'apple-test-owner';
const { storage } = await import('../server/storage.js');
const { default: app } = await import('../server/index.js');
const { verifierChallenge } = await import('../server/mobileAuth.js');

test('Apple access and mobile exchange require project-verified Apple identity and preserve account-bound VIP', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'picks-apple-'));
  const oldFile = storage.file;
  storage.file = join(directory, 'accounts.json');
  t.after(async () => { storage.file = oldFile; await rm(directory, { recursive: true, force: true }); });
  const realFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).startsWith('https://identitytoolkit.googleapis.com/v1/accounts:lookup')) {
      const token = JSON.parse(options.body).idToken;
      const valid = ['verified-apple', 'verified-google', 'disabled-apple', 'other-apple'].includes(token);
      return new Response(JSON.stringify({ users: valid ? [{ localId: token === 'other-apple' ? 'other-firebase-uid' : 'fixture-firebase-uid', email: token === 'other-apple' ? 'other@example.invalid' : 'apple@example.invalid', emailVerified: true,
        displayName: 'Apple fixture', disabled: token === 'disabled-apple', providerUserInfo: [{ providerId: token === 'verified-google' ? 'google.com' : 'apple.com' }] }] : [] }), { status: valid ? 200 : 401 });
    }
    if (String(url).startsWith('https://identitytoolkit.googleapis.com/v1/accounts:delete')) {
      return new Response('{}', { status: JSON.parse(options.body).idToken === 'verified-apple' ? 200 : 401 });
    }
    return realFetch(url, options);
  });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (path, body, cookie = '') => fetch(base + '/api/auth/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) });
  for (const token of ['client-forged', 'verified-google', 'disabled-apple']) {
    const rejected = await post('apple', { credential: token, email: 'owner@example.invalid', isAdmin: true });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.headers.get('set-cookie'), null);
  }
  const login = await post('apple', { credential: 'verified-apple' });
  assert.equal(login.status, 200);
  const trial = await login.json();
  assert.equal(trial.valid, true);
  assert.equal(trial.isAdmin, false);
  assert.equal(trial.user.provider, 'apple');
  const cookie = login.headers.get('set-cookie').split(';')[0];
  await storage.createCode({ code: 'APPLE-FIXTURE', durationDays: 30 });
  const activated = await post('redeem-code', { code: 'APPLE-FIXTURE' }, cookie);
  assert.equal((await activated.json()).role, 'vip_user');
  const restored = await post('apple', { credential: 'verified-apple' });
  const vip = await restored.json();
  assert.equal(vip.user.id, trial.user.id);
  assert.equal(vip.role, 'vip_user');
  assert.equal(vip.user.provider, 'apple');
  const verifier = 'f'.repeat(64);
  const { id } = await (await post('mobile/start', { challenge: verifierChallenge(verifier) })).json();
  assert.equal((await post('mobile/complete', { id, credential: 'verified-google', provider: 'apple' })).status, 400);
  assert.equal((await post('mobile/complete', { id, credential: 'verified-apple', provider: 'apple' })).status, 200);
  assert.equal((await (await post('mobile/poll', { id, verifier })).json()).credential, 'verified-apple');
  assert.equal((await post('mobile/poll', { id, verifier })).status, 410);
  assert.equal((await post('delete-account', { credential: 'other-apple' }, cookie)).status, 403);
  assert.ok(await storage.getUser(trial.user.id));
  const deleted = await post('delete-account', { credential: 'verified-apple' }, cookie);
  assert.equal(deleted.status, 200);
  assert.match(deleted.headers.get('set-cookie'), /picks_session=;/);
  assert.equal(await storage.getUser(trial.user.id), undefined);
});
