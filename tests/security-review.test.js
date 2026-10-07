import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
process.env.SESSION_SECRET = 'review-only-session-secret-at-least-32';
process.env.MASTER_ADMIN_CODE = 'review-only-owner';
const { StorageManager, storage } = await import('../server/storage.js');
const { setSession, currentSession } = await import('../server/session.js');
const { clearCachePattern } = await import('../server/services/dataCache.js');
const { default: app } = await import('../server/index.js');
const realFetch = globalThis.fetch;

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'picks-security-review-'));
  const previous = storage.file;
  storage.file = path.join(dir, 'accounts.json');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    storage.file = previous;
    clearCachePattern('');
    await rm(dir, { recursive: true, force: true });
  });
  const user = await storage.upsertGoogleUser({ googleId: 'review-user', email: 'review@example.invalid' });
  let cookie;
  setSession({ cookie: (name, value) => { cookie = name + '=' + value; } }, {
    userId: user.id, role: user.role, expires: user.expires
  });
  return {
    user, cookie,
    request: (url, body) => realFetch(`http://127.0.0.1:${server.address().port}` + url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { cookie, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
  };
}

function provider(t) {
  clearCachePattern('');
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).includes('espn.com')) return new Response(JSON.stringify({ events: [] }));
    return realFetch(url, init);
  });
}

test('trial ends at exactly 72 hours and every protected API rejects the original cookie', async t => {
  let now = Date.parse('2026-09-30T12:00:00.000Z');
  t.mock.method(Date, 'now', () => now);
  const { user, cookie, request } = await fixture(t);
  const expires = Date.parse(user.trialExpiresAt);
  assert.equal(expires - now, 72 * 3600000);
  now = expires - 1;
  assert.equal((await currentSession({ headers: { cookie } })).isTrial, true);
  now = expires;
  assert.equal((await currentSession({ headers: { cookie } })).trialExpired, true);
  const session = await (await request('/api/auth/session')).json();
  assert.equal(session.valid, false);
  assert.equal(session.daysRemaining, 0);
  for (const endpoint of ['/api/matches', '/api/matches/live-sync', '/api/matches/review/ai-analysis', '/api/boost', '/api/goal', '/api/btts', '/api/parlays/daily-ai', '/api/parlays/calculate', '/api/admin/codes', '/api/settings']) {
    const response = await request(endpoint, endpoint.endsWith('ai-analysis') || endpoint.endsWith('calculate') ? {} : undefined);
    assert.equal(response.status, 403, endpoint);
    assert.equal((await response.json()).trialExpired, true);
  }
  const relogin = await storage.upsertGoogleUser({ googleId: user.googleId, email: user.email });
  assert.equal(relogin.trialExpiresAt, user.trialExpiresAt);
  assert.equal(relogin.trialExpired, true);
});

test('deleting and recreating an identity cannot restart its trial or restore consumed VIP', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'picks-trial-history-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let now = Date.parse('2026-09-30T12:00:00.000Z');
  t.mock.method(Date, 'now', () => now);
  const db = new StorageManager(path.join(dir, 'accounts.json'));
  const original = await db.upsertGoogleUser({ googleId: 'original-sub', email: 'deleted@example.invalid', name: 'Deleted Person' });
  now += 86400000;
  await db.deleteUserData(original.id);
  assert.equal(await db.getUser(original.id), undefined);
  const raw = JSON.stringify(await db.load());
  assert.equal(raw.includes(original.email), false);
  assert.equal(raw.includes(original.googleId), false);
  assert.equal(raw.includes(original.name), false);
  const recreated = await new StorageManager(db.file).upsertGoogleUser({ googleId: 'new-firebase-sub', email: original.email });
  assert.notEqual(recreated.id, original.id);
  assert.equal(recreated.trialExpiresAt, original.trialExpiresAt);
  now = Date.parse(original.trialExpiresAt);
  await db.deleteUserData(recreated.id);
  const expired = await db.upsertGoogleUser({ googleId: 'third-sub', email: original.email });
  assert.equal(expired.isTrial, false);
  await db.createCode({ code: 'REVIEW-VIP', durationDays: 1 });
  assert.equal((await db.redeemUserCode({ userId: expired.id, code: 'REVIEW-VIP' })).success, true);
  await db.deleteUserData(expired.id);
  const afterVip = await db.upsertGoogleUser({ googleId: 'fourth-sub', email: original.email });
  assert.equal(afterVip.isTrial, false);
  assert.equal(afterVip.isVip, false);
  assert.equal((await db.redeemUserCode({ userId: afterVip.id, code: 'REVIEW-VIP' })).success, false);
  const earlyVip = await db.upsertGoogleUser({ googleId: 'early-vip', email: 'early-vip@example.invalid' });
  await db.createCode({ code: 'EARLY-VIP', durationDays: 1 });
  await db.redeemUserCode({ userId: earlyVip.id, code: 'EARLY-VIP' });
  await db.deleteUserData(earlyVip.id);
  const earlyReturn = await db.upsertGoogleUser({ googleId: 'new-early-vip', email: earlyVip.email });
  assert.equal(earlyReturn.isTrial, false, 'Deleting VIP during the first 72 hours must not restore the trial');
  assert.equal(earlyReturn.hasRedeemedVip, true);
  const separate = await db.upsertGoogleUser({ googleId: 'separate-new-user', email: 'separate@example.invalid' });
  assert.equal(separate.isTrial, true, 'A different identity still receives its first trial');
});

test('analysis rejects a browser-invented fixture when it does not exist in the provider feed', async t => {
  const { request } = await fixture(t);
  provider(t);
  const response = await request('/api/matches/fabricated-review/ai-analysis', {
    match: { id: 'fabricated-review', source: 'ESPN', status: 'SCHEDULED', kickoff: new Date().toISOString(),
      homeTeam: { name: 'Invented Home', gamesPlayed: 10, goalsFor: 50, goalsAgainst: 1 },
      awayTeam: { name: 'Invented Away', gamesPlayed: 10, goalsFor: 1, goalsAgainst: 50 } }
  });
  // Not an ESPN fixture identifier: rejected before any provider or AI work.
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.match, undefined);
  assert.equal(body.report, undefined);
  const wellFormed = await request('/api/matches/espn-999999999999/ai-analysis', { match: { id: 'espn-999999999999', status: 'SCHEDULED' } });
  assert.equal(wellFormed.status, 404);
  const missing = await wellFormed.json();
  assert.equal(missing.match, undefined);
  assert.equal(missing.report, undefined);
});

test('all specialized feeds reject invalid filters instead of returning unrelated fixtures', async t => {
  const { request } = await fixture(t);
  provider(t);
  for (const route of ['/api/boost', '/api/goal', '/api/btts', '/api/matches/boost', '/api/matches/goal', '/api/matches/btts']) {
    for (const query of ['timezone=Invalid%2FZone', 'timeframe=not-a-date', 'league=a&league=b']) {
      assert.equal((await request(route + '?' + query)).status, 400, route + '?' + query);
    }
  }
});
