import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { solvePoissonLambdaFromUnder25, deriveCalibratedPoissonModel } from '../server/services/probabilityModel.js';
import { fillPoissonGoalLadder, getCoherentPredictedScore, calculateTeamDetailedStats } from '../src/utils/mathProbabilities.js';
import { parseEspnEvent } from '../server/services/footballDataService.js';
import { generateAiMatchReport } from '../server/services/aiService.js';

test('Arsenal vs Lille Champions League early stage: deriveCalibratedPoissonModel derives coherent ladder and predicted score', () => {
  const rawProbs = { over25: 59, under25: 41, homeWin: 52, draw: 26, awayWin: 22 };
  const home = { name: 'Arsenal', shortName: 'ARS', gamesPlayed: 1, goalsFor: 2, goalsAgainst: 0 };
  const away = { name: 'Lille', shortName: 'LIL', gamesPlayed: 1, goalsFor: 1, goalsAgainst: 1 };
  const odds = { homeWin: 1.80, draw: 3.50, awayWin: 4.50, over25: 1.70, under25: 2.10 };

  const model = deriveCalibratedPoissonModel(rawProbs, home, away, odds);
  assert.ok(model, 'Model must be successfully derived');
  assert.ok(model.predictedScore, 'Predicted score must not be null');
  assert.match(model.predictedScore, /^\d+\s*-\s*\d+$/, 'Score must be in "H - A" format');

  const p = model.probabilities;
  assert.ok(p.over05 > p.over15, 'Goal ladder must be strictly monotonic: over05 > over15');
  assert.ok(p.over15 > p.over25, 'Goal ladder must be strictly monotonic: over15 > over25');
  assert.ok(p.over25 > p.over35, 'Goal ladder must be strictly monotonic: over25 > over35');
  assert.ok(p.over35 > p.over45, 'Goal ladder must be strictly monotonic: over35 > over45');

  for (const line of ['05', '15', '25', '35', '45']) {
    assert.ok(Number.isFinite(p[`over${line}`]), `over${line} must be finite`);
    assert.ok(Number.isFinite(p[`under${line}`]), `under${line} must be finite`);
    assert.ok(Math.abs(p[`over${line}`] + p[`under${line}`] - 100) < 1e-4, `Line ${line} must sum to 100%`);
  }
});

test('fillPoissonGoalLadder fills missing lines when over25 is 59%', () => {
  const partialProbs = { over25: 59, under25: 41, homeWin: 52, draw: 26, awayWin: 22 };
  const filled = fillPoissonGoalLadder(partialProbs);

  assert.equal(filled.over25, 59);
  assert.equal(filled.under25, 41);
  assert.ok(filled.over05 >= 90, 'Over 0.5 must be >= 90% when Over 2.5 is 59%');
  assert.ok(filled.over15 >= 70, 'Over 1.5 must be >= 70% when Over 2.5 is 59%');
  assert.ok(filled.over35 <= 45, 'Over 3.5 must be <= 45% when Over 2.5 is 59%');
  assert.ok(filled.over45 <= 25, 'Over 4.5 must be <= 25% when Over 2.5 is 59%');

  // Verify complementary lines
  assert.equal(filled.over05 + filled.under05, 100);
  assert.equal(filled.over15 + filled.under15, 100);
  assert.equal(filled.over35 + filled.under35, 100);
  assert.equal(filled.over45 + filled.under45, 100);
});

test('getCoherentPredictedScore resolves calculated score and never returns N/D for populated matches', () => {
  const match = {
    id: 'champions-arsenal-lille',
    status: 'SCHEDULED',
    homeTeam: { name: 'Arsenal', shortName: 'ARS' },
    awayTeam: { name: 'Lille', shortName: 'LIL' },
    probabilities: { over25: 59, under25: 41, homeWin: 52, draw: 26, awayWin: 22 },
    odds: { over25: 1.70, under25: 2.10, homeWin: 1.80, draw: 3.50, awayWin: 4.50 }
  };

  const score = getCoherentPredictedScore(match);
  assert.notEqual(score, 'N/D', 'Predicted score must not be N/D');
  assert.match(score, /^\d+\s*-\s*\d+$/, 'Predicted score must match digit - digit');
});

test('parseEspnEvent automatically calibrates model and predictedScore when tournament gamesPlayed < 5 but odds exist', () => {
  const clLeague = ['champions', 'UEFA Champions League', '🏆', 'uefa.champions'];
  const event = {
    id: 'cl-event-1',
    date: new Date(Date.now() + 86400000).toISOString(),
    competitions: [{
      status: { type: { state: 'pre', name: 'STATUS_SCHEDULED' } },
      competitors: [
        { homeAway: 'home', team: { id: 'arsenal', displayName: 'Arsenal' }, score: '0' },
        { homeAway: 'away', team: { id: 'lille', displayName: 'Lille' }, score: '0' }
      ],
      odds: [{
        moneyline: { home: { close: { odds: '-125' } }, draw: { close: { odds: '+250' } }, away: { close: { odds: '+350' } } },
        total: { over: { close: { line: 'o2.5', odds: '-140' } }, under: { close: { line: 'u2.5', odds: '+110' } } }
      }]
    }]
  };
  // Standings with only 1 game played in tournament
  const standings = [
    { teamId: 'arsenal', points: 3, goalsFor: 2, goalsAgainst: 0, gamesPlayed: 1 },
    { teamId: 'lille', points: 1, goalsFor: 1, goalsAgainst: 1, gamesPlayed: 1 }
  ];

  const match = parseEspnEvent(event, clLeague, standings);
  assert.ok(match.model, 'Match model should be calibrated via deriveCalibratedPoissonModel');
  assert.ok(match.probabilities.predictedScore, 'match.probabilities.predictedScore must be set');
  assert.match(match.probabilities.predictedScore, /^\d+\s*-\s*\d+$/);
  assert.ok(match.probabilities.over05 > 0, 'over05 must be populated');
  assert.ok(match.probabilities.over15 > 0, 'over15 must be populated');
  assert.ok(match.probabilities.over35 > 0, 'over35 must be populated');
  assert.ok(match.aiPick, 'aiPick must be generated');
});

test('generateAiMatchReport includes calibrated predictedScore and complete analysis for Champions League fixture', async () => {
  const match = {
    id: 'cl-arsenal-lille',
    leagueName: 'UEFA Champions League',
    status: 'SCHEDULED',
    kickoff: new Date(Date.now() + 86400000).toISOString(),
    homeTeam: { name: 'Arsenal', shortName: 'ARS', gamesPlayed: 1, goalsFor: 2, goalsAgainst: 0 },
    awayTeam: { name: 'Lille', shortName: 'LIL', gamesPlayed: 1, goalsFor: 1, goalsAgainst: 1 },
    probabilities: { over25: 59, under25: 41, homeWin: 52, draw: 26, awayWin: 22 },
    odds: { over25: 1.70, under25: 2.10, homeWin: 1.80, draw: 3.50, awayWin: 4.50 }
  };

  const report = await generateAiMatchReport(match);
  assert.ok(report.predictedScore, 'Report must have predictedScore');
  assert.match(report.predictedScore, /^\d+\s*-\s*\d+$/);
  assert.ok(report.analysisSections, 'analysisSections must be present');
  assert.ok(report.analysisSections.goalsAnalysis.includes('Poisson'), 'goalsAnalysis must discuss Poisson');
  assert.ok(report.topPick, 'topPick must be present');
});

test('solvePoissonLambdaFromUnder25 is robust against decimal (0.41) and percentage (41) inputs', () => {
  const lambdaDecimal = solvePoissonLambdaFromUnder25(0.41);
  const lambdaPercent = solvePoissonLambdaFromUnder25(41);
  assert.ok(Math.abs(lambdaDecimal - lambdaPercent) < 1e-4, 'Decimal and percentage inputs must produce identical lambda');
  assert.ok(lambdaDecimal > 3.0 && lambdaDecimal < 3.1, 'Lambda for 41% Under 2.5 should be ~3.06');
});

test('fillPoissonGoalLadder computes BTTS probabilities and preserves complementary bounds', () => {
  const partial = { over25: 59, under25: 41, homeWin: 52, awayWin: 22 };
  const filled = fillPoissonGoalLadder(partial);
  assert.ok(filled.bttsYes !== undefined, 'bttsYes must be populated');
  assert.ok(filled.bttsNo !== undefined, 'bttsNo must be populated');
  assert.equal(filled.bttsYes + filled.bttsNo, 100, 'bttsYes + bttsNo must sum to 100');
  assert.ok(filled.bttsYes >= 40 && filled.bttsYes <= 70, 'bttsYes must be in reasonable soccer range (40-70%)');
});

test('deriveCalibratedPoissonModel returns null when zero data is present without inventing numbers', () => {
  const nullModel = deriveCalibratedPoissonModel({}, {}, {}, {});
  assert.equal(nullModel, null, 'deriveCalibratedPoissonModel must return null when no data or odds exist');
});

test('Project version is consistently current release across all configuration and client manifest files', () => {
  const pkg = JSON.parse(readFileSync(path.resolve('package.json'), 'utf8'));
  const pkgLock = JSON.parse(readFileSync(path.resolve('package-lock.json'), 'utf8'));
  const appJsx = readFileSync(path.resolve('src/App.jsx'), 'utf8');
  const swJs = readFileSync(path.resolve('public/sw.js'), 'utf8');
  const mobileConfig = JSON.parse(readFileSync(path.resolve('mobile.config.json'), 'utf8'));

  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.equal(pkgLock.version, pkg.version, 'package-lock.json version must be current release');
  assert.equal(pkgLock.packages[''].version, pkg.version, 'package-lock.json root package version must be current release');
  assert.ok(appJsx.includes('v' + pkg.version), 'src/App.jsx footer must be vcurrent release');
  assert.ok(swJs.includes('picks-offline-'), 'public/sw.js must specify CACHE picks-offline-vcurrent release');
  assert.equal(mobileConfig.versionName, pkg.version, 'mobile.config.json versionName must be current release');
  assert.ok(Number.isInteger(mobileConfig.versionCode) && mobileConfig.versionCode >= 6);
});

test('Poisson pipeline rejects missing data: getCoherentPredictedScore returns N/D and sample sizes are null without inventing 1 - 1 or 5 games', () => {
  const emptyFixture = { id: 'empty-cl-match', homeTeam: { name: 'Empty Home' }, awayTeam: { name: 'Empty Away' } };
  assert.equal(getCoherentPredictedScore(emptyFixture), 'N/D', 'Empty fixture without odds or stats must return N/D, never 1 - 1');

  const modelFromOverOnly = deriveCalibratedPoissonModel({ over25: 55 }, {}, {}, {});
  assert.ok(modelFromOverOnly, 'Model should derive from over25');
  assert.equal(modelFromOverOnly.sampleSize.home, null, 'home sampleSize must be null when gamesPlayed is not provided');
  assert.equal(modelFromOverOnly.sampleSize.away, null, 'away sampleSize must be null when gamesPlayed is not provided');
  assert.equal(modelFromOverOnly.probabilities.homeWin, null, 'homeWin probability must be null when no 1X2 odds or standings exist');
});

test('Villarreal vs Napoli UCL match derives goal projections but never invents unobserved corners or cards', () => {
  const vMatch = {
    id: 'espn-401915410',
    leagueName: 'UEFA Champions League',
    status: 'SCHEDULED',
    homeTeam: { id: '102', name: 'Villarreal', shortName: 'VIL', gamesPlayed: 1, goalsFor: 2, goalsAgainst: 3 },
    awayTeam: { id: '114', name: 'Napoli', shortName: 'NAP', gamesPlayed: 1, goalsFor: 0, goalsAgainst: 1 },
    odds: { over25: 1.67, under25: 2.15, homeWin: 2.30, draw: 3.40, awayWin: 3.00 }
  };
  const model = deriveCalibratedPoissonModel({}, vMatch.homeTeam, vMatch.awayTeam, vMatch.odds);
  assert.ok(model);
  vMatch.model = model;
  vMatch.probabilities = model.probabilities;

  const homeStats = calculateTeamDetailedStats(vMatch.homeTeam, true, vMatch);
  const awayStats = calculateTeamDetailedStats(vMatch.awayTeam, false, vMatch);

  assert.ok(homeStats.over05Rate > 0, 'home over05Rate must be > 0');
  assert.ok(homeStats.over15Rate > 0, 'home over15Rate must be > 0');
  assert.equal(homeStats.cardsOver05, null);
  assert.equal(homeStats.cornerOver15, null);
  assert.equal(homeStats.cards, null);
  assert.equal(homeStats.avgCorners, null);

  assert.ok(awayStats.over05Rate > 0, 'away over05Rate must be > 0');
  assert.ok(awayStats.over15Rate > 0, 'away over15Rate must be > 0');
  assert.equal(awayStats.cardsOver05, null);
  assert.equal(awayStats.cornerOver15, null);
  assert.equal(awayStats.cards, null);
  assert.equal(awayStats.avgCorners, null);

  const score = getCoherentPredictedScore(vMatch);
  assert.notEqual(score, 'N/D');
  assert.match(score, /^\d+\s*-\s*\d+$/);
});

