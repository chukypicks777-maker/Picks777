// Read-only provider samples. Never reads users, credentials or production Redis.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
const { encodeCache, decodeCache } = await import('../server/services/cacheCodec.js');
const { compactHistoricalSummary, readHistoricalSummary } = await import('../server/services/verifiedStats.js');
const { parseMlbGame } = await import('../server/services/baseballDataService.js');
const { SPORT_LEAGUES } = await import('../src/constants/leagues.js');
const { ACCESS_READ_SCRIPT } = await import('../server/storageReads.js');
const { executeLua } = await import('../tests/luaRedisFixture.js');
const { createHash } = await import('node:crypto');

const samples = [];
const bytes = value => Buffer.byteLength(JSON.stringify(value));
async function source(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
  return response.json();
}
async function measure(name, sourceUrl, original, compact = original) {
  const expires = Date.now() + 60000;
  const oldStored = JSON.stringify({ value: original, expires });
  const encoded = await encodeCache({ value: compact, expires });
  if (!encoded.stored) throw new Error('Provider sample exceeds cache size limit');
  assert.deepEqual((await decodeCache(encoded.stored)).envelope.value, JSON.parse(JSON.stringify(compact)));
  const before = bytes(['SET', 'sample', oldStored, 'EX', 60]) + bytes({ result: oldStored });
  const after = bytes(['SET', 'sample', encoded.stored, 'EX', 60]) + bytes({ result: encoded.stored });
  samples.push({ name, sourceUrl, originalBytes: bytes(original), compactBytes: bytes(compact),
    redisWritePlusReadBeforeBytes: before, redisWritePlusReadAfterBytes: after,
    reductionPercent: Number((100 * (1 - after / before)).toFixed(2)), lossless: true });
}

// A completed football day provides stable historical statistics for comparison.
const scoreboardUrl = 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=20250921&limit=100';
const scoreboard = await source(scoreboardUrl);
await measure('Football scoreboard: compression', scoreboardUrl, scoreboard);
const event = scoreboard.events?.find(item => item.competitions?.[0]?.status?.type?.completed);
if (event) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/summary?event=${event.id}`;
  const summary = await source(url), compact = compactHistoricalSummary(summary);
  for (const team of summary.header?.competitions?.[0]?.competitors || []) {
    assert.deepEqual(readHistoricalSummary(compact, team.id, Infinity), readHistoricalSummary(summary, team.id, Infinity));
  }
  await measure('Football historical summary: selection and compression', url, summary, compact);
}
const mlbUrl = 'https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=2026-09-20&endDate=2026-10-07&hydrate=linescore';
const schedule = await source(mlbUrl), fetchedAt = new Date().toISOString();
const league = SPORT_LEAGUES.beisbol.find(item => item.id === 'mlb');
const matches = schedule.dates.flatMap(day => day.games || []).map(game => parseMlbGame(game, league, fetchedAt)).filter(Boolean);
await measure('MLB schedule: normalized fixtures and compression', mlbUrl, { schedule, fetchedAt }, { matches, fetchedAt });
const accounts = { users: Array.from({ length: 5 }, (_, i) => ({ id: `account-${i}`, googleId: `google-${i}`, email: `account-${i}@example.invalid`,
  name: `Fixture ${i}`, picture: 'https://example.invalid/avatar', devices: [], trialExpiresAt: '2026-10-09T00:00:00Z', vipCode: `VIP-${i}`, hasRedeemedVip: true })),
  codes: Array.from({ length: 5 }, (_, i) => ({ code: `VIP-${i}`, claimedUserId: `account-${i}`, isClaimed: true, expiresAt: '2026-11-01T00:00:00Z', devices: [] })),
  revokedSessions: {}, aiConfig: { apiKey: 'isolated-fake-credential', selectedModel: 'fixture-model' } };
const full = JSON.stringify(accounts), key = 'picks:v2:access';
const compactSession = executeLua(ACCESS_READ_SCRIPT, [key], ['session', 'fixture-session', 'account-0'], () => full);
const sessionBefore = 3 * (bytes(['GET', key]) + bytes({ result: full }));
const sessionAfter = bytes(['EVALSHA', createHash('sha1').update(ACCESS_READ_SCRIPT).digest('hex'), 1, key, 'session', 'fixture-session', 'account-0']) + bytes({ result: compactSession });
const sessionFixture = { accounts: 5, realUsers: false, beforeReads: 3, afterReads: 1, steadyStateBeforeBytes: sessionBefore,
  steadyStateAfterBytes: sessionAfter, reductionPercent: Number((100 * (1 - sessionAfter / sessionBefore)).toFixed(2)),
  note: 'Isolated five-account VIP fixture. First use or SCRIPT FLUSH reloads the Lua body once.' };
const report = { checkedAt: new Date().toISOString(), samples, sessionFixture,
  conclusion: 'Measured payload savings on these provider samples and a synthetic five-account fixture, not a monthly traffic forecast. Production Redis is suspended and was not accessed.' };
await fs.mkdir('artifacts', { recursive: true });
await fs.writeFile('artifacts/redis-bandwidth-measurement-2026-10-07.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
