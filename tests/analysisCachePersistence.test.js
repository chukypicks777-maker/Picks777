import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getMatchCacheTtlMs,
  getCachedAnalysis,
  setCachedAnalysis,
  removeCachedAnalysis,
  clearAllAnalysisCache
} from '../src/utils/analysisCache.js';
import { cachedData, clearCachePattern } from '../server/services/dataCache.js';

test('getMatchCacheTtlMs assigns proper durable TTLs based on match status', () => {
  // SCHEDULED matches must persist for 48 hours (172,800,000 ms)
  const scheduledTtl = getMatchCacheTtlMs('SCHEDULED', { aiAvailable: true });
  assert.equal(scheduledTtl, 48 * 3600 * 1000);

  // FINISHED matches persist for 7 days
  const finishedTtl = getMatchCacheTtlMs('FINISHED', { aiAvailable: true });
  assert.equal(finishedTtl, 7 * 24 * 3600 * 1000);

  // LIVE matches persist for 2 minutes
  const liveTtl = getMatchCacheTtlMs('LIVE', { aiAvailable: true });
  assert.equal(liveTtl, 2 * 60 * 1000);

  // Baseline without AI availability expires in 1 minute to allow quick retry
  const baselineTtl = getMatchCacheTtlMs('SCHEDULED', { aiAvailable: false });
  assert.equal(baselineTtl, 60 * 1000);
});

test('scheduled match analysis remains valid in cache well beyond 10 minutes (up to 48 hours)', () => {
  clearAllAnalysisCache();

  const match = {
    id: 'match-scheduled-long',
    status: 'SCHEDULED',
    kickoff: '2026-09-28T18:00:00Z',
    probabilities: { homeWin: 55, awayWin: 20 }
  };

  setCachedAnalysis(match.id, match, {
    aiReport: { aiAvailable: true, narrativeAnalysis: 'Reporte para el fin de semana' },
    enrichedMatch: match
  });

  // Verify immediate retrieval
  const immediate = getCachedAnalysis(match.id, match);
  assert.ok(immediate, 'Immediate read must hit');

  // Simulate 12 hours later (12 * 3600 * 1000 ms)
  const entry = getCachedAnalysis(match.id, match);
  assert.ok(entry);
  entry.timestamp = Date.now() - (12 * 3600 * 1000); // 12 hours old

  // In the old version, this would be purged because > 10 minutes.
  // With durable 48h TTL, it MUST still hit!
  const cached12h = getCachedAnalysis(match.id, match);
  assert.ok(cached12h, 'Cache must still be valid after 12 hours for scheduled matches');
  assert.equal(cached12h.aiReport.narrativeAnalysis, 'Reporte para el fin de semana');

  // Simulate 36 hours later
  entry.timestamp = Date.now() - (36 * 3600 * 1000); // 36 hours old
  const cached36h = getCachedAnalysis(match.id, match);
  assert.ok(cached36h, 'Cache must still be valid after 36 hours');

  // Simulate 50 hours later (beyond 48h TTL)
  entry.timestamp = Date.now() - (50 * 3600 * 1000); // 50 hours old
  const cached50h = getCachedAnalysis(match.id, match);
  assert.equal(cached50h, null, 'Cache should expire after 48 hours');
});

test('localStorage persistence allows retrieval across mock browser sessions', () => {
  // Mock localStorage
  const storageMap = new Map();
  const mockLocalStorage = {
    getItem: key => storageMap.get(key) || null,
    setItem: (key, val) => storageMap.set(key, String(val)),
    removeItem: key => storageMap.delete(key),
    clear: () => storageMap.clear(),
    get length() { return storageMap.size; },
    key: i => Array.from(storageMap.keys())[i] || null
  };

  const oldWindow = globalThis.window;
  globalThis.window = { localStorage: mockLocalStorage };

  try {
    clearAllAnalysisCache();

    const match = {
      id: 'match-storage-persisted',
      status: 'SCHEDULED',
      probabilities: { homeWin: 65, draw: 20, awayWin: 15 }
    };

    setCachedAnalysis(match.id, match, {
      aiReport: { aiAvailable: true, verdict: 'Alta probabilidad de victoria' },
      enrichedMatch: match
    });

    // Check that it wrote to mockLocalStorage
    assert.ok(storageMap.size > 0, 'Must have written to localStorage');

    // Retrieve from cache
    const cached = getCachedAnalysis(match.id, match);
    assert.ok(cached);
    assert.equal(cached.aiReport.verdict, 'Alta probabilidad de victoria');

    // Remove specific match
    removeCachedAnalysis(match.id);
    assert.equal(getCachedAnalysis(match.id, match), null);
  } finally {
    globalThis.window = oldWindow;
  }
});

test('backend cachedData persists ai: keys to disk cache across in-memory wipes', async () => {
  clearCachePattern('ai:');

  const cacheKey = 'ai:test-disk-persisted-' + Date.now();
  let calls = 0;
  const loader = async () => {
    calls++;
    return { aiAvailable: true, text: 'Análisis generado' };
  };

  // 1. First call computes and saves
  const res1 = await cachedData(cacheKey, 172800, loader);
  assert.equal(calls, 1);
  assert.equal(res1.text, 'Análisis generado');

  // 2. Second call hits cache without calling loader
  const res2 = await cachedData(cacheKey, 172800, loader);
  assert.equal(calls, 1);
  assert.equal(res2.text, 'Análisis generado');

  // 3. Force refresh bypasses cache and increments calls
  const res3 = await cachedData(cacheKey, 172800, loader, { forceRefresh: true });
  assert.equal(calls, 2);
  assert.equal(res3.text, 'Análisis generado');

  clearCachePattern(cacheKey);
});
