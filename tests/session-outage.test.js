import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
process.env.SESSION_SECRET = 'test-session-outage-secret-with-32-characters';
process.env.MASTER_ADMIN_CODE = 'test-session-outage-owner';
const { default: app } = await import('../server/index.js');
const { storage } = await import('../server/storage.js');
const { setSession, ownerVersion } = await import('../server/session.js');

test('session storage outages report 503 without revoking or clearing the cookie; recovery restores access', async t => {
  let unavailable = true;
  t.mock.method(storage, 'isSessionRevoked', async () => {
    if (unavailable) throw new Error('Fixture outage');
    return false;
  });
  let cookie;
  setSession({ cookie: (name, value) => { cookie = name + '=' + value; } }, { role: 'owner', ownerVersion: ownerVersion(), expires: Date.now() + 3600000 });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  for (const path of ['/api/auth/check-session', '/api/auth/session']) {
    const response = await fetch(base + path, { method: 'POST', headers: { cookie } });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal((await response.json()).message, 'No se pudo comprobar la sesión. Reintenta la conexión.');
  }
  unavailable = false;
  const recovered = await fetch(base + '/api/auth/session', { method: 'POST', headers: { cookie } });
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).valid, true);
});
