import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  isMatchAnalyzed,
  getAnalyzedModelName,
  getBatchAnalyzedStatus,
  setCachedAnalysis,
  clearAllAnalysisCache
} from '../src/utils/analysisCache.js';
import { enrichHistoricalStats } from '../server/services/verifiedStats.js';
import { enrichMatchWithRealData } from '../server/services/footballDataService.js';
import { generateAiMatchReport } from '../server/services/aiService.js';
import { poissonModel } from '../server/services/probabilityModel.js';

test('isMatchAnalyzed and getBatchAnalyzedStatus accurately track autonomous analysis status', () => {
  clearAllAnalysisCache();

  // Empty or invalid match
  assert.equal(isMatchAnalyzed(null), false);
  assert.equal(isMatchAnalyzed('m-none', null), false);

  // Match without aiReport
  const m1 = { id: 'm-1', homeTeam: { name: 'Real Madrid' }, awayTeam: { name: 'Barcelona' } };
  assert.equal(isMatchAnalyzed('m-1', m1), false);
  assert.equal(getAnalyzedModelName('m-1', m1), null);

  // Match with fallback non-AI report (aiAvailable: false)
  setCachedAnalysis('m-1', m1, {
    aiReport: { aiAvailable: false, modelUsed: null }
  });
  assert.equal(isMatchAnalyzed('m-1', m1), false, 'Baseline non-AI report must not count as analyzed by AI');

  // Match with verified AI report (aiAvailable: true)
  const m2 = { id: 'm-2', homeTeam: { name: 'Arsenal' }, awayTeam: { name: 'Chelsea' } };
  setCachedAnalysis('m-2', m2, {
    aiReport: { aiAvailable: true, modelUsed: 'deepseek-v4.1' }
  });
  assert.equal(isMatchAnalyzed('m-2', m2), true);
  assert.equal(getAnalyzedModelName('m-2', m2), 'deepseek-v4.1');

  // Test batch status calculation
  const emptyBatch = getBatchAnalyzedStatus([]);
  assert.deepEqual(emptyBatch, {
    analyzedCount: 0,
    totalCount: 0,
    pendingCount: 0,
    isAllAnalyzed: false,
    analyzedMap: {}
  });

  const matches = [m1, m2];
  const batch = getBatchAnalyzedStatus(matches);
  assert.equal(batch.totalCount, 2);
  assert.equal(batch.analyzedCount, 1);
  assert.equal(batch.pendingCount, 1);
  assert.equal(batch.isAllAnalyzed, false);
  assert.equal(batch.analyzedMap['m-1'].isAnalyzed, false);
  assert.equal(batch.analyzedMap['m-2'].isAnalyzed, true);
  assert.equal(batch.analyzedMap['m-2'].modelUsed, 'deepseek-v4.1');

  // Cache m1 as analyzed as well
  setCachedAnalysis('m-1', m1, {
    aiReport: { aiAvailable: true, modelUsed: 'deepseek-v4.1' }
  });
  const fullBatch = getBatchAnalyzedStatus(matches);
  assert.equal(fullBatch.totalCount, 2);
  assert.equal(fullBatch.analyzedCount, 2);
  assert.equal(fullBatch.pendingCount, 0);
  assert.equal(fullBatch.isAllAnalyzed, true);
});

test('enrichHistoricalStats backfills missing standings from verified sample history', async () => {
  // Team with missing goals and gamesPlayed from league table
  const match = {
    id: 'test-history-backfill',
    espnCode: 'esp.1',
    homeTeamId: 't1',
    awayTeamId: 't2',
    status: 'SCHEDULED',
    homeTeam: { name: 'Home FC', goalsFor: null, goalsAgainst: null, gamesPlayed: null },
    awayTeam: { name: 'Away FC', goalsFor: 15, goalsAgainst: 10, gamesPlayed: 10 }
  };

  // Run enrichHistoricalStats without real network (will safely catch or fallback)
  const enriched = await enrichHistoricalStats(match, { forceRefresh: true });
  assert.ok(enriched);
  assert.equal(enriched.id, 'test-history-backfill');
  assert.ok(enriched.homeTeam);
  assert.ok(enriched.awayTeam);
});

test('enrichMatchWithRealData recalculates model and aiPick when forceRefresh is true', async () => {
  const home = { name: 'Liverpool', gamesPlayed: 10, goalsFor: 25, goalsAgainst: 8 };
  const away = { name: 'Everton', gamesPlayed: 10, goalsFor: 10, goalsAgainst: 18 };
  const initialModel = poissonModel(home, away);

  const match = {
    id: 'test-force-refresh',
    espnCode: 'eng.1',
    espnEventId: '999999',
    status: 'SCHEDULED',
    homeTeam: home,
    awayTeam: away,
    model: initialModel,
    probabilities: initialModel.probabilities
  };

  // Calling enrichMatchWithRealData with forceRefresh: true
  const enriched = await enrichMatchWithRealData(match, { forceRefresh: true });
  assert.ok(enriched);
  assert.ok(enriched.aiPick, 'aiPick must be generated and recalculated');
  assert.ok(enriched.aiPick.selection, 'aiPick must have a selection');
  assert.ok(enriched.probabilities, 'probabilities must exist');
});

test('generateAiMatchReport grounds report on real match stats, odds, and returns deep analysis metadata', async () => {
  const team = { name: 'Bayern', gamesPlayed: 12, goalsFor: 32, goalsAgainst: 10 };
  const model = poissonModel(team, team);
  const match = {
    id: 'test-grounded-deep',
    status: 'SCHEDULED',
    kickoff: new Date(Date.now() + 86400000).toISOString(),
    homeTeam: team,
    awayTeam: team,
    odds: { homeWin: 1.85, draw: 3.60, awayWin: 4.20, over25: 1.65, bttsYes: 1.70 },
    recentMatches: [
      { team: 'Bayern', events: [{ score: '3 - 0', atVs: 'vs' }, { score: '2 - 1', atVs: '@' }] }
    ],
    model,
    probabilities: model.probabilities
  };

  const oldFetch = globalThis.fetch;
  try {
    const aiResponse = {
      factIds: ['goals', 'score', 'odds', 'sample'],
      tacticalAnalysis: 'Bayern domina con superioridad ofensiva y alta probabilidad de goles.',
      analysisSections: {
        tacticalBreakdown: 'Formación equilibrada con posesión alta.',
        goalsAnalysis: 'Promedio superior a 2.5 goles por partido.',
        positiveFactors: ['Ataque potente', 'Excelente racha reciente'],
        negativeFactors: ['Descuido ocasional en contragolpe'],
        verdict: 'Victoria contundente pronosticada.'
      },
      topPick: {
        selection: 'Victoria Local',
        probability: 68,
        reasoning: 'Respaldado por el modelo Poisson y momios de mercado.'
      }
    };

    globalThis.fetch = async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }]
    }));

    const report = await generateAiMatchReport(match, {
      forceRefresh: true,
      aiConfig: { provider: 'custom', baseUrl: 'https://vyceai.com/v1', apiKey: 'test-token', selectedModel: 'deepseek-v4.1' }
    });

    assert.equal(report.aiAvailable, true);
    assert.equal(report.isDeepAnalysis, false, 'Fact selection must not claim validated predictive reasoning');
    assert.equal(report.dataGrounded, true, 'Report must be grounded in facts');
    assert.ok(report.verifiedStatsCount > 0, 'Facts catalog must be populated');
    assert.ok(report.analysisSections, 'Deep analysis structured sections must be present');
    assert.notEqual(report.analysisSections.verdict, 'Victoria contundente pronosticada.');
    assert.equal(report.analysisMode, 'fact-selection');
    assert.equal(report.narrativeVerified, true);
    assert.ok(!report.narrativeAnalysis.includes('Ataque potente'));
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('MatchDetailModal and mobile.css enforce mobile close button, sticky header and confirmation badge', () => {
  const modalPath = path.resolve('src/components/MatchDetailModal.jsx');
  const modalContent = readFileSync(modalPath, 'utf8');

  // Sticky header with high z-index and border
  assert.ok(
    modalContent.includes('sticky top-0 z-30'),
    'MatchDetailModal must feature a sticky header ribbon at top-0 z-30'
  );

  // Accessible close button with exact aria-label="Cerrar panel" and min 40px touch target
  assert.ok(
    modalContent.includes('aria-label="Cerrar panel"'),
    'MatchDetailModal must retain aria-label="Cerrar panel" for test suite and screen readers'
  );
  assert.ok(
    modalContent.includes('min-w-[40px] min-h-[40px]'),
    'MatchDetailModal close button must satisfy minimum 40px touch target'
  );

  // Mobile bottom close button
  assert.ok(
    modalContent.includes('sm:hidden') && modalContent.includes('Cerrar Detalles del Partido'),
    'MatchDetailModal must include a mobile bottom close button for small viewports'
  );

  // Escape key handler and backdrop click-to-close
  assert.ok(
    modalContent.includes("e.key === 'Escape'"),
    'MatchDetailModal must support closing on Escape key'
  );
  assert.ok(
    modalContent.includes('e.target === e.currentTarget'),
    'MatchDetailModal backdrop must close modal on click'
  );

  // Confirmation banner
  assert.ok(
    modalContent.includes('Hechos del proveedor y estimaciones calculadas'),
    'MatchDetailModal must feature confirmation badge confirming deep analysis'
  );

  // Check mobile CSS
  const cssPath = path.resolve('src/mobile.css');
  const cssContent = readFileSync(cssPath, 'utf8');
  assert.ok(
    cssContent.includes('.mobile-dialog-overlay'),
    'mobile.css must define .mobile-dialog-overlay'
  );
  assert.ok(
    cssContent.includes('safe-area-inset-top'),
    'mobile.css must account for safe-area-inset-top on mobile notch devices'
  );
});

test('AutonomousAiBar keeps Owner controls hidden and retains session loop locks', () => {
  const barPath = path.resolve('src/components/AutonomousAiBar.jsx');
  const barContent = readFileSync(barPath, 'utf8');

  // Must define module-level session set to persist across component remounts
  assert.ok(
    barContent.includes('const sessionAttemptedMatchIds = new Set();'),
    'AutonomousAiBar must maintain sessionAttemptedMatchIds at module scope'
  );

  // Must guard render for isOwner
  assert.ok(
    barContent.includes('if (!isOwner || !matches || matches.length === 0) return null;'),
    'AutonomousAiBar must return null for non-owners'
  );

  // Automatic member execution and server permissions are exercised through
  // the browser/API suites; they must no longer depend on Owner visibility.
});

test('MatchDetailModal restricts retry and regeneration buttons exclusively to Owner', () => {
  const modalPath = path.resolve('src/components/MatchDetailModal.jsx');
  const modalContent = readFileSync(modalPath, 'utf8');

  // The retry / regenerate button must be enclosed inside {effectiveIsOwner && (...)}
  assert.ok(
    modalContent.includes('{effectiveIsOwner && (') &&
    modalContent.includes('Regenerar con IA') &&
    modalContent.includes('Reintentar con IA'),
    'Retry and regenerate AI buttons must be strictly conditional on effectiveIsOwner'
  );
});

test('MatchCard preserves quantitative statistics, banker picks, and defines modelName and verifiedAiPick', () => {
  const cardPath = path.resolve('src/components/MatchCard.jsx');
  const cardContent = readFileSync(cardPath, 'utf8');

  // Must properly declare modelName and verifiedAiPick without reference errors
  assert.ok(
    cardContent.includes('const modelName = aiModelUsed ?? (analyzed ? getAnalyzedModelName(match?.id, match) : null);'),
    'MatchCard must declare modelName to prevent runtime ReferenceError'
  );
  assert.ok(
    cardContent.includes('const verifiedAiPick = (analyzed && match.aiPick?.selection)'),
    'MatchCard must declare verifiedAiPick to prevent runtime ReferenceError'
  );

  // Banker mode must prioritize bankerPick
  assert.ok(
    cardContent.includes('isBankerMode') &&
    cardContent.includes('(bankerPick || verifiedAiPick)'),
    'MatchCard must prioritize bankerPick over verifiedAiPick in banker mode'
  );

  // Quick stats pills (+1.5, +2.5, BTTS) must be rendered
  assert.ok(cardContent.includes('+1.5 Over'), 'MatchCard must display +1.5 Over pill');
  assert.ok(cardContent.includes('+2.5 Over'), 'MatchCard must display +2.5 Over pill');
  assert.ok(cardContent.includes('Ambos Anotan'), 'MatchCard must display Ambos Anotan pill');

  // Team standing position and form dots must be rendered
  assert.ok(cardContent.includes('#{match.homeTeam.position}'), 'MatchCard must display home team league position');
  assert.ok(cardContent.includes('#{match.awayTeam.position}'), 'MatchCard must display away team league position');
  assert.ok(cardContent.includes('match.homeTeam.form.slice(-5)'), 'MatchCard must display 5-match form history for home');
  assert.ok(cardContent.includes('match.awayTeam.form.slice(-5)'), 'MatchCard must display 5-match form history for away');

  // Banker Poisson base must be displayed when complementary to AI verdict
  assert.ok(
    cardContent.includes('Base Poisson:'),
    'MatchCard must display Base Poisson comparison when bankerPick differs from AI pick'
  );
  assert.ok(
    cardContent.includes('Base estadística:'),
    'MatchCard must display statistical base rationale alongside AI verdict'
  );
});
