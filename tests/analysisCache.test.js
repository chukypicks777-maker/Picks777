import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeMatchFingerprint,
  getCachedAnalysis,
  setCachedAnalysis,
  removeCachedAnalysis,
  clearAllAnalysisCache
} from '../src/utils/analysisCache.js';

test('computeMatchFingerprint is immune to background polling timestamps', () => {
  const match1 = {
    id: 'match-101',
    status: 'SCHEDULED',
    liveMinute: null,
    liveScore: null,
    finalScore: null,
    probabilities: { homeWin: 52.4, awayWin: 22.1 },
    fetchedAt: '2026-09-17T01:00:00.000Z',
    lastUpdated: '2026-09-17T01:00:00.000Z'
  };

  const match2 = {
    ...match1,
    fetchedAt: '2026-09-17T01:05:25.000Z',
    lastUpdated: '2026-09-17T01:05:25.000Z'
  };

  const fp1 = computeMatchFingerprint(match1);
  const fp2 = computeMatchFingerprint(match2);

  assert.equal(fp1, fp2, 'Fingerprint must be identical when only polling timestamps change');
});

test('analysis cache persists across re-opens and polling updates', () => {
  clearAllAnalysisCache();

  const match = {
    id: 'match-202',
    status: 'SCHEDULED',
    probabilities: { homeWin: 60, awayWin: 15 },
    fetchedAt: '2026-09-17T01:00:00.000Z'
  };

  const mockReport = {
    aiAvailable: true,
    topPick: { selection: 'Victoria Local', odds: 1.65, probability: 60 }
  };
  const mockEnriched = {
    ...match,
    h2h: [{ id: 'h1', score: '2 - 0' }]
  };

  setCachedAnalysis('match-202', match, {
    aiReport: mockReport,
    enrichedMatch: mockEnriched
  });

  // Re-opening with updated fetchedAt from a background poll
  const polledMatch = {
    ...match,
    fetchedAt: '2026-09-17T01:00:25.000Z'
  };

  const cached = getCachedAnalysis('match-202', polledMatch);
  assert.ok(cached, 'Cache must be hit when match facts have not changed');
  assert.equal(cached.aiReport.topPick.selection, 'Victoria Local');
  assert.equal(cached.enrichedMatch.h2h.length, 1);
});

test('analysis cache invalidates when a live goal is scored or status changes', () => {
  clearAllAnalysisCache();

  const liveMatchBeforeGoal = {
    id: 'match-303',
    status: 'LIVE',
    liveMinute: "25'",
    liveScore: { home: 0, away: 0 },
    probabilities: { homeWin: 55, awayWin: 20 }
  };

  setCachedAnalysis('match-303', liveMatchBeforeGoal, {
    aiReport: { topPick: { selection: 'Victoria Local' } }
  });

  // Goal scored by home team!
  const liveMatchAfterGoal = {
    ...liveMatchBeforeGoal,
    liveMinute: "27'",
    liveScore: { home: 1, away: 0 }
  };

  const cachedAfterGoal = getCachedAnalysis('match-303', liveMatchAfterGoal);
  assert.equal(cachedAfterGoal, null, 'Cache must invalidate when live score changes');

  // Match finished
  const finishedMatch = {
    ...liveMatchAfterGoal,
    status: 'FINISHED',
    finalScore: { home: 1, away: 0 }
  };

  const cachedFinished = getCachedAnalysis('match-303', finishedMatch);
  assert.equal(cachedFinished, null, 'Cache must invalidate when status changes to FINISHED');
});

test('setCachedAnalysis safely merges partial updates without deleting existing report', () => {
  clearAllAnalysisCache();

  const match = { id: 'match-404', status: 'SCHEDULED' };

  // 1. Initial AI report saved
  setCachedAnalysis('match-404', match, {
    aiReport: { narrativeAnalysis: 'Análisis táctico profundo' }
  });

  // 2. Later, loadDetails completes and updates enrichedMatch only
  setCachedAnalysis('match-404', match, {
    enrichedMatch: { h2h: [{ score: '1 - 1' }] }
  });

  const entry = getCachedAnalysis('match-404', match);
  assert.ok(entry, 'Entry exists');
  assert.equal(entry.aiReport.narrativeAnalysis, 'Análisis táctico profundo', 'aiReport must not be overwritten with null');
  assert.equal(entry.enrichedMatch.h2h.length, 1, 'enrichedMatch must be present');
});

test('removeCachedAnalysis and clearAllAnalysisCache properly evict cached records', () => {
  clearAllAnalysisCache();

  const matchA = { id: 'match-A', status: 'SCHEDULED' };
  const matchB = { id: 'match-B', status: 'SCHEDULED' };

  setCachedAnalysis('match-A', matchA, { aiReport: { selection: 'A' } });
  setCachedAnalysis('match-B', matchB, { aiReport: { selection: 'B' } });

  assert.ok(getCachedAnalysis('match-A', matchA));
  assert.ok(getCachedAnalysis('match-B', matchB));

  removeCachedAnalysis('match-A');
  assert.equal(getCachedAnalysis('match-A', matchA), null, 'match-A should be removed');
  assert.ok(getCachedAnalysis('match-B', matchB), 'match-B should remain');

  clearAllAnalysisCache();
  assert.equal(getCachedAnalysis('match-B', matchB), null, 'match-B should be cleared by clearAllAnalysisCache');
});

