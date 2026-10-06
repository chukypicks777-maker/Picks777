import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { saveSportDetail, readSportDetail, saveSportsCache, readSportsCache, mergeSportDetail } from '../src/utils/sportsClient.js';
import { getBatchAnalyzedStatus } from '../src/utils/analysisCache.js';
import { isKnownFixture, isUpcomingFixture } from '../src/utils/fixtureEligibility.js';
import { relativeResultStrength } from '../server/services/sportProbabilityModel.js';
import { tennisDateRanges } from '../server/services/sportsDataService.js';
import { setCachedAnalysis, getCachedAnalysis, clearAllAnalysisCache, mergeAnalyzedMatch } from '../src/utils/analysisCache.js';

test('late football AI replies cannot overwrite a newer score, minute, participant or quote', () => {
  const original = { id: 'late-football', status: 'LIVE', minute: 20, liveScore: { home: 0, away: 0 }, odds: { homeWin: 1.8 }, homeTeam: { id: 'a' }, awayTeam: { id: 'b' } };
  const report = { aiAvailable: true }, enriched = { ...original, h2h: [] };
  for (const current of [{ ...original, minute: 22 }, { ...original, liveScore: { home: 1, away: 0 } }, { ...original, odds: { homeWin: 2.2 } }, { ...original, awayTeam: { id: 'c' } }]) {
    assert.equal(mergeAnalyzedMatch(current, enriched, report, original), current);
    assert.equal(mergeAnalyzedMatch(current, current, report, original).isAiAnalyzed, true);
  }
  assert.equal(mergeAnalyzedMatch(original, enriched, report, original).isAiAnalyzed, true);
});

test('tennis history spans a year without crossing ESPN seasons in a query, including December rollover', () => {
  assert.deepEqual(tennisDateRanges('2026-10-05', 365, 7), ['20251005-20251231', '20260101-20261012']);
  assert.deepEqual(tennisDateRanges('2026-12-29', 3, 7), ['20261226-20261231', '20270101-20270105']);
  assert.deepEqual(tennisDateRanges('2028-12-31', 365, 0), ['20280101-20281231']);
});

test('football calendar summaries keep completed reports after missing quotes are enriched, but invalidate changed known quotes', () => {
  clearAllAnalysisCache();
  const original = { id: 'football-quote-summary', status: 'SCHEDULED', odds: { homeWin: null, awayWin: 2.2 }, probabilities: { homeWin: 60 } };
  const enriched = { ...original, odds: { homeWin: 1.7, awayWin: 2.2 } };
  setCachedAnalysis(original.id, enriched, { aiReport: { aiAvailable: true }, originalMatch: original, enrichedMatch: enriched });
  assert.ok(getCachedAnalysis(original.id, original));
  assert.equal(getCachedAnalysis(original.id, { ...original, odds: { homeWin: null, awayWin: 2.5 } }), null);
  setCachedAnalysis(original.id, { ...enriched, odds: { homeWin: 1.7, awayWin: 2.5 } }, { aiReport: { aiAvailable: true }, originalMatch: original });
  assert.equal(getCachedAnalysis(original.id, original), null);
});

test('all sports retain more than 150 completed reports through long queues without accepting changed facts', t => {
  const clock = Date.now();
  for (const sport of ['beisbol', 'tenis', 'basquetbol']) {
    const matches = Array.from({ length: 300 }, (_, i) => ({ id: `${sport}-retained-${i}`, sport, status: 'SCHEDULED', kickoff: new Date(clock + 2 * 86400000).toISOString(),
      homeTeam: { id: `h${i}`, name: `Home ${i}` }, awayTeam: { id: `a${i}`, name: `Away ${i}` }, odds: {},
      analysis: { winner: { home: null, away: null } } }));
    for (const original of matches) saveSportDetail('retention-owner', sport, original, { ...original,
      analysis: { winner: { home: 60, away: 40 } }, isAiAnalyzed: true, aiReport: { aiAvailable: true, dataGrounded: true, generatedAt: new Date(clock).toISOString() } });
    saveSportsCache('retention-owner', sport, { matches, coverage: [] });
    const dateMock = t.mock.method(Date, 'now', () => clock + 12 * 3600000);
    const retained = readSportsCache('retention-owner', sport).matches.map(match => readSportDetail('retention-owner', sport, match, { allowStale: true }));
    assert.equal(retained.filter(Boolean).length, 300);
    assert.equal(getBatchAnalyzedStatus(retained).analyzedCount, 300);
    assert.equal(readSportDetail('retention-owner', sport, matches[0]), null, 'Retained work still refreshes statistics after a minute');
    assert.equal(readSportDetail('another-account', sport, matches[0], { allowStale: true }), null);
    for (const changed of [{ ...matches[0], homeTeam: { id: 'replacement', name: 'Replacement' } }, { ...matches[0], oddsProvider: 'new source' },
      { ...matches[0], odds: { homeWin: 1.9 } }, { ...matches[0], status: 'LIVE' }, { ...matches[0], kickoff: new Date(clock + 3 * 86400000).toISOString() }]) {
      assert.equal(readSportDetail('retention-owner', sport, changed, { allowStale: true }), null);
    }
    assert.equal(mergeSportDetail(retained[0], retained[0], { ...retained[0], analysis: { winner: { home: 55, away: 45 } }, aiReport: null }).aiReport, null);
    dateMock.mock.restore();
  }
});

test('unknown opponents and past fixtures never enter the automatic AI queue', () => {
  const match = { id: 'fixture', status: 'SCHEDULED', kickoff: new Date(Date.now() + 3600000).toISOString(), homeTeam: { id: 'atp-100', name: 'Player' }, awayTeam: { id: 'atp-200', name: 'Opponent' } };
  assert.ok(isUpcomingFixture(match));
  for (const opponent of [{ id: 'atp-0', name: 'TBD' }, { id: 'wta-0', name: 'Opponent' }, { id: 'abc', name: 'Por definir' }, { id: '0', name: 'TBA' }, {}]) assert.equal(isKnownFixture({ ...match, awayTeam: opponent }), false);
  assert.equal(isUpcomingFixture({ ...match, status: 'FINISHED' }), false);
  assert.equal(isUpcomingFixture({ ...match, kickoff: new Date(Date.now() - 1).toISOString() }), false);
});

function replay(match, games, now) {
  const ratings = new Map(), samples = new Map();
  const previous = [...new Map(games.map(game => [game.id, game])).values()].filter(game => game.id !== match.id && game.status === 'FINISHED' && !game.retired
    && game.tour === match.tour && Date.parse(game.kickoff) < Math.min(Date.parse(match.kickoff), now)
    && ['home', 'away'].every(side => Number.isInteger(game.finalScore?.[side]) && game.finalScore[side] >= 0))
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.id.localeCompare(b.id));
  for (const game of previous) {
    const h = game.homeTeam.id, a = game.awayTeam.id;
    const hr = ratings.get(h) || 1500, ar = ratings.get(a) || 1500;
    const adjustment = 24 * ((game.finalScore.home > game.finalScore.away ? 1 : game.finalScore.home < game.finalScore.away ? 0 : 0.5) - 1 / (1 + 10 ** ((ar - hr) / 400)));
    ratings.set(h, hr + adjustment); ratings.set(a, ar - adjustment);
    samples.set(h, (samples.get(h) || 0) + 1); samples.set(a, (samples.get(a) || 0) + 1);
  }
  const sampleSize = { home: samples.get(match.homeTeam.id) || 0, away: samples.get(match.awayTeam.id) || 0 };
  return { probability: sampleSize.home >= 5 && sampleSize.away >= 5 ? 1 / (1 + 10 ** (((ratings.get(match.awayTeam.id) || 1500) - (ratings.get(match.homeTeam.id) || 1500)) / 400)) : null, sampleSize };
}

test('indexed history matches independent chronological replay across present and historical cutoffs', () => {
  const now = Date.now(), games = Array.from({ length: 1200 }, (_, i) => ({ id: `result-${i}`, sport: 'tenis', tour: 'atp', status: 'FINISHED',
    homeTeam: { id: `p${i % 10}` }, awayTeam: { id: `p${(i + 3) % 10}` }, kickoff: new Date(now - (1200 - i) * 3600000).toISOString(), finalScore: { home: i % 3 ? 2 : 0, away: i % 3 ? 0 : 2 } }));
  const targets = [20, 500, 1000, 1400].map((offset, i) => ({ id: i === 1 ? 'result-4' : `upcoming-${i}`, sport: 'tenis', tour: 'atp', homeTeam: { id: 'p1' }, awayTeam: { id: 'p4' }, kickoff: new Date(now - (1200 - offset) * 3600000).toISOString() }));
  for (const match of targets) assert.deepEqual(relativeResultStrength(match, games, now), replay(match, games, now));
  const start = performance.now();
  for (let i = 0; i < 300; i++) relativeResultStrength({ ...targets[3], id: `upcoming-${i}` }, games, now);
  assert.ok(performance.now() - start < 1000, 'A large queue must reuse the completed history replay');
});
