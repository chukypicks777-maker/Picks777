import { vipFixture } from './vipFixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deriveCalibratedPoissonModel } from '../server/services/probabilityModel.js';
import { calculateTeamDetailedStats, fillPoissonGoalLadder } from '../src/utils/mathProbabilities.js';
import { parseEspnEvent, LEAGUES } from '../server/services/footballDataService.js';
import { validateAiConfig } from '../server/security.js';

test('named fixtures do not create unobserved historical statistics or sample sizes', () => {
  const stats = calculateTeamDetailedStats({ name: 'Real team' }, true, { id: 'fixture', odds: { homeWin: 2 } });
  for (const key of ['cards', 'fouls', 'avgCorners', 'avgGF', 'avgGC', 'gamesPlayed', 'goalsFor', 'goalsAgainst']) assert.equal(stats[key], null);
  assert.equal(stats.sampleSizes, undefined);
  assert.equal(fillPoissonGoalLadder({ homeWin: 60 }).over25, undefined);
  assert.equal(deriveCalibratedPoissonModel({ homeWin: 60 }), null);
});

test('market model rejects invalid percentages and normalizes complete markets and complements', () => {
  assert.equal(deriveCalibratedPoissonModel({ over25: 101, homeWin: Infinity }), null);
  const model = deriveCalibratedPoissonModel({ over25: 60, under25: 60, homeWin: 60, draw: 30, awayWin: 30, bttsYes: 40, bttsNo: 80, confidence: 99 });
  const p = model.probabilities;
  assert.equal(p.homeWin + p.draw + p.awayWin, 100);
  assert.equal(p.over25 + p.under25, 100);
  assert.equal(p.bttsYes + p.bttsNo, 100);
  assert.equal(p.confidence, null);
  assert.ok(Object.values(p).every(v => v === null || Number.isFinite(v) && v >= 0 && v <= 100));
});

test('one published outcome cannot become a 100 percent favorite', () => {
  const event = { id: 'partial-odds', date: new Date(Date.now() + 86400000).toISOString(), competitions: [{
    status: { type: { state: 'pre', name: 'STATUS_SCHEDULED' } },
    competitors: [{ homeAway: 'home', team: { id: 'h', name: 'Home' } }, { homeAway: 'away', team: { id: 'a', name: 'Away' } }],
    odds: [{ moneyline: { home: { close: { odds: '-200' } } } }]
  }] };
  const match = parseEspnEvent(event, LEAGUES[0]);
  assert.equal(match.probabilities.homeWin, null);
  assert.equal(match.aiPick, null);
});

test('extreme but finite goal markets stay monotonic and impossible BTTS inputs are rejected', () => {
  const team = { gamesPlayed: 12, goalsFor: 18, goalsAgainst: 15 };
  for (const over25 of [0.1, 0.5, 1, 50, 99, 99.9]) {
    const model = deriveCalibratedPoissonModel({ over25, homeWin: 60, draw: 25, awayWin: 15 }, team, team);
    assert.ok(model);
    const p = model.probabilities;
    assert.equal(p.over25, over25);
    assert.ok(p.over15 >= p.over25 && p.over25 >= p.over35);
    assert.ok(p.bttsYes <= p.over15);
  }
  assert.equal(deriveCalibratedPoissonModel({ over25: 0.1, bttsYes: 99 }, team, team), null);
});

test('custom AI hosts cannot send requests to arbitrary domains', () => {
  assert.throws(() => validateAiConfig({ provider: 'custom', baseUrl: 'https://unapproved.example/v1' }), /no autorizado/);
  assert.throws(() => validateAiConfig({ provider: 'custom', baseUrl: 'https://vyceai.com.evil.example/v1' }), /no autorizado/);
});

test('Android release and APK require server-validated owner role', async () => {
  const { default: app } = await import('../server/index.js');
  const { storage } = await import('../server/storage.js');
  const { setSession, ownerVersion } = await import('../server/session.js');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'picks-mobile-'));
  const oldFile = storage.file; storage.file = path.join(dir, 'db.json');
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const cookie = data => { let result; setSession({ cookie: (name, value) => { result = name + '=' + value; } }, { ...data, expires: Date.now() + 60000 }); return result; };
  try {
    await storage.createCode({ code: 'MOBILE-TEST' });
    const vip = await vipFixture(storage, 'MOBILE-TEST');
    const owner = cookie({ role: 'owner', ownerVersion: ownerVersion() });
    for (const endpoint of ['/api/admin/mobile', '/api/admin/mobile/apk']) {
      assert.equal((await fetch(base + endpoint)).status, 401);
      assert.equal((await fetch(base + endpoint, { headers: { cookie: vip, 'x-admin-key': 'owner' } })).status, 403);
    }
    const response = await fetch(base + '/api/admin/mobile', { headers: { cookie: owner } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-store/);
    const release = await response.json();
    const download = await fetch(base + '/api/admin/mobile/apk', { headers: { cookie: owner } });
    assert.equal(download.status, release.available ? 200 : 404);
    if (release.available) {
      assert.match(download.headers.get('content-disposition'), /attachment/);
      const { createHash } = await import('node:crypto');
      assert.equal(createHash('sha256').update(Buffer.from(await download.arrayBuffer())).digest('hex'), release.sha256);
    }
  } finally {
    await new Promise(resolve => server.close(resolve)); storage.file = oldFile;
    await rm(dir, { recursive: true, force: true });
  }
});
