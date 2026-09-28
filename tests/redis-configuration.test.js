import test from 'node:test';
import assert from 'node:assert/strict';
import { redisConfiguration, secureConfiguration } from '../server/config.js';
import { redisCommand } from '../server/services/dataCache.js';

test('Vercel KV names support secure production and Redis commands without mixing credentials', async () => {
  const keys = ['NODE_ENV', 'MASTER_ADMIN_CODE', 'SESSION_SECRET', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN'];
  const old = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const oldFetch = globalThis.fetch;
  try {
    Object.assign(process.env, { NODE_ENV: 'production', MASTER_ADMIN_CODE: 'test-owner-key-with-at-least-32-characters', SESSION_SECRET: 'test-session-key-with-at-least-32-characters', UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '', KV_REST_API_URL: 'https://fixture.upstash.io', KV_REST_API_TOKEN: 'test-token' });
    assert.equal(secureConfiguration(), true);
    globalThis.fetch = async (url, init) => {
      assert.equal(url, 'https://fixture.upstash.io');
      assert.equal(init.headers.Authorization, 'Bearer test-token');
      assert.equal(init.redirect, 'error');
      return new Response(JSON.stringify({ result: 'PONG' }));
    };
    assert.equal(await redisCommand('PING'), 'PONG');
    process.env.UPSTASH_REDIS_REST_URL = 'https://different.upstash.io';
    assert.equal(redisConfiguration().configured, false, 'A partial direct configuration must not borrow the KV token');
    assert.equal(secureConfiguration(), false);
    process.env.UPSTASH_REDIS_REST_URL = '';
    process.env.KV_REST_API_URL = 'http://fixture.upstash.io';
    assert.equal(secureConfiguration(), false);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
