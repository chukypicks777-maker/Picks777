import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
// Isolated test configuration; never use real provider credentials or production storage.
process.env.CUSTOM_AI_API_KEY = '';
process.env.UPSTASH_REDIS_REST_URL = '';
process.env.UPSTASH_REDIS_REST_TOKEN = '';
process.env.VERCEL = '';
process.env.MASTER_ADMIN_CODE = 'TestOwnerOnly';
process.env.SESSION_SECRET = 'test-only-session-secret-not-for-production';
const { parseEspnEvent, parseSummaryDetails, LEAGUES, americanToDecimal, getFootballFeed } = await import('../server/services/footballDataService.js');
const { poissonModel } = await import('../server/services/probabilityModel.js');
const { calculateParlay, getAiDailyParlay } = await import('../server/services/parlayEngine.js');
const { StorageManager, storage } = await import('../server/storage.js');
const { filterMatches } = await import('../server/routes/matchRoutes.js');
const { formatOdds } = await import('../src/utils/oddsFormatter.js');
const { generateAiMatchReport } = await import('../server/services/aiService.js');
const { default: app } = await import('../server/index.js');
const fixture = () => ({
  id: 'test-1', date: new Date(Date.now() + 86400000).toISOString(),
  competitions: [{ status: { type: { state: 'pre', name: 'STATUS_SCHEDULED' } }, competitors: [
    { homeAway: 'home', team: { id: '1', displayName: 'Home' }, score: '0' },
    { homeAway: 'away', team: { id: '2', displayName: 'Away' }, score: '0' }
  ] }]
});

test('missing provider data stays null; upcoming score is not 0–0', () => {
  const match = parseEspnEvent(fixture(), LEAGUES[0]);
  assert.equal(match.homeTeam.position, null);
  assert.equal(match.homeTeam.avgCorners, null);
  assert.deepEqual(match.homeTeam.form, []);
  assert.equal(match.liveScore.home, null);
  assert.equal(match.odds.homeWin, null);
  assert.equal(match.aiPick, null);
  assert.equal(match.model, null);
  assert.equal(formatOdds(null), 'N/D');
  assert.equal(formatOdds(Infinity), 'N/D');
});

test('zero goals and points are preserved; postpone is not live', () => {
  const event = fixture();
  event.competitions[0].status.type = { state: 'pre', name: 'STATUS_POSTPONED' };
  const match = parseEspnEvent(event, LEAGUES[0], [{ teamId: '1', points: 0, goalsFor: 0, goalsAgainst: 0, gamesPlayed: 5 }]);
  assert.equal(match.homeTeam.points, 0);
  assert.equal(match.homeTeam.goalsFor, 0);
  assert.equal(match.status, 'POSTPONED');
  assert.equal(match.model, null);
});

test('real odds conversion and totals keep their exact market line', () => {
  const event = fixture();
  event.competitions[0].odds = [{ provider: { name: 'Test provider' }, moneyline: { home: { close: { odds: '+150' } } }, total: { over: { close: { line: 'o3.5', odds: '-110' } } } }];
  const match = parseEspnEvent(event, LEAGUES[0]);
  assert.equal(match.odds.homeWin, 2.5);
  assert.equal(match.odds.over25, null);
  assert.equal(americanToDecimal(-200), 1.5);
  assert.equal(americanToDecimal(null), null);
});

test('Poisson is normalized, preserves zero probabilities and does not manufacture confidence or odds', () => {
  const home = { gamesPlayed: 10, goalsFor: 20, goalsAgainst: 10 };
  const away = { gamesPlayed: 10, goalsFor: 10, goalsAgainst: 20 };
  const model = poissonModel(home, away);
  const p = model.probabilities;
  assert.ok(Math.abs(p.homeWin + p.draw + p.awayWin - 100) < 1e-8);
  assert.equal(p.over25 + p.under25, 100);
  assert.equal(p.over45 + p.under45, 100);
  assert.ok(p.over45 <= p.over35 && p.over35 <= p.over25 && p.over25 <= p.over15);
  assert.equal(p.bttsYes + p.bttsNo, 100);
  assert.equal(p.confidence, null);
  assert.equal(p.cornerOver95, null);
  assert.equal(poissonModel({ ...home, gamesPlayed: 4 }, away), null);
  const earlyModel = poissonModel({ ...home, gamesPlayed: 4 }, away, 1);
  assert.ok(earlyModel && earlyModel.probabilities.homeWin > 0);
  const zero = { gamesPlayed: 5, goalsFor: 0, goalsAgainst: 0 };
  assert.equal(poissonModel(zero, zero).probabilities.draw, 100);
  assert.equal(poissonModel(zero, zero).probabilities.bttsYes, 0);
});

test('H2H only contains completed direct fixtures, deduplicated and capped at 10', () => {
  const match = parseEspnEvent(fixture(), LEAGUES[0]);
  const event = fixture();
  const historical = { id: 'history', date: new Date(Date.now() - 86400000).toISOString(), statusType: { completed: true }, competitors: event.competitions[0].competitors };
  const other = structuredClone(historical); other.id = 'other'; other.competitors[1].team.id = '3';
  const details = parseSummaryDetails({ seasonseries: [{ type: 'head-to-head', events: [historical, historical, other, { ...historical, id: 'unplayed', statusType: { completed: false } }] }], lastFiveGames: [{ team: { id: '1' }, events: [] }] }, match);
  assert.equal(details.realH2H.length, 1);
  assert.equal(details.realH2H[0].score, '0 - 0');
  assert.equal(details.realH2H[0].totalCorners, null);
  const many = Array.from({ length: 15 }, (_, i) => ({ ...historical, id: `past-${i}`, date: new Date(Date.now() - (i + 1) * 86400000).toISOString() }));
  assert.equal(parseSummaryDetails({ seasonseries: [{ type: 'head-to-head', events: many }] }, match).realH2H.length, 10);
});

test('live box scores retain genuine zero values without season-average substitution', () => {
  const match = { ...parseEspnEvent(fixture(), LEAGUES[0]), status: 'LIVE' };
  const details = parseSummaryDetails({ boxscore: { teams: [{ team: { id: '1' }, statistics: [{ name: 'wonCorners', displayValue: '0' }] }] } }, match);
  assert.equal(details.boxscore.home.corners, 0);
  assert.equal(details.boxscore.away.corners, null);
});

test('filters use the user timezone including DST tomorrow', () => {
  const matches = [{ kickoff: '2026-03-09T04:30:00Z', leagueId: 'mls', status: 'SCHEDULED', homeTeam: { name: 'A' }, awayTeam: { name: 'B' } }];
  assert.equal(filterMatches(matches, { timeframe: 'tomorrow', timezone: 'America/New_York' }, new Date('2026-03-08T06:00:00Z')).length, 1);
  assert.equal(filterMatches(matches, { timeframe: 'today', timezone: 'America/New_York' }, new Date('2026-03-08T06:00:00Z')).length, 0);
  assert.throws(() => filterMatches(matches, { timezone: 'invalid-zone' }));
});

test('parlays never fall back to fake fixtures or clamp probabilities', () => {
  assert.equal(getAiDailyParlay([]).bankerParlay, null);
  const legs = [{ matchId: 'a', odds: 2, probability: 0 }, { matchId: 'b', odds: 1.5, probability: 50 }];
  const result = calculateParlay(legs, 100);
  assert.equal(result.potentialPayout, 300);
  assert.equal(result.overallProbability, 0);
  assert.throws(() => calculateParlay([legs[0], legs[0]], 100));
  assert.throws(() => calculateParlay([{ matchId: 'a', odds: null }], 10));
  assert.throws(() => calculateParlay([], NaN));

  const futureMatch1 = {
    id: 'm-future-1',
    status: 'SCHEDULED',
    kickoff: new Date(Date.now() + 86400000).toISOString(),
    homeTeam: { name: 'Alpha' },
    awayTeam: { name: 'Beta' },
    leagueName: 'LaLiga',
    aiPick: { selection: 'Gana Alpha', probability: 75, estimatedOdds: 1.33 }
  };
  const futureMatch2 = {
    id: 'm-future-2',
    status: 'SCHEDULED',
    kickoff: new Date(Date.now() + 86400000).toISOString(),
    homeTeam: { name: 'Gamma' },
    awayTeam: { name: 'Delta' },
    leagueName: 'Premier League',
    aiPick: { selection: 'Más de 2.5 Goles', probability: 70, estimatedOdds: 1.43 }
  };
  const dailyParlay = getAiDailyParlay([futureMatch1, futureMatch2]);
  assert.ok(dailyParlay.bankerParlay != null);
  assert.equal(dailyParlay.bankerParlay.legCount, 2);
  assert.ok(dailyParlay.bankerParlay.totalDecimalOdds > 1.8);
});

test('codes persist, activate once, track sessions and revoke', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'picks-test-'));
  try {
    const db = new StorageManager(path.join(directory, 'access.json'));
    const codes = await db.generateBatchCodes({ count: 100, durationDays: 30, prefix: 'TEST' });
    assert.equal(new Set(codes.map(c => c.code)).size, 100);
    const claims = await Promise.all([db.claimCode(codes[0].code, 'One', 'device-1'), db.claimCode(codes[0].code, 'Two', 'device-2')]);
    assert.equal(claims[0].expiresAt, claims[1].expiresAt);
    assert.equal((await db.getCode(codes[0].code)).devices.length, 2);
    assert.equal((await new StorageManager(db.file).getCodes()).length, 100);
    await assert.rejects(db.generateBatchCodes({ count: -1 }));
    await assert.rejects(db.createCode({ code: codes[0].code, durationDays: 0 }));
    await db.revokeCode(codes[0].code);
    assert.equal((await db.claimCode(codes[0].code)).success, false);
    await db.deleteCode(codes[1].code);
    assert.equal((await db.getCodes()).length, 99);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('AI without credentials returns an explicitly non-AI factual report', async () => {
  const match = parseEspnEvent(fixture(), LEAGUES[0]);
  const result = await generateAiMatchReport(match);
  assert.equal(result.aiAvailable, false);
  assert.equal(result.modelUsed, null);
  assert.equal(result.predictedScore, null);
  assert.equal(result.topPick, null);
});

test('provider outage yields unavailable coverage and no example matches', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Test outage'); };
  try {
    const feed = await getFootballFeed();
    assert.equal(feed.matches.length, 0);
    assert.equal(feed.coverage.length, 8);
    assert.ok(feed.coverage.every(c => c.status === 'unavailable'));
  } finally { globalThis.fetch = original; }
});

test('HTTP session and owner flow, access persistence and revocation', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'picks-http-'));
  const originalFile = storage.file;
  storage.file = path.join(directory, 'access.json');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, body, cookie = '') => fetch(base + url, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Cookie: cookie }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    assert.equal((await request('/api/admin/codes')).status, 401);
    const activeModel = await request('/api/settings/active-model');
    assert.equal(activeModel.status, 200);
    const activeModelJson = await activeModel.json();
    assert.equal(activeModelJson.success, true);
    assert.equal(activeModelJson.apiKey, undefined);
    assert.ok(typeof activeModelJson.selectedModel === 'string');

    const login = await request('/api/auth/verify-code', { code: 'TestOwnerOnly', username: 'Owner' });
    assert.equal(login.status, 200);
    const owner = login.headers.get('set-cookie').split(';')[0];
    assert.ok((await login.json()).isAdmin);
    const loginCaseInsensitive = await request('/api/auth/verify-code', { code: 'testowneronly', username: 'Owner' });
    assert.equal(loginCaseInsensitive.status, 200);
    assert.ok((await loginCaseInsensitive.json()).isAdmin);
    const batch = await request('/api/admin/codes/batch', { count: 2, durationDays: 30, prefix: 'VIP' }, owner);
    const generated = await batch.json();
    assert.equal(generated.codes.length, 2);
    const vipLogin = await request('/api/auth/verify-code', { code: generated.codes[0].code, username: 'User' });
    const vip = vipLogin.headers.get('set-cookie').split(';')[0];
    assert.equal((await request('/api/admin/codes', null, vip)).status, 403);
    assert.equal((await request('/api/auth/check-session', {}, vip)).status, 200);
    await request(`/api/admin/codes/${generated.codes[0].code}/revoke`, {}, owner);
    assert.equal((await request('/api/matches', null, vip)).status, 401);
    assert.equal((await request('/api/admin/codes', null, `${owner}tampered`)).status, 401);

    const boostRes = await request('/api/matches/boost', null, owner);
    assert.equal(boostRes.status, 200);
    const boostJson = await boostRes.json();
    assert.equal(boostJson.success, true);
    assert.ok(Array.isArray(boostJson.matches));

    const boostAliasRes = await request('/api/boost?league=espana', null, owner);
    assert.equal(boostAliasRes.status, 200);
    const boostAliasJson = await boostAliasRes.json();
    assert.equal(boostAliasJson.success, true);

    const goalRes = await request('/api/matches/goal', null, owner);
    assert.equal(goalRes.status, 200);
    const goalJson = await goalRes.json();
    assert.equal(goalJson.success, true);
    assert.ok(Array.isArray(goalJson.matches));

    const goalAliasRes = await request('/api/goal?status=LIVE', null, owner);
    assert.equal(goalAliasRes.status, 200);
    const goalAliasJson = await goalAliasRes.json();
    assert.equal(goalAliasJson.success, true);
  } finally {
    await new Promise(resolve => server.close(resolve));
    storage.file = originalFile;
    await rm(directory, { recursive: true, force: true });
  }
});
