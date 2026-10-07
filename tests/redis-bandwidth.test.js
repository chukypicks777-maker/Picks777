import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { executeLua } from './luaRedisFixture.js';
import { ACCESS_READ_SCRIPT, selectAccess, normalizeAccessRead } from '../server/storageReads.js';
import { encodeCache, decodeCache, MAX_CACHE_BYTES } from '../server/services/cacheCodec.js';
import { cachedData, readCachedData, clearCachePattern } from '../server/services/dataCache.js';
import { StorageManager, storage } from '../server/storage.js';
import { setSession, readSession, currentSession, sessionIdentifier } from '../server/session.js';
import { compactHistoricalSummary, readHistoricalSummary } from '../server/services/verifiedStats.js';

function fixture(t, db = {}) {
  const keys = new Map([['picks:v2:access', JSON.stringify(db)]]), scripts = new Map(), traffic = [];
  const previous = { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN };
  process.env.KV_REST_API_URL = 'https://bandwidth-fixture.upstash.io';
  process.env.KV_REST_API_TOKEN = 'isolated-test-token';
  t.after(() => {
    process.env.KV_REST_API_URL = previous.url || '';
    process.env.KV_REST_API_TOKEN = previous.token || '';
    clearCachePattern('');
  });
  const command = (name, key, value) => {
    if (name === 'GET') return keys.get(key) ?? null;
    if (name === 'SET') { keys.set(key, value); return 'OK'; }
    throw new Error(`Unexpected Redis fixture command: ${name}`);
  };
  let unavailable = false;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, process.env.KV_REST_API_URL, 'Tests never contact a real service');
    if (unavailable) throw new Error('Fixture outage');
    const request = JSON.parse(init.body);
    if (request[0] === 'EVALSHA' && !scripts.has(request[1])) {
      traffic.push({ command: 'NOSCRIPT', requestBytes: Buffer.byteLength(init.body), responseBytes: 50 });
      return new Response(JSON.stringify({ error: 'NOSCRIPT No matching script' }), { status: 400 });
    }
    if (request[0] === 'EVAL') scripts.set(createHash('sha1').update(request[1]).digest('hex'), request[1]);
    const script = request[0] === 'EVAL' ? request[1] : request[0] === 'EVALSHA' ? scripts.get(request[1]) : null;
    const result = script ? executeLua(script, request.slice(3, 3 + request[2]), request.slice(3 + request[2]), command) : command(...request);
    const response = JSON.stringify({ result });
    traffic.push({ command: request[0], requestBytes: Buffer.byteLength(init.body), responseBytes: Buffer.byteLength(response) });
    return new Response(response);
  });
  return { keys, scripts, traffic, command, outage: value => { unavailable = value; } };
}

test('Lua access projections preserve existing records and return only the requested account', () => {
  const db = {
    users: [{ id: 'one', googleId: 'g-one', email: 'one@example.invalid', vipCode: 'VIP-ONE', devices: [] },
      { id: 'two', email: 'two@example.invalid', devices: ['device'] }],
    codes: [{ code: 'VIP-ONE', devices: [], deletedAt: null }, { code: 'DELETED', deletedAt: '2026-01-01' }],
    revokedSessions: { revoked: 1000 }, aiConfig: { apiKey: 'fixture-key' }, settings: { selectedModel: 'legacy' },
    socialSettings: { revision: 1, links: [{ id: 'telegram', url: 'https://t.me/fixture' }] }
  };
  for (const [kind, query, id] of [['session', 'valid', 'one'], ['session', 'revoked', 'one'], ['session', 'valid', 'missing'],
    ['user', 'ONE@EXAMPLE.INVALID'], ['user', 'g-one'], ['user', 'missing'], ['code', 'VIP-ONE'], ['code', 'DELETED'],
    ['users'], ['codes'], ['revoked', 'revoked'], ['revoked', 'missing'], ['ai'], ['social']]) {
    const output = executeLua(ACCESS_READ_SCRIPT, ['access'], [kind, query || '', id || ''], () => JSON.stringify(db));
    const actual = normalizeAccessRead(kind, JSON.parse(output));
    const expected = selectAccess(db, kind, query, id);
    assert.deepEqual(JSON.parse(JSON.stringify(actual ?? null)), JSON.parse(JSON.stringify(expected ?? null)), kind);
  }
  for (const kind of ['users', 'codes', 'session', 'ai', 'social']) {
    const output = executeLua(ACCESS_READ_SCRIPT, ['access'], [kind, '', ''], () => null);
    assert.deepEqual(JSON.parse(output), JSON.parse(JSON.stringify(selectAccess({}, kind) ?? null)));
  }
});

test('one compact Redis read authorizes a VIP and immediately observes revocation, deletion and outages', async t => {
  process.env.SESSION_SECRET = 'bandwidth-test-session-secret-at-least-32-characters';
  const user = { id: 'vip-account', googleId: 'vip-google', email: 'vip@example.invalid', vipCode: 'VIP-TEST', devices: [] };
  const code = { code: 'VIP-TEST', isClaimed: true, claimedUserId: user.id, expiresAt: new Date(Date.now() + 86400000).toISOString(), devices: [] };
  const db = { users: [user, ...Array.from({ length: 50 }, (_, i) => ({ id: `other-${i}`, email: `other-${i}@example.invalid`, devices: [] }))], codes: [code], aiConfig: { apiKey: 'must-stay-private' } };
  const { keys, scripts, traffic, outage } = fixture(t, db);
  await storage.getSessionAccess('warm', 'missing');
  assert.deepEqual(traffic.map(item => item.command), ['NOSCRIPT', 'EVAL']);
  traffic.length = 0;
  let cookie;
  setSession({ cookie: (name, value) => { cookie = `${name}=${value}`; } }, { userId: user.id, role: 'vip_user', expires: Date.now() + 86400000 });
  const req = { headers: { cookie } };
  assert.equal((await currentSession(req)).role, 'vip_user');
  assert.equal(traffic.length, 1);
  assert.equal(traffic[0].command, 'EVALSHA');
  assert.ok(traffic[0].requestBytes < 250);
  assert.ok(traffic[0].responseBytes < Buffer.byteLength(JSON.stringify(db)) / 5);
  db.codes[0].revoked = true; keys.set('picks:v2:access', JSON.stringify(db));
  assert.equal((await currentSession(req)).trialExpired, true);
  db.revokedSessions = { [sessionIdentifier(readSession(req))]: Date.now() + 86400000 };
  keys.set('picks:v2:access', JSON.stringify(db));
  assert.equal(await currentSession(req), null);
  scripts.clear(); assert.equal(await currentSession(req), null, 'A Redis script-cache flush reloads the script safely');
  delete db.revokedSessions; db.users = []; keys.set('picks:v2:access', JSON.stringify(db));
  assert.equal(await currentSession(req), null);
  outage(true); await assert.rejects(currentSession(req));
  outage(false); assert.equal(await currentSession(req), null);
  assert.equal(await storage.getUser('missing'), undefined);
  assert.deepEqual(await new StorageManager().getUsers(), []);
});

test('cache compression is lossless, reads legacy JSON and rejects corrupt or oversized cache data', async () => {
  const envelope = { expires: Date.now() + 60000, value: Array.from({ length: 400 }, (_, i) => ({ id: i, source: 'ESPN', team: 'Equipo Ñ', score: { home: 0, away: null }, odds: [1.5, 2.25], fetchedAt: '2026-10-07T05:00:00Z' })) };
  const encoded = await encodeCache(envelope);
  assert.ok(encoded.stored.length < encoded.bytes / 5);
  assert.deepEqual((await decodeCache(encoded.stored)).envelope, envelope);
  assert.deepEqual((await decodeCache(JSON.stringify(envelope))).envelope, envelope);
  await assert.rejects(decodeCache('picks:gzip:1:broken'));
  await assert.rejects(decodeCache('{"expires":123}'));
  await assert.rejects(decodeCache('picks:gzip:1:' + gzipSync('x'.repeat(MAX_CACHE_BYTES + 1)).toString('base64')));
  assert.equal((await encodeCache({ value: 'x'.repeat(MAX_CACHE_BYTES + 1), expires: 1 })).stored, null);
});

test('shared compressed reports survive cold reads; simultaneous misses collapse and expire without starting AI', async t => {
  const { keys, traffic, outage } = fixture(t);
  const key = 'sports:report-test', value = { aiAvailable: true, source: 'ESPN', factIds: Array.from({ length: 400 }, (_, i) => `fact-${i}`) };
  await cachedData(key, 60, async () => value);
  clearCachePattern('');
  assert.deepEqual(await readCachedData(key), value);
  const before = traffic.length;
  await Promise.all(Array.from({ length: 15 }, () => readCachedData('sports:no-report')));
  assert.equal(traffic.length, before + 1);
  assert.equal(await readCachedData('sports:no-report'), null);
  assert.equal(traffic.length, before + 1);
  let now = Date.now(); t.mock.method(Date, 'now', () => now);
  now += 15001;
  assert.equal(await readCachedData('sports:no-report'), null);
  assert.equal(traffic.length, before + 2);
  await cachedData('sports:no-report', 60, async () => value);
  assert.deepEqual(await readCachedData('sports:no-report'), value, 'A write invalidates a local miss');
  keys.set('picks:v2:cache:sports:legacy', JSON.stringify({ value: { odds: null }, expires: now + 1000 }));
  assert.deepEqual(await cachedData('sports:legacy', 60, () => { throw new Error('Must use existing cache'); }), { odds: null });
  now += 1001;
  assert.equal(await readCachedData('sports:legacy'), null, 'No stale report after expiry');
  outage(true); assert.equal(await readCachedData('sports:recover'), null);
  outage(false); keys.set('picks:v2:cache:sports:recover', JSON.stringify({ value, expires: now + 1000 }));
  assert.deepEqual(await readCachedData('sports:recover'), value, 'An outage is not cached as absence');
});

test('compact historical summaries preserve measured zeros, missing values, halves and placeholder detection', () => {
  const data = {
    header: { competitions: [{ id: 'history', date: '2026-10-01', status: { type: { completed: true } }, competitors: [
      { id: 'home', score: '2', linescores: [{ value: 0 }, { displayValue: '2' }] },
      { id: 'away', score: '0', linescores: [{ value: 0 }, { value: 0 }] }
    ] }] },
    boxscore: { teams: ['home', 'away'].map(id => ({ team: { id }, statistics: [
      { name: 'wonCorners', displayValue: '0' }, { name: 'yellowCards', value: null }, { name: 'foulsCommitted', value: 5 }
    ] })) }, commentary: 'unneeded'.repeat(10000), videos: [{ caption: 'unneeded video' }]
  };
  for (const id of ['home', 'away']) assert.deepEqual(readHistoricalSummary(compactHistoricalSummary(data), id, Date.parse('2026-10-07')), readHistoricalSummary(data, id, Date.parse('2026-10-07')));
  for (const team of data.boxscore.teams) team.statistics = Array.from({ length: 8 }, (_, i) => ({ name: i === 0 ? 'wonCorners' : `stat-${i}`, value: 0 }));
  assert.equal(readHistoricalSummary(compactHistoricalSummary(data), 'home', Date.parse('2026-10-07')).corners, null);
  assert.ok(JSON.stringify(compactHistoricalSummary(data)).length < JSON.stringify(data).length / 10);
});
