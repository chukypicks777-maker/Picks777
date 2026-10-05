import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getMatchCacheTtlMs,
  getCachedAnalysis,
  setCachedAnalysis,
  removeCachedAnalysis,
  clearAllAnalysisCache,
  computeMatchFingerprint
} from '../src/utils/analysisCache.js';
import { cachedData, clearCachePattern } from '../server/services/dataCache.js';

test('report cache expires within five minutes and live reports within thirty seconds', () => {
  assert.equal(getMatchCacheTtlMs('SCHEDULED', { aiAvailable: true }), 300000);
  assert.equal(getMatchCacheTtlMs('FINISHED', { aiAvailable: true }), 3600000);
  assert.equal(getMatchCacheTtlMs('LIVE', { aiAvailable: true }), 30000);
  assert.equal(getMatchCacheTtlMs('SCHEDULED', { aiAvailable: false }), 60000);
  assert.equal(getMatchCacheTtlMs({ status: 'SCHEDULED', kickoff: new Date(Date.now() - 3600000).toISOString() }, { aiAvailable: true }), 30000);
});

test('a scheduled report is preserved briefly and expires before stale hours of analysis accumulate', () => {
  clearAllAnalysisCache();
  const match = { id: 'freshness-test', status: 'SCHEDULED', kickoff: new Date(Date.now() + 86400000).toISOString() };
  setCachedAnalysis(match.id, match, { aiReport: { aiAvailable: true } });
  const entry = getCachedAnalysis(match.id, match);
  entry.timestamp = Date.now() - 240000;
  assert.ok(getCachedAnalysis(match.id, match));
  entry.timestamp = Date.now() - 360000;
  assert.equal(getCachedAnalysis(match.id, match), null);
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

test('computeMatchFingerprint is identical whether probabilities are attached at root or model', () => {
  const matchA = {
    id: 'm-123',
    status: 'SCHEDULED',
    kickoff: '2026-09-30T20:00:00Z',
    probabilities: { homeWin: 60, draw: 20, awayWin: 20, over25: 65, bttsYes: 55 },
    homeTeam: { id: 'h1', name: 'Real Madrid' },
    awayTeam: { id: 'a1', name: 'Barcelona' }
  };

  const matchB = {
    id: 'm-123',
    status: 'SCHEDULED',
    kickoff: '2026-09-30T20:00:00Z',
    model: {
      probabilities: { homeWin: 60, draw: 20, awayWin: 20, over25: 65, bttsYes: 55 }
    },
    homeTeam: { id: 'h1', name: 'Real Madrid' },
    awayTeam: { id: 'a1', name: 'Barcelona' }
  };

  const fpA = computeMatchFingerprint(matchA);
  const fpB = computeMatchFingerprint(matchB);
  assert.equal(fpA, fpB, 'Fingerprints must match across root and model probability placements');
});

test('backend cachedData persists ai: keys to disk cache across in-memory wipes and isolates deletion', async () => {
  clearCachePattern('ai:');

  const cacheKey1 = 'ai:test-disk-persisted-1-' + Date.now();
  const cacheKey2 = 'ai:test-disk-persisted-2-' + Date.now();
  let calls1 = 0;
  let calls2 = 0;

  const res1 = await cachedData(cacheKey1, 172800, async () => {
    calls1++;
    return { aiAvailable: true, text: 'Reporte 1' };
  });
  const res2 = await cachedData(cacheKey2, 172800, async () => {
    calls2++;
    return { aiAvailable: true, text: 'Reporte 2' };
  });

  assert.equal(calls1, 1);
  assert.equal(calls2, 1);
  assert.equal(res1.text, 'Reporte 1');
  assert.equal(res2.text, 'Reporte 2');

  // Deleting cacheKey1 must NOT purge cacheKey2 from disk
  clearCachePattern(cacheKey1);

  // Calling cacheKey2 should STILL hit disk cache without re-invoking loader
  const hit2 = await cachedData(cacheKey2, 172800, async () => {
    calls2++;
    return { aiAvailable: true, text: 'Re-llamada no esperada' };
  });
  assert.equal(calls2, 1, 'Key 2 should still be cached');
  assert.equal(hit2.text, 'Reporte 2');

  clearCachePattern('ai:');
});
