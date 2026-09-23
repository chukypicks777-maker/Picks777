import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

process.env.CUSTOM_AI_API_KEY = '';
process.env.UPSTASH_REDIS_REST_URL = '';
process.env.UPSTASH_REDIS_REST_TOKEN = '';
process.env.VERCEL = '';
process.env.MASTER_ADMIN_CODE = 'DeportePicksTestMaster';
process.env.SESSION_SECRET = 'test-only-secret-session-google-picks-2026';

// The identity provider is mocked; client-supplied profiles remain rejected by production code.
const realFetch = globalThis.fetch;
const identities = new Map();
let identityId = 0;
globalThis.fetch = async (url, init = {}) => {
  if (String(url).startsWith('https://oauth2.googleapis.com/tokeninfo')) {
    const token = new URL(url).searchParams.get('id_token'), user = identities.get(token);
    return new Response(JSON.stringify(user ? { sub: user.id, email: user.email, name: user.name, picture: user.picture,
      aud: 'test-google-client', iss: 'https://accounts.google.com', email_verified: 'true', exp: Math.floor(Date.now()/1000)+3600 } : {}), { status: user ? 200 : 401 });
  }
  if (String(url).startsWith('https://identitytoolkit.googleapis.com')) return new Response('{}', { status: 401 });
  if (String(url).includes('espn.com')) throw new Error('Offline test');
  if (String(url).includes('/api/auth/google') && init.body) {
    const body = JSON.parse(init.body);
    if (body.demoUser) { const token = 'verified-test-'+(++identityId); identities.set(token, body.demoUser); init={...init, body:JSON.stringify({credential:token})}; }
  }
  return realFetch(url,init);
};
process.env.GOOGLE_CLIENT_ID = 'test-google-client';
const { storage } = await import('../server/storage.js');
const { default: app } = await import('../server/index.js');

test('Google registration grants 3-day trial and preserves original expiration on re-login', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'picks-google-trial-'));
  const originalFile = storage.file;
  storage.file = path.join(directory, 'access.json');

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;

  const request = (url, body, cookie = '') => fetch(base + url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  try {
    // 1. Initial Google registration
    const googleUser = {
      id: 'google-sub-12345',
      email: 'testuser@gmail.com',
      name: 'Roberto Picks',
      picture: 'https://lh3.googleusercontent.com/a/test-avatar'
    };

    const res = await request('/api/auth/google', { demoUser: googleUser });
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.success, true);
    assert.equal(data.valid, true);
    assert.equal(data.isTrial, true);
    assert.equal(data.trialExpired, false);
    assert.equal(data.daysRemaining, 3);
    assert.equal(data.user.email, 'testuser@gmail.com');
    assert.equal(data.user.name, 'Roberto Picks');
    assert.equal(data.user.plan, 'Prueba 3 Días');

    const cookie = res.headers.get('set-cookie').split(';')[0];

    // 2. Can access protected endpoint during trial
    const matchesRes = await request('/api/matches', null, cookie);
    assert.ok([200, 503].includes(matchesRes.status), `Expected 200 or 503 but got ${matchesRes.status}`);
    assert.notEqual(matchesRes.status, 401);
    assert.notEqual(matchesRes.status, 403);

    // 3. Re-logging in with same Google user preserves trialExpiresAt
    const originalExpires = data.user.expiresAt;
    const relogin = await request('/api/auth/google', { demoUser: googleUser });
    const reloginData = await relogin.json();
    assert.equal(reloginData.user.expiresAt, originalExpires);
  } finally {
    await new Promise(resolve => server.close(resolve));
    storage.file = originalFile;
    await rm(directory, { recursive: true, force: true });
  }
});

test('Expired 3-day trial blocks protected routes and unlocks upon valid VIP code redemption', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'picks-google-expire-'));
  const originalFile = storage.file;
  storage.file = path.join(directory, 'access.json');

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;

  const request = (url, body, cookie = '') => fetch(base + url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  try {
    // 1. Create a VIP code first
    const ownerLogin = await request('/api/auth/verify-code', { code: 'DeportePicksTestMaster', username: 'Owner' });
    const ownerCookie = ownerLogin.headers.get('set-cookie').split(';')[0];
    const batchRes = await request('/api/admin/codes/batch', { count: 1, durationDays: 30, prefix: 'VIP' }, ownerCookie);
    const { codes } = await batchRes.json();
    const vipCode = codes[0].code;

    // 2. Register user with Google
    const googleUser = {
      id: 'google-sub-expired',
      email: 'expireduser@gmail.com',
      name: 'Expired Trial User'
    };
    const regRes = await request('/api/auth/google', { demoUser: googleUser });
    const regData = await regRes.json();
    assert.equal(regData.success, true);
    let userCookie = regRes.headers.get('set-cookie').split(';')[0];

    // Verify trial is active initially (passes auth)
    const initialMatchesRes = await request('/api/matches', null, userCookie);
    assert.ok([200, 503].includes(initialMatchesRes.status));
    assert.notEqual(initialMatchesRes.status, 401);
    assert.notEqual(initialMatchesRes.status, 403);

    // 3. Artificially expire the trial in storage (simulate 3 days passing)
    await storage.transaction(db => {
      const u = db.users.find(x => x.email === 'expireduser@gmail.com');
      u.trialExpiresAt = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
      u.role = 'expired';
    });

    // 4. Session check reflects expired trial
    const checkRes = await request('/api/auth/check-session', {}, userCookie);
    const checkData = await checkRes.json();
    assert.equal(checkData.valid, false);
    assert.equal(checkData.trialExpired, true);

    // 5. Protected route is blocked with 403 Forbidden!
    const blockedRes = await request('/api/matches', null, userCookie);
    assert.equal(blockedRes.status, 403);
    const blockedData = await blockedRes.json();
    assert.equal(blockedData.trialExpired, true);

    // 6. Redeem invalid code fails
    const invalidRedeem = await request('/api/auth/redeem-code', { code: 'FAKE-CODE-123' }, userCookie);
    assert.equal(invalidRedeem.status, 400);

    // 7. Redeem valid VIP code restores access and upgrades plan to VIP
    const redeemRes = await request('/api/auth/redeem-code', { code: vipCode }, userCookie);
    assert.equal(redeemRes.status, 200);
    const redeemData = await redeemRes.json();
    assert.equal(redeemData.valid, true);
    assert.equal(redeemData.user.plan, 'VIP');
    assert.equal(redeemData.daysRemaining, 30);

    userCookie = redeemRes.headers.get('set-cookie').split(';')[0];

    // 8. Protected routes are accessible again
    const restoredRes = await request('/api/matches', null, userCookie);
    assert.ok([200, 503].includes(restoredRes.status));
    assert.notEqual(restoredRes.status, 401);
    assert.notEqual(restoredRes.status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
    storage.file = originalFile;
    await rm(directory, { recursive: true, force: true });
  }
});

test('Master Admin Code can be redeemed to grant Owner privileges to Google user', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'picks-google-owner-'));
  const originalFile = storage.file;
  storage.file = path.join(directory, 'access.json');

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;

  const request = (url, body, cookie = '') => fetch(base + url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  try {
    const regRes = await request('/api/auth/google', {
      demoUser: { id: 'google-sub-admin', email: 'admin@deportepicks.com', name: 'Admin Guy' }
    });
    let cookie = regRes.headers.get('set-cookie').split(';')[0];

    const redeemRes = await request('/api/auth/redeem-code', { code: 'DeportePicksTestMaster' }, cookie);
    assert.equal(redeemRes.status, 200);
    const data = await redeemRes.json();
    assert.equal(data.isAdmin, true);
    assert.equal(data.user.plan, 'Owner');

    cookie = redeemRes.headers.get('set-cookie').split(';')[0];
    const adminRes = await request('/api/admin/codes', null, cookie);
    assert.equal(adminRes.status, 200);
  } finally {
    await new Promise(resolve => server.close(resolve));
    storage.file = originalFile;
    await rm(directory, { recursive: true, force: true });
  }
});

test('Upgrading active trial to VIP and logout clearing session', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'picks-google-upgrade-'));
  const originalFile = storage.file;
  storage.file = path.join(directory, 'access.json');

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;

  const request = (url, body, cookie = '') => fetch(base + url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  try {
    // 1. Create a 60-day VIP code
    const ownerLogin = await request('/api/auth/verify-code', { code: 'DeportePicksTestMaster', username: 'Owner' });
    const ownerCookie = ownerLogin.headers.get('set-cookie').split(';')[0];
    const batchRes = await request('/api/admin/codes/batch', { count: 1, durationDays: 60, prefix: 'VIP60' }, ownerCookie);
    const { codes } = await batchRes.json();
    const vipCode = codes[0].code;

    // 2. User registers with Google (active 3-day trial)
    const regRes = await request('/api/auth/google', {
      demoUser: { id: 'google-active-trial', email: 'upgrader@gmail.com', name: 'Active Trial User' }
    });
    let userCookie = regRes.headers.get('set-cookie').split(';')[0];
    const initialSession = await regRes.json();
    assert.equal(initialSession.isTrial, true);
    assert.equal(initialSession.user.plan, 'Prueba 3 Días');

    // 3. Redeem invalid or empty code fails
    const emptyRedeem = await request('/api/auth/redeem-code', { code: '' }, userCookie);
    assert.equal(emptyRedeem.status, 400);

    // 4. Upgrade to VIP while still on trial
    const upgradeRes = await request('/api/auth/redeem-code', { code: vipCode }, userCookie);
    assert.equal(upgradeRes.status, 200);
    const upgraded = await upgradeRes.json();
    assert.equal(upgraded.user.plan, 'VIP');
    assert.equal(upgraded.daysRemaining, 60);

    userCookie = upgradeRes.headers.get('set-cookie').split(';')[0];

    // 5. Logout
    const logoutRes = await request('/api/auth/logout', {}, userCookie);
    assert.equal(logoutRes.status, 200);
    const expiredCookie = logoutRes.headers.get('set-cookie').split(';')[0];

    // 6. Accessing protected endpoint without cookie returns 401
    const blockedRes = await request('/api/matches', null, expiredCookie);
    assert.equal(blockedRes.status, 401);
  } finally {
    await new Promise(resolve => server.close(resolve));
    storage.file = originalFile;
    await rm(directory, { recursive: true, force: true });
  }
});

test('Owner privileges and MASTER code persist across subsequent Google logins', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'picks-owner-persist-'));
  const originalFile = storage.file;
  storage.file = path.join(directory, 'access.json');

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;

  const request = (url, body, cookie = '') => fetch(base + url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  try {
    // 1. Initial Google registration
    const googleUser = { id: 'google-owner-persist', email: 'owner@picks.com', name: 'Owner Roberto' };
    const regRes = await request('/api/auth/google', { demoUser: googleUser });
    let cookie = regRes.headers.get('set-cookie').split(';')[0];

    // 2. Redeem Master code
    const redeemRes = await request('/api/auth/redeem-code', { code: 'DeportePicksTestMaster' }, cookie);
    assert.equal(redeemRes.status, 200);
    const redeemedData = await redeemRes.json();
    assert.equal(redeemedData.isAdmin, true);

    cookie = redeemRes.headers.get('set-cookie').split(';')[0];

    // 3. Subsequent Google login preserves Owner role and MASTER vipCode
    const reloginRes = await request('/api/auth/google', { demoUser: googleUser });
    assert.equal(reloginRes.status, 200);
    const reloginData = await reloginRes.json();
    assert.equal(reloginData.isAdmin, true);
    assert.equal(reloginData.role, 'owner');
    assert.equal(reloginData.user.plan, 'Owner');
    assert.equal(reloginData.daysRemaining, 365);

    const reloginCookie = reloginRes.headers.get('set-cookie').split(';')[0];
    const adminCheck = await request('/api/admin/codes', null, reloginCookie);
    assert.equal(adminCheck.status, 200);
  } finally {
    await new Promise(resolve => server.close(resolve));
    storage.file = originalFile;
    await rm(directory, { recursive: true, force: true });
  }
});

test('Re-login after trial has expired remains expired and blocked', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'picks-relogin-expired-'));
  const originalFile = storage.file;
  storage.file = path.join(directory, 'access.json');

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;

  const request = (url, body, cookie = '') => fetch(base + url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  try {
    const googleUser = { id: 'google-expired-persist', email: 'alreadyexpired@picks.com', name: 'Expired User' };
    const regRes = await request('/api/auth/google', { demoUser: googleUser });
    assert.equal(regRes.status, 200);

    // Artificially expire the trial
    await storage.transaction(db => {
      const u = db.users.find(x => x.email === 'alreadyexpired@picks.com');
      u.trialExpiresAt = new Date(Date.now() - 86400000).toISOString();
      u.role = 'expired';
    });

    // Re-login with Google
    const reloginRes = await request('/api/auth/google', { demoUser: googleUser });
    const reloginData = await reloginRes.json();
    assert.equal(reloginData.trialExpired, true);
    assert.equal(reloginData.valid, false);
    assert.equal(reloginData.daysRemaining, 0);

    const reloginCookie = reloginRes.headers.get('set-cookie').split(';')[0];
    const blockedRes = await request('/api/matches', null, reloginCookie);
    assert.equal(blockedRes.status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
    storage.file = originalFile;
    await rm(directory, { recursive: true, force: true });
  }
});
