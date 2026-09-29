import test from 'node:test';
import assert from 'node:assert/strict';
import { MobileAuthExchange, verifierChallenge } from '../server/mobileAuth.js';
import { once } from 'node:events';
test('mobile credential requires the original verifier and can be consumed exactly once', async () => {
  const exchange = new MobileAuthExchange(), verifier = 'a'.repeat(64);
  const { id } = await exchange.start(verifierChallenge(verifier));
  assert.equal(await exchange.consume(id, verifier), 'pending');
  assert.equal(await exchange.complete(id, 'verified-test-token'), 'ok');
  assert.equal(await exchange.complete(id, 'attacker-token'), null);
  assert.equal(await exchange.consume(id, 'b'.repeat(64)), null);
  assert.deepEqual(await Promise.all([exchange.consume(id, verifier), exchange.consume(id, verifier)]), ['verified-test-token', null]);
});
test('mobile request expires without extending its lifetime on confirmation', async () => {
  let now = 1000;
  const exchange = new MobileAuthExchange(() => now), verifier = 'a'.repeat(64);
  const { id } = await exchange.start(verifierChallenge(verifier));
  now += 299000;
  assert.equal(await exchange.complete(id, 'verified-test-token'), 'ok');
  now += 1001;
  assert.equal(await exchange.consume(id, verifier), null);
  assert.equal(await exchange.complete(id, 'new-token'), null);
  await assert.rejects(() => exchange.start('bad'));
});
test('HTTP mobile handshake rejects fake identity and CSRF, and returns the verified token only once', async t => {
  const { default: app } = await import('../server/index.js');
  const realFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).startsWith('https://oauth2.googleapis.com/')) return new Response('{}', { status: 401 });
    if (String(url).startsWith('https://identitytoolkit.googleapis.com/')) {
      const valid = JSON.parse(options.body).idToken === 'firebase-verified-fixture';
      return new Response(JSON.stringify(valid ? { users: [{ localId: 'fixture', emailVerified: true, email: 'test@example.invalid', providerUserInfo: [{ providerId: 'google.com' }] }] } : {}), { status: valid ? 200 : 401 });
    }
    return realFetch(url, options);
  });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (path, body, origin = base) => fetch(base + '/api/auth/mobile/' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body)
  });
  const verifier = 'c'.repeat(64), challenge = verifierChallenge(verifier);
  assert.equal((await post('start', { challenge }, 'https://evil.example')).status, 403);
  const start = await post('start', { challenge }); assert.equal(start.status, 200);
  const { id } = await start.json();
  assert.equal((await post('complete', { id, credential: 'made-up' })).status, 400);
  assert.equal((await (await post('poll', { id, verifier })).json()).pending, true);
  assert.equal((await post('complete', { id, credential: 'firebase-verified-fixture' })).status, 200);
  assert.equal((await post('poll', { id, verifier: 'd'.repeat(64) })).status, 410);
  const result = await post('poll', { id, verifier });
  assert.match(result.headers.get('cache-control'), /no-store/);
  assert.equal((await result.json()).credential, 'firebase-verified-fixture');
  assert.equal((await post('poll', { id, verifier })).status, 410);
});
