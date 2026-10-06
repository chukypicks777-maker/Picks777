import { test, expect } from '@playwright/test';
import { SPORT_LEAGUES } from '../../src/constants/leagues.js';

const now = Date.now();
function fixture(sport, i) {
  const league = SPORT_LEAGUES[sport][0];
  return { id: `${sport}-loading-${i}`, sport, tour: sport === 'tenis' ? 'atp' : undefined, leagueId: league.id, leagueName: league.name,
    homeTeam: { id: `h${i}`, name: `Home ${i}`, shortName: `H${i}` }, awayTeam: { id: `a${i}`, name: `Away ${i}`, shortName: `A${i}` },
    status: 'SCHEDULED', kickoff: new Date(now + 3600000 + i * 60000).toISOString(), odds: {}, source: 'Fuente aislada de prueba', sourceUrl: 'https://example.invalid', fetchedAt: new Date(now).toISOString(),
    analysis: { kind: sport, available: true, winner: { home: 60, away: 40 }, firstSet: { home: 55, away: 45 }, secondSet: { home: 55, away: 45 }, winsSet: { home: { yes: 80, no: 20 }, away: { yes: 70, no: 30 } }, sampleSize: { home: 20, away: 20 }, form: { home: [], away: [] } } };
}

async function owner(page) {
  await page.setViewportSize({ width: 1280, height: 920 });
  await page.addInitScript(() => localStorage.setItem('picks777_auto_ai_pref', 'false'));
  await page.route(/^https:\/\//, route => route.abort());
  await page.addInitScript(() => {
    window.__filterTimes = [];
    document.addEventListener('input', event => {
      if (event.target.type !== 'search' || event.target.value !== 'Home 239') return;
      const started = performance.now();
      const observer = new MutationObserver(() => {
        if (document.querySelectorAll('article[data-match-id]').length === 1) {
          window.__filterTimes.push(performance.now() - started); observer.disconnect();
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }, true);
  });
}

for (const sport of ['beisbol', 'tenis', 'basquetbol']) {
  test(`${sport}: 240 cards load offscreen and 180 reports survive polling, navigation and browser reload`, async ({ page }) => {
    test.setTimeout(90000);
    await owner(page);
    // Fix Date only. Mocking animation/timer APIs stalls IndexedDB/visibility
    // callbacks in WebKit and does not measure real UI responsiveness.
    await page.clock.setFixedTime(new Date(now));
    const source = Array.from({ length: 240 }, (_, i) => fixture(sport, i));
    const loaded = new Set(), firstPass = new Set();
    let calendarCalls = 0, aiCalls = 0;
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname;
      let data = { success: true };
      if (path.startsWith('/api/auth/')) data = { success: true, valid: true, role: 'owner', isAdmin: true, user: { id: `loading-owner-${sport}`, name: 'Owner de prueba', plan: 'Owner' } };
      if (path === '/api/settings/active-model') data = { success: true, isConfigured: false };
      if (path.startsWith('/api/matches')) data = { success: true, matches: [] };
      if (path.startsWith('/api/sports/')) {
        const requestedSport = path.split('/')[3], id = path.split('/')[4];
        const selected = requestedSport === sport ? source : [];
        if (path.endsWith('/ai-analysis')) aiCalls++;
        if (id === 'details') {
          const ids = request.postDataJSON().ids;
          expect(ids.length).toBeLessThanOrEqual(12);
          data = { success: true, matches: selected.filter(match => ids.includes(match.id)).map(match => {
            loaded.add(match.id);
            const index = source.indexOf(match), report = index < 180 && !firstPass.has(match.id)
              ? { aiAvailable: true, dataGrounded: true, modelUsed: 'modelo-aislado', generatedAt: new Date(now - 1200000).toISOString() } : null;
            firstPass.add(match.id);
            return { ...match, aiReport: report, isAiAnalyzed: Boolean(report) };
          }) };
        } else {
          if (requestedSport === sport) calendarCalls++;
          data = { success: true, matches: selected.filter(match => !url.searchParams.has('league') || match.leagueId === url.searchParams.get('league'))
            .map(match => ({ ...match, analysis: { winner: { home: null, away: null }, sampleSize: { home: 0, away: 0 } }, aiReport: null, isAiAnalyzed: false })),
            coverage: (SPORT_LEAGUES[requestedSport] || []).map(league => ({ leagueId: league.id, name: league.name, status: 'available' })) };
        }
      }
      await route.fulfill({ json: data });
    });
    await page.goto(`/${sport}`, { waitUntil: 'domcontentloaded' });
    const cards = page.locator('article[data-match-id]');
    await expect(cards).toHaveCount(240, { timeout: 15000 });
    await expect.poll(() => loaded.size, { timeout: 30000 }).toBe(240);
    await expect(page.getByText('180 / 240', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await expect(cards.last()).toContainText('60%');
    expect(aiCalls).toBe(0, 'Statistics and reading saved reports must not call paid AI');

    const search = page.getByRole('searchbox');
    await search.fill('Home 239');
    await expect(cards).toHaveCount(1);
    const filterMs = await page.evaluate(() => window.__filterTimes.at(-1));
    expect(filterMs).toBeLessThan(1000);
    await search.fill('');
    await expect(cards).toHaveCount(240);
    const before = calendarCalls;
    await page.clock.setFixedTime(new Date(now + 70000));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(() => calendarCalls).toBeGreaterThan(before);
    await expect(page.getByText('180 / 240', { exact: true })).toBeVisible();

    const other = sport === 'beisbol' ? 'Tenis' : 'Béisbol';
    await page.getByRole('tab', { name: other, exact: true }).click();
    await expect(cards).toHaveCount(0);
    await page.getByRole('tab', { name: sport === 'beisbol' ? 'Béisbol' : sport === 'tenis' ? 'Tenis' : 'Básquetbol', exact: true }).click();
    await expect(page.getByText('180 / 240', { exact: true })).toBeVisible();
    // Wait for the durable writes, then a real reload clears all module memory.
    await expect.poll(() => page.evaluate(() => new Promise(resolve => {
      const request = indexedDB.open('picks777-sport-details-v1');
      request.onsuccess = () => {
        const db = request.result, count = db.transaction('details').objectStore('details').count();
        count.onsuccess = () => { resolve(count.result); db.close(); };
      };
    })), { timeout: 15000 }).toBe(240);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('180 / 240', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(cards.first()).toContainText('HECHOS PRIORIZADOS POR IA');
    await test.info().attach('large-calendar-performance', { body: JSON.stringify({ sport, cards: 240, offscreenLoaded: loaded.size, retainedReports: 180, filterMs, aiCalls }), contentType: 'application/json' });
  });
}

test('football retains completed work and resumes an interrupted pending AI request when returning', async ({ page }) => {
  test.setTimeout(90000);
  await owner(page);
  const source = Array.from({ length: 6 }, (_, i) => ({ ...fixture('basquetbol', i), id: `football-loading-${i}`, sport: 'futbol', leagueId: 'mls', leagueName: 'MLS',
    probabilities: { homeWin: 60, draw: 20, awayWin: 20, over15: 70 }, homeTeam: { id: `h${i}`, name: `Local ${i}` }, awayTeam: { id: `a${i}`, name: `Visita ${i}` } }));
  const calls = [];
  let interrupted = false;
  let releasePending;
  const blocked = new Promise(resolve => { releasePending = resolve; });
  let releaseThird;
  const thirdPending = new Promise(resolve => { releaseThird = resolve; });
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    let data = { success: true };
    if (path.startsWith('/api/auth/')) data = { success: true, valid: true, role: 'owner', isAdmin: true, user: { id: 'football-loading-owner', plan: 'Owner', name: 'Owner de prueba' } };
    if (path === '/api/settings/active-model') data = { success: true, isConfigured: false };
    if (path.startsWith('/api/sports/')) data = { success: true, matches: [], coverage: [] };
    if (path.startsWith('/api/matches')) {
      const match = source.find(match => path.includes(`/${match.id}`));
      data = { success: true, matches: source, match };
      if (path.endsWith('/ai-analysis')) {
        calls.push(match.id);
        if (match === source[1] && !interrupted) {
          interrupted = true;
          await blocked;
        }
        // Keep a pending request during the stop action. Instant mocked replies
        // otherwise finish the entire queue before slower WebKit clicks it.
        if (match === source[2]) await thirdPending;
        const report = { aiAvailable: true, dataGrounded: true, modelUsed: 'modelo-aislado', generatedAt: new Date(now).toISOString() };
        data = { success: true, match: { ...match, odds: { homeWin: 1.8 }, aiReport: report, isAiAnalyzed: true }, report };
      }
    }
    await route.fulfill({ json: data }).catch(() => {});
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Analizar Partidos con IA (6)', exact: true }).click();
  await expect.poll(() => calls.length).toBe(2);
  await page.getByRole('tab', { name: 'Béisbol', exact: true }).click();
  await expect(page.getByRole('heading', { name: '⚾ Béisbol' })).toBeVisible();
  releasePending();
  await page.getByRole('tab', { name: 'Fútbol', exact: true }).click();
  await expect(page.getByText('1 / 6', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Analizar Partidos con IA (5)', exact: true }).click();
  await expect.poll(() => calls.filter(id => id === source[1].id).length).toBe(2);
  await expect(page.getByText('2 / 6', { exact: true })).toBeVisible();
  expect(calls.filter(id => id === source[0].id)).toHaveLength(1);
  await page.getByRole('button', { name: 'Detener Análisis', exact: true }).click();
  releaseThird();
  source[0].odds = { homeWin: 2.2 };
  await page.getByRole('button', { name: 'Sincronizar partidos en vivo', exact: true }).click();
  await expect(page.locator('.terminal-card').filter({ hasText: 'Local 0' })).not.toContainText('HECHOS PRIORIZADOS POR IA');
});
