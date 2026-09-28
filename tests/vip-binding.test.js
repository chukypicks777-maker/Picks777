import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { StorageManager, storage } from '../server/storage.js';
import { entitlement } from '../server/entitlements.js';
import app from '../server/index.js';

test('codes bind atomically to one account and expire at the exact millisecond for every duration', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vip-binding-'));
  let now = Date.parse('2026-09-28T12:34:56.789Z');
  t.mock.method(Date, 'now', () => now);
  try {
    const db = new StorageManager(path.join(dir, 'db.json'));
    for (const days of [1, 2, 15, 30, 60, 365]) {
      const a = await db.upsertGoogleUser({ googleId: 'a' + days, email: `a${days}@example.invalid` });
      const b = await db.upsertGoogleUser({ googleId: 'b' + days, email: `b${days}@example.invalid` });
      const code = `BOUND-${days}`;
      await db.createCode({ code, durationDays: days });
      const activatedAt = now;
      const claims = await Promise.all([a, b].map(u => db.redeemUserCode({ userId: u.id, code })));
      assert.equal(claims.filter(r => r.success).length, 1);
      const winner = claims[0].success ? a : b;
      const loser = winner === a ? b : a;
      const original = await db.getCode(code);
      assert.equal(original.claimedUserId, winner.id);
      assert.equal(Date.parse(original.expiresAt), activatedAt + days * 86400000);
      now += 60000;
      const again = await db.redeemUserCode({ userId: winner.id, code });
      assert.equal(again.expiresAt, original.expiresAt);
      const restored = await new StorageManager(db.file).upsertGoogleUser({ googleId: winner.googleId, email: winner.email });
      assert.equal(restored.isVip, true);
      assert.equal(restored.vipExpiresAt, original.expiresAt);
      assert.equal((await db.redeemUserCode({ userId: loser.id, code })).success, false);
      assert.equal(entitlement(restored, original, Date.parse(original.expiresAt) - 1).isVip, true);
      const expired = entitlement(restored, original, Date.parse(original.expiresAt));
      assert.equal(expired.isVip, false);
      assert.equal(expired.isTrial, false, 'A one-day VIP must not fall back to three-day trial');
      assert.equal(expired.trialExpired, true);
    }
    await db.deleteCode('BOUND-1');
    await assert.rejects(db.createCode({ code: 'BOUND-1' }), /ya existe/);
    const code = await db.getCode('BOUND-2');
    await db.deleteUserData(code.claimedUserId);
    const replacement = await db.upsertGoogleUser({ googleId: 'replacement', email: 'replacement@example.invalid' });
    assert.equal((await db.redeemUserCode({ userId: replacement.id, code: code.code })).success, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('Google relogin restores VIP, owner is granted only from verified configured identity, anonymous codes fail', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vip-http-'));
  const oldFile = storage.file, oldOwner = process.env.OWNER_GOOGLE_EMAIL;
  const originalFetch = globalThis.fetch;
  storage.file = path.join(dir, 'db.json');
  process.env.OWNER_GOOGLE_EMAIL = 'owner@example.invalid';
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://oauth2.googleapis.com/')) return new Response('{}', { status: 400 });
    if (String(url).includes('identitytoolkit.googleapis.com')) {
      const email = JSON.parse(init.body).idToken;
      return new Response(JSON.stringify({ users: [{ localId: email, email, emailVerified: true, providerUserInfo: [{ providerId: 'google.com' }] }] }));
    }
    return originalFetch(url, init);
  };
  const post = (endpoint, body = {}, cookie = '') => originalFetch(base + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) });
  const login = async email => { const response = await post('/api/auth/google', { credential: email }); return { cookie: response.headers.get('set-cookie').split(';')[0], data: await response.json() }; };
  try {
    const owner = await login('owner@example.invalid');
    assert.equal(owner.data.isAdmin, true);
    assert.equal((await originalFetch(base + '/api/admin/codes', { headers: { cookie: owner.cookie } })).status, 200);
    await storage.createCode({ code: 'ACCOUNT-BOUND', durationDays: 1 });
    assert.equal((await post('/api/auth/redeem-code', { code: 'ACCOUNT-BOUND' })).status, 401);
    assert.equal((await post('/api/auth/verify-code', { code: 'ACCOUNT-BOUND' })).status, 401);
    const a = await login('a@example.invalid'), b = await login('b@example.invalid');
    assert.equal(a.data.isAdmin, false);
    const first = await post('/api/auth/redeem-code', { code: 'ACCOUNT-BOUND' }, a.cookie);
    assert.equal(first.status, 200);
    assert.equal((await post('/api/auth/redeem-code', { code: 'ACCOUNT-BOUND' }, b.cookie)).status, 400);
    await post('/api/auth/logout', {}, a.cookie);
    const restored = await login('a@example.invalid');
    assert.equal(restored.data.role, 'vip_user');
    assert.equal(restored.data.user.hasCode, true);
    const code = await storage.getCode('ACCOUNT-BOUND');
    assert.equal(restored.data.user.expiresAt, code.expiresAt);
    let now = Date.parse(code.expiresAt) - 1;
    t.mock.method(Date, 'now', () => now);
    assert.equal((await (await post('/api/auth/session', {}, restored.cookie)).json()).valid, true);
    now++;
    const expired = await (await post('/api/auth/session', {}, restored.cookie)).json();
    assert.equal(expired.valid, false);
    assert.equal(expired.trialExpired, true);
    assert.equal((await originalFetch(base + '/api/admin/mobile', { headers: { cookie: restored.cookie } })).status, 403);
  } finally {
    globalThis.fetch = originalFetch; process.env.OWNER_GOOGLE_EMAIL = oldOwner;
    storage.file = oldFile; await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
