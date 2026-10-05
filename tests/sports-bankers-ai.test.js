import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { rankSportWinners, sportWinnerPick } from '../src/utils/sportPicks.js';
import { generateAiSportsReport, readSportsAiReport, sportsReportKey } from '../server/services/sportsAiService.js';
import { computeMatchFingerprint } from '../src/utils/analysisCache.js';
import { parseTennisEvents } from '../server/services/sportsDataService.js';
import { storage } from '../server/storage.js';
import { clearCachePattern } from '../server/services/dataCache.js';

const now = Date.now();
function match(id, probability = 70) {
  return { id, sport: 'tenis', tour: 'atp', leagueId: 'atp', leagueName: 'ATP', status: 'SCHEDULED', kickoff: new Date(now + 3600000).toISOString(),
    homeTeam: { id: 'a', name: 'Jugador A' }, awayTeam: { id: 'b', name: 'Jugador B' }, source: 'ESPN', sourceUrl: 'https://www.espn.com/tennis/', fetchedAt: new Date(now).toISOString(), odds: {},
    analysis: { kind: 'tennis', winner: { home: probability, away: 100 - probability }, firstSet: { home: 62, away: 38 }, secondSet: { home: 62, away: 38 }, sampleSize: { home: 8, away: 10 }, method: 'Modelo experimental con registros previos verificados.' } };
}

test('Banqueros ranks at most ten future winners, with away favourites, stable ties and unavailable games excluded', () => {
  const games = Array.from({ length: 13 }, (_, i) => match(`game-${i}`, 52 + i * 3));
  games.push({ ...match('away-best', 9), kickoff: new Date(now + 7200000).toISOString() });
  games.push({ ...match('finished', 99), status: 'FINISHED' }, { ...match('live', 98), status: 'LIVE' }, { ...match('cancelled', 97), status: 'CANCELLED' });
  games.push({ ...match('past', 96), kickoff: new Date(now - 1).toISOString() }, { ...match('missing', 95), analysis: { winner: { home: null, away: null } } }, { ...match('strings'), analysis: { winner: { home: '99', away: '1' } } });
  games.push(games[1]);
  const ranked = rankSportWinners(games, now);
  assert.equal(ranked.length, 10);
  assert.equal(ranked[0].id, 'away-best'); assert.equal(ranked[0].bankerPick.side, 'away');
  assert.deepEqual(ranked.map(game => game.bankerRank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(new Set(ranked.map(game => game.id)).size, 10);
  for (let i = 1; i < ranked.length; i++) assert.ok(ranked[i - 1].bankerPick.probability >= ranked[i].bankerPick.probability);
  assert.ok(ranked.every(game => !['finished', 'live', 'cancelled', 'past', 'missing', 'strings'].includes(game.id)));
  assert.deepEqual(rankSportWinners([match('z'), match('a')], now).map(game => game.id), ['a', 'z']);
  assert.equal(sportWinnerPick({ ...match('quote'), odds: { homeWin: 1.8 } }).oddsKind, 'published');
  assert.equal(sportWinnerPick(match('fair')).oddsKind, 'theoretical');
});

test('sports AI uses the configured provider, rejects fabricated numbers and shares only matching factual reports', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'picks-sports-ai-')), oldFile = storage.file;
  storage.file = path.join(directory, 'access.json');
  let calls = 0, parsedPrompt, factIds = ['winner', 'sample', 'limits'];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    calls++;
    const request = JSON.parse(options.body); parsedPrompt = request.messages.find(message => message.role === 'user').content;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ factIds, topPick: { probability: 999, odds: 888, selection: 'Inventado' }, narrative: '<script>falso</script>' }) } }] }));
  });
  try {
    await storage.updateAiConfig({ provider: 'custom', baseUrl: 'https://vyceai.com/v1', apiKey: 'isolated-test-key', selectedModel: 'test-sports-model' });
    for (const sport of ['tenis', 'beisbol', 'basquetbol']) {
      const fixture = { ...match(`ai-${sport}`), sport };
      assert.equal(await readSportsAiReport(fixture), null, 'Viewing a match cannot start AI work');
      const before = calls;
      const report = await generateAiSportsReport(fixture, { forceRefresh: true });
      assert.equal(report.aiAvailable, true); assert.equal(report.dataGrounded, true); assert.equal(report.modelUsed, 'test-sports-model');
      assert.deepEqual(report.probabilities, fixture.analysis.winner);
      assert.equal(report.topPick.probability, 70); assert.equal(report.topPick.odds, 100 / 70);
      assert.doesNotMatch(JSON.stringify(report), /999|888|Inventado|<script>/);
      assert.match(parsedPrompt, /8 partidos|8|10/);
      assert.deepEqual(await readSportsAiReport(fixture), report); assert.equal(calls, before + 1);
      const freshQuery = { ...fixture, fetchedAt: new Date(now + 30000).toISOString() };
      assert.equal(sportsReportKey(fixture), sportsReportKey(freshQuery));
      assert.deepEqual(await readSportsAiReport(freshQuery), report);
      for (const changed of [{ ...fixture, liveScore: { home: 1, away: 0 } }, { ...fixture, odds: { homeWin: 1.5 } }, { ...fixture, analysis: { ...fixture.analysis, sampleSize: { home: 9, away: 10 } } }]) {
        assert.notEqual(sportsReportKey(fixture), sportsReportKey(changed));
        assert.notEqual(computeMatchFingerprint(fixture), computeMatchFingerprint(changed));
        assert.equal(await readSportsAiReport(changed), null);
      }
    }
    factIds = ['winner', 'invented-fact'];
    const invalid = await generateAiSportsReport(match('invalid-report'), { forceRefresh: true });
    assert.equal(invalid.aiAvailable, false); assert.equal(invalid.modelUsed, null);
    assert.deepEqual(invalid.probabilities, { home: 70, away: 30 });
  } finally { clearCachePattern('ai:sports-report:v1:'); storage.file = oldFile; await rm(directory, { recursive: true, force: true }); }
});

test('tennis identity preserves published portraits and uses the real country flag when the provider omits a photo', () => {
  const competitors = [
    { id: '1', homeAway: 'home', athlete: { displayName: 'Player A', headshot: { href: 'https://a.espncdn.com/portrait.png' }, flag: { href: 'https://a.espncdn.com/arg.png', alt: 'Argentina' } } },
    { id: '2', homeAway: 'away', athlete: { displayName: 'Player B', flag: { href: 'https://a.espncdn.com/can.png', alt: 'Canadá' } } }
  ];
  const [parsed] = parseTennisEvents({ events: [{ name: 'ATP Tour', groupings: [{ grouping: { slug: 'mens-singles' }, competitions: [{ id: 'photo-fixture', date: new Date(now + 3600000).toISOString(), competitors, status: { type: { state: 'pre' } } }] }] }] }, 'atp');
  assert.equal(parsed.homeTeam.imageKind, 'portrait'); assert.equal(parsed.homeTeam.logo, competitors[0].athlete.headshot.href);
  assert.equal(parsed.awayTeam.imageKind, 'country'); assert.equal(parsed.awayTeam.logo, competitors[1].athlete.flag.href);
  assert.equal(parsed.awayTeam.country, 'Canadá');
});
