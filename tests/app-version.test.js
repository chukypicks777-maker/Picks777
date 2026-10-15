import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchServedBuild, isNewerBuild, APP_BUILD } from '../src/utils/appVersion.js';

test('the served build is read without cache and a different build means an update', async () => {
  let url = '', options = null;
  const fetcher = async (u, o) => { url = u; options = o; return { ok: true, json: async () => ({ build: 'abc123' }) }; };
  assert.equal(await fetchServedBuild(fetcher), 'abc123');
  assert.match(url, /^\/version\.json\?t=\d+$/); assert.equal(options.cache, 'no-store');
  assert.equal(await fetchServedBuild(async () => ({ ok: false })), null);
  assert.equal(await fetchServedBuild(async () => { throw new Error('offline'); }), null);
  assert.equal(await fetchServedBuild(async () => ({ ok: true, json: async () => ({}) })), null);
  // Outside a production build there is nothing to compare.
  assert.equal(APP_BUILD, 'dev');
  assert.equal(isNewerBuild('abc123'), false);
  assert.equal(isNewerBuild(null), false);
});
