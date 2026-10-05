import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';

process.env.MASTER_ADMIN_CODE = 'SportsApiTestOwner';
process.env.SESSION_SECRET = 'sports-api-test-session-secret-not-for-production';
process.env.VERCEL = '';
const { default: app } = await import('../server/index.js');
const { storage } = await import('../server/storage.js');
const { clearCachePattern } = await import('../server/services/dataCache.js');

test('sports APIs require a session, keep the women feed separate, filter leagues, enrich any basketball match and report provider outages', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'picks-sports-api-'));
  const originalFile = storage.file, originalFetch = globalThis.fetch;
  storage.file = path.join(directory, 'access.json');
  let providerCalls = 0, historyCalls = 0, outage = false, womenOutage = false;
  const now = Date.now();
  const competitors = names => names.map((name, index) => ({ id: String(index + 1), homeAway: index ? 'away' : 'home', team: { id: String(index + 1), displayName: name }, score: '0' }));
  const event = names => ({ id: 'api-fixture', date: new Date(now + 3600000).toISOString(), season: { year: 2027, type: 1 }, competitions: [{ status: { type: { state: 'pre', name: 'STATUS_SCHEDULED' } }, competitors: competitors(names) }] });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const address = new URL(String(url));
    if (address.hostname === '127.0.0.1') return originalFetch(url, options);
    providerCalls++;
    if (outage) throw new Error('Simulated provider outage');
    if (womenOutage && address.pathname.includes('soccer/mex.w.1/scoreboard')) throw new Error('Women provider outage');
    let data = { events: [] };
    if (address.pathname.includes('soccer/mex.w.1/scoreboard')) data = { events: [event(['Tigres Femenil', 'América Femenil'])] };
    else if (/soccer\/[^/]+\/scoreboard/.test(address.pathname)) data = { events: [event(['Local masculino', 'Visita masculino'])] };
    else if (address.pathname.includes('/basketball/nba/scoreboard')) data = { events: [event(['Equipo A', 'Equipo B'])] };
    else if (address.pathname.includes('/basketball/nba/teams/')) {
      historyCalls++;
      const id = address.pathname.match(/teams\/(\d+)/)[1];
      data = { events: Array.from({ length: 6 }, (_, i) => {
        const fixture = event(['Equipo A', 'Equipo B']);
        fixture.id = `history-${id}-${address.searchParams.get('season')}-${i}`;
        fixture.date = new Date(now - (i + 1) * 86400000).toISOString();
        fixture.competitions[0].status.type = { state: 'post', completed: true, name: 'STATUS_FINAL' };
        fixture.competitions[0].competitors[0].score = String(95 + i * 2);
        fixture.competitions[0].competitors[1].score = String(101 + i);
        return fixture;
      }) };
    }
    else if (/tennis\/(atp|wta)\/scoreboard/.test(address.pathname)) {
      const tour = address.pathname.includes('/atp/') ? 'atp' : 'wta';
      data = { events: [{ name: 'Torneo de prueba', groupings: [{ grouping: { slug: tour === 'atp' ? 'mens-singles' : 'womens-singles' }, competitions: Array.from({ length: 7 }, (_, i) => ({
        id: `${tour}-match-${i}`, date: new Date(now + (i === 0 ? 3600000 : -i * 86400000)).toISOString(),
        status: { type: i === 0 ? { state: 'pre', name: 'STATUS_SCHEDULED' } : { state: 'post', completed: true, name: 'STATUS_FINAL' } },
        competitors: ['home', 'away'].map((side, index) => ({ id: String(index + 1), homeAway: side, athlete: { displayName: `Jugador ${index + 1}` },
          linescores: i === 0 ? [] : (index === 0 ? [6, 3, 6] : [3, 6, 4]).map(value => ({ value })) }))
      })) }] }] };
    }
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, cookie = '', body = null) => fetch(base + url, { method: body ? 'POST' : 'GET', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    assert.equal((await request('/api/sports/basquetbol')).status, 401);
    assert.equal((await request('/api/sports/basquetbol/unknown')).status, 401);
    assert.equal(providerCalls, 0);
    const login = await request('/api/auth/verify-code', '', { code: 'SportsApiTestOwner', username: 'Owner' });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    for (const endpoint of ['/api/sports/other', '/api/sports/__proto__', '/api/sports/basquetbol?timezone=invalid', '/api/sports/tenis?timeframe=next-year', '/api/sports/beisbol?league=fake', '/api/sports/basquetbol/unknown?league=fake']) assert.equal((await request(endpoint, cookie)).status, 400);
    const womenResponse = await request('/api/matches?sport=femenil', cookie);
    assert.equal(womenResponse.status, 200);
    const women = await womenResponse.json();
    assert.equal(women.coverage.length, 1); assert.equal(women.matches[0].sport, 'femenil'); assert.equal(women.matches[0].homeTeam.name, 'Tigres Femenil');
    const men = await (await request('/api/matches', cookie)).json();
    assert.ok(men.matches.some(match => match.sport === 'futbol'));
    assert.ok(men.matches.some(match => match.leagueId === 'mexico_femenil'));
    const selectedWomen = await (await request('/api/matches?league=mexico_femenil', cookie)).json();
    assert.ok(selectedWomen.matches.length > 0 && selectedWomen.matches.every(match => match.sport === 'femenil'));
    const basketball = await (await request('/api/sports/basquetbol?league=nba_preseason', cookie)).json();
    assert.ok(basketball.matches.every(match => match.leagueId === 'nba_preseason'));
    const upcoming = basketball.matches.find(match => match.status === 'SCHEDULED');
    assert.ok(upcoming);
    assert.equal(historyCalls, 0, 'Calendar must not wait for unrelated team histories');
    const detail = await (await request(`/api/sports/basquetbol/${upcoming.id}?league=nba_preseason`, cookie)).json();
    assert.equal(historyCalls, 6, 'Load only the two selected teams across three preseason years');
    assert.equal(detail.success, true); assert.ok(detail.match.analysis.sampleSize.home >= 5); assert.equal(detail.match.analysis.handicaps.home.length, 13);
    assert.ok(detail.match.analysis.handicaps.home.every(row => typeof row.probability === 'number'));
    assert.equal(detail.match.analysis.form.home.length, 5);
    await request(`/api/sports/basquetbol/${upcoming.id}?league=nba_preseason`, cookie);
    assert.equal(historyCalls, 6, 'The same report shares cached official history');
    assert.equal((await request('/api/sports/basquetbol/browser-invented-match', cookie)).status, 404);
    const tennis = await (await request('/api/sports/tenis', cookie)).json();
    const tennisMatch = tennis.matches.find(match => match.status === 'SCHEDULED' && match.tour === 'atp');
    assert.ok(tennisMatch);
    assert.equal(tennisMatch.analysis.sampleSize.home, 0, 'Do not calculate every tennis forecast before returning the calendar');
    const tennisDetail = await (await request(`/api/sports/tenis/${tennisMatch.id}?league=atp`, cookie)).json();
    assert.ok(tennisDetail.match.analysis.sampleSize.home >= 5);
    assert.ok(tennisDetail.match.analysis.winner.home > 0);
    assert.equal(tennisDetail.match.analysis.firstSet.home + tennisDetail.match.analysis.firstSet.away, 100);
    womenOutage = true; clearCachePattern('scoreboard:mexico_femenil');
    assert.equal((await request('/api/matches?league=mexico_femenil', cookie)).status, 503, 'A selected women provider outage cannot masquerade as a valid empty calendar');
    assert.equal((await request('/api/matches', cookie)).status, 200, 'Other football leagues remain available');
    clearCachePattern('sports:'); outage = true;
    const unavailable = await request('/api/sports/tenis', cookie);
    assert.equal(unavailable.status, 503); assert.deepEqual((await unavailable.json()).matches, []);
  } finally {
    clearCachePattern('sports:');
    await new Promise(resolve => server.close(resolve));
    storage.file = originalFile;
    await rm(directory, { recursive: true, force: true });
  }
});
