import { test, expect } from '@playwright/test';
import { rankSportWinners } from '../../src/utils/sportPicks.js';
import { SPORT_LEAGUES } from '../../src/constants/leagues.js';

const now = Date.now();
const fixtures = Object.fromEntries(['beisbol', 'tenis', 'basquetbol'].map(sport => [sport, Array.from({ length: 13 }, (_, index) => {
  const probability = 52 + index * 3, league = SPORT_LEAGUES[sport].find(item => item.id === (sport === 'tenis' ? 'atp' : sport === 'beisbol' ? 'mlb' : 'nba'));
  return { id: `${sport}-design-${index}`, sport, tour: sport === 'tenis' ? 'atp' : undefined, leagueId: league.id, leagueName: league.name, leagueFlag: league.flag,
    homeTeam: { id: `a-${index}`, name: `Equipo A ${index}`, shortName: `A${index}`, logo: '/fixture/image/logo.svg' }, awayTeam: { id: `b-${index}`, name: `Equipo B ${index}`, shortName: `B${index}`, logo: '/fixture/image/logo.svg' },
    status: 'SCHEDULED', kickoff: new Date(now + (index + 1) * 3600000).toISOString(), source: 'Fuente aislada de prueba', sourceUrl: 'https://example.invalid', fetchedAt: new Date(now).toISOString(), odds: {},
    analysis: { winner: { home: probability, away: 100 - probability }, firstSet: { home: 60, away: 40 }, secondSet: { home: 60, away: 40 }, winsSet: { home: { yes: 84, no: 16 }, away: { yes: 64, no: 36 } }, sampleSize: { home: 8, away: 10 }, available: true, method: 'Método de prueba aislado.' } };
})]));

async function setup(page, { sport = 'tenis', owner = false, auto = false, configured = auto } = {}) {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript(({ auto }) => { localStorage.setItem('picks777_auto_ai_pref', String(auto)); localStorage.setItem('oddsFormat', 'american'); }, { auto });
  await page.route(/^https:\/\//, route => route.abort());
  await page.route('**/fixture/image/*', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="14" fill="#0ea5e9"/></svg>' }));
  const reports = new Map();
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    let data = { success: true };
    if (path.startsWith('/api/auth/')) data = { success: true, valid: true, role: owner ? 'owner' : 'vip_user', isAdmin: owner, user: { id: `design-${owner ? 'owner' : 'vip'}`, name: 'Cliente aislado', plan: owner ? 'Owner' : 'VIP' } };
    if (path === '/api/settings/active-model') data = { success: true, isConfigured: configured, selectedModel: 'modelo-de-prueba', modelName: 'IA de prueba' };
    if (path.startsWith('/api/sports/')) {
      const sportId = path.split('/')[3], source = fixtures[sportId] || [];
      const id = path.split('/')[4];
      if (id === 'details') {
        const ids = request.postDataJSON().ids;
        data = { success: true, matches: source.filter(match => ids.includes(match.id)).map(match => ({ ...match, aiReport: reports.get(match.id) || null, isAiAnalyzed: reports.has(match.id) })) };
      } else if (id) {
        const match = source.find(match => match.id === id);
        if (path.endsWith('/ai-analysis')) {
          const report = { aiAvailable: true, dataGrounded: true, modelUsed: 'modelo-de-prueba', generatedAt: new Date(now).toISOString(), probabilities: match.analysis.winner, tacticalKeypoints: ['Hecho verificado de la muestra aislada.'] };
          reports.set(id, report); data = { success: true, match: { ...match, isAiAnalyzed: true, aiReport: report }, report };
        } else data = { success: true, match: { ...match, aiReport: reports.get(id) || null, isAiAnalyzed: reports.has(id) } };
      } else {
        let list = source.filter(match => !url.searchParams.has('league') || match.leagueId === url.searchParams.get('league'));
        if (url.searchParams.has('search')) list = list.filter(match => `${match.homeTeam.name} ${match.awayTeam.name}`.includes(url.searchParams.get('search')));
        data = { success: true, matches: url.searchParams.get('category') === 'bankers' ? rankSportWinners(list, now) : list,
          ranking: { examined: list.length, available: list.length }, coverage: SPORT_LEAGUES[sportId].map(league => ({ ...league, leagueId: league.id, status: 'available' })) };
      }
    }
    await route.fulfill({ json: data });
  });
  const calendar = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === `/api/sports/${sport}` && !url.searchParams.has('category')
      && (!url.searchParams.has('league') || url.searchParams.get('league') === fixtures[sport][0].leagueId);
  }, { timeout: 45000 });
  await page.goto(`/${sport}`, { waitUntil: 'domcontentloaded' });
  await calendar;
  await expect(page.getByRole('article').first()).toBeVisible({ timeout: 15000 });
}

test('Banqueros in every new sport shows only the top ten winners in descending order, and no football categories', async ({ page }) => {
  for (const sport of ['beisbol', 'tenis', 'basquetbol']) {
    await setup(page, { sport });
    const panel = page.getByRole('tabpanel');
    await expect(panel.getByRole('button', { name: 'Banqueros', exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: /2\.5 Goles|Ambos Anotan/ })).toHaveCount(0);
    await panel.getByRole('button', { name: 'Banqueros', exact: true }).click();
    await expect(panel.getByRole('heading', { name: 'Top 10 Banqueros · Ganadores' })).toBeVisible();
    const cards = panel.getByRole('article');
    await expect(cards).toHaveCount(10);
    await expect(cards.first()).toHaveAttribute('aria-label', 'Equipo A 12 vs Equipo B 12');
    await expect(cards.last()).toHaveAttribute('aria-label', 'Equipo A 3 vs Equipo B 3');
    for (let i = 0; i < 10; i++) await expect(cards.nth(i)).toContainText(`#${i + 1} BANQUERO`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Reintentar con IA', exact: true })).toHaveCount(0);
  }
});

test('compact cards render images, winner picks and three markets on desktop and mobile, and broken images have initials', async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 1280, height: 920 });
  const card = page.getByRole('article').first();
  await expect(card.getByRole('img', { name: 'Equipo A 0', exact: true })).toBeVisible();
  await expect(card.getByRole('img', { name: 'Equipo A 0', exact: true })).toHaveJSProperty('naturalWidth', 32);
  await expect(card.getByRole('region', { name: 'Pick ganador' })).toContainText('Equipo A 0 gana');
  for (const text of ['1er set · A0', '2º set · A0', 'Gana un set · A0']) await expect(card.getByText(text, { exact: true })).toBeVisible();
  const boxes = await page.getByRole('article').evaluateAll(elements => elements.slice(0, 3).map(element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, height: r.height }; }));
  expect(new Set(boxes.map(box => box.y)).size).toBe(1); expect(boxes[0].height).toBeLessThan(530);
  await page.getByRole('tabpanel').screenshot({ path: `artifacts/mobile/sports-compact-desktop-${test.info().project.name}.png` });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await card.screenshot({ path: `artifacts/mobile/sports-compact-mobile-${test.info().project.name}.png` });
  await page.route('**/fixture/image/*', route => route.fulfill({ status: 404 }));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(card.getByRole('img', { name: 'Iniciales de Equipo A 0', exact: true })).toBeVisible();
});

test('only the Owner has retry controls; a real request updates confirmed AI state and preserves probabilities', async ({ page }) => {
  await setup(page, { owner: true });
  const card = page.getByRole('article').first();
  await expect(card.getByRole('button', { name: 'Reintentar con IA', exact: true })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Al Parlay', exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Ver análisis y mercados' }).click();
  const report = page.getByRole('dialog').getByRole('region', { name: 'Informe con IA' });
  await expect(report).toContainText('Hecho verificado de la muestra aislada.');
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  await page.route('**/api/sports/tenis/*/ai-analysis?*', async route => {
    await waiting;
    const match = fixtures.tenis[0], report = { aiAvailable: true, dataGrounded: true, modelUsed: 'modelo-confirmado', generatedAt: new Date(now).toISOString(), tacticalKeypoints: ['Dato real de la muestra de prueba.'] };
    await route.fulfill({ json: { success: true, match: { ...match, aiReport: report, isAiAnalyzed: true }, report } });
  });
  await report.getByRole('button', { name: 'Reintentar con IA', exact: true }).click();
  await expect(card.getByRole('status')).toContainText('CONSULTANDO IA');
  release();
  await expect(card).toContainText('HECHOS PRIORIZADOS POR IA');
  await expect(card).toContainText('modelo-confirmado'); await expect(card).toContainText('52%');
  await expect(report).toContainText('Dato real de la muestra de prueba.');
  await expect(report.getByRole('button', { name: 'Reintentar con IA' })).toBeVisible();
  await page.keyboard.press('Escape');
  await setup(page, { owner: false });
  await expect(page.getByRole('button', { name: 'Reintentar con IA', exact: true })).toHaveCount(0);
  await page.getByRole('article').first().getByRole('button', { name: 'Ver análisis y mercados' }).click();
  await expect(page.getByRole('dialog').getByRole('region', { name: 'Informe con IA' })).toContainText('Hechos priorizados por IA');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Reintentar con IA' })).toHaveCount(0);
});

test('Owner analysis starts automatically with the configured model and leaves no queue running after changing sport', async ({ page }) => {
  const requests = [];
  page.on('request', request => { if (request.url().includes('/ai-analysis')) requests.push(request.url()); });
  await setup(page, { owner: true, auto: true });
  await expect(page.getByRole('article').first()).toContainText('HECHOS PRIORIZADOS POR IA', { timeout: 15000 });
  await page.getByRole('tab', { name: 'Béisbol', exact: true }).click();
  await expect(page.getByRole('heading', { name: '⚾ Béisbol' })).toBeVisible();
  const tennisCalls = requests.filter(url => url.includes('/sports/tenis/')).length;
  await expect(page.getByRole('article').first()).toContainText('HECHOS PRIORIZADOS POR IA', { timeout: 15000 });
  expect(requests.filter(url => url.includes('/sports/tenis/')).length).toBe(tennisCalls);
});

test('all sports add and remove winners in one parlay without opening the match dialog', async ({ page }) => {
  await setup(page, { sport: 'beisbol', owner: true });
  for (const [sport, tab] of [['beisbol', 'Béisbol'], ['tenis', 'Tenis'], ['basquetbol', 'Básquetbol']]) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    const card = page.locator(`article[data-match-id="${sport}-design-0"]`);
    await card.getByRole('button', { name: 'Al Parlay', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const ticket = page.getByRole('region', { name: 'Boleto de parlay' });
    await expect(ticket).toContainText('Equipo A 0 gana');
    await expect(ticket.getByText('Teórico', { exact: true })).toHaveCount(sport === 'beisbol' ? 1 : sport === 'tenis' ? 2 : 3);
    await ticket.getByRole('button', { name: 'Cerrar parlay', exact: true }).click();
    await expect(card.getByRole('button', { name: 'En Parlay', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /Ver Parlay Ticket/ })).toBeVisible();
  }
  await page.getByRole('tab', { name: 'Béisbol', exact: true }).click();
  const baseball = page.locator('article[data-match-id="beisbol-design-0"]');
  await baseball.getByRole('button', { name: 'En Parlay', exact: true }).click();
  const ticket = page.getByRole('region', { name: 'Boleto de parlay' });
  await expect(ticket.getByText('Teórico', { exact: true })).toHaveCount(2);
  await ticket.getByRole('button', { name: 'Cerrar parlay', exact: true }).click();
  await expect(baseball.getByRole('button', { name: 'Al Parlay', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

for (const sport of ['beisbol', 'tenis', 'basquetbol']) {
  test(`${sport} analyzes automatically for a member with no Owner panel, independent of filters, and retains reports on reload`, async ({ page }) => {
    const calls = [];
    page.on('request', request => { if (request.url().includes('/ai-analysis')) calls.push({ url: request.url(), body: request.postDataJSON() }); });
    await setup(page, { sport, owner: false, auto: false, configured: true });
    await expect(page.getByText('Análisis Autónomo con IA', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Analizar Partidos con IA|Reintentar con IA|Detener Análisis/ })).toHaveCount(0);
    await page.getByRole('searchbox').fill('Equipo A 12');
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('article')).toContainText('HECHOS PRIORIZADOS POR IA', { timeout: 30000 });
    expect(calls).toHaveLength(13);
    expect(new Set(calls.map(call => new URL(call.url).pathname)).size).toBe(13);
    expect(calls.every(call => Object.keys(call.body).length === 0)).toBe(true);
    await expect(page.getByRole('article').getByRole('button', { name: 'Al Parlay', exact: true })).toBeEnabled();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('article').first()).toContainText('HECHOS PRIORIZADOS POR IA', { timeout: 15000 });
    await page.getByRole('article').first().getByRole('button', { name: 'Al Parlay', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Boleto de parlay' })).toContainText('Equipo A 0 gana');
    expect(calls).toHaveLength(13);
    await test.info().attach('member-automatic-analysis', { body: JSON.stringify({ sport, reports: calls.length, ownerControls: false, requestBodies: calls.map(call => call.body) }), contentType: 'application/json' });
  });
}

test('member automatic analysis waits for Retry-After and retries the same pending game', async ({ page }) => {
  const times = [];
  await setup(page, { owner: false, auto: false, configured: true });
  await page.route('**/api/sports/tenis/tenis-design-0/ai-analysis?*', async route => {
    times.push(Date.now());
    if (times.length === 1) return route.fulfill({ status: 429, headers: { 'Retry-After': '4' }, json: { success: false, retryAfter: 4 } });
    const match = fixtures.tenis[0], report = { aiAvailable: true, dataGrounded: true, modelUsed: 'modelo-de-prueba' };
    await route.fulfill({ json: { success: true, match: { ...match, aiReport: report, isAiAnalyzed: true }, report } });
  });
  await expect(page.getByRole('article').first()).toContainText('HECHOS PRIORIZADOS POR IA', { timeout: 20000 });
  expect(times).toHaveLength(2); expect(times[1] - times[0]).toBeGreaterThanOrEqual(4000);
});

test('football also analyzes automatically for a member and sends no Owner-only overrides', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('picks777_auto_ai_pref', 'false'));
  await page.route(/^https:\/\//, route => route.abort());
  const calls = [];
  const source = [0, 1].map(i => ({ ...fixtures.basquetbol[i], id: `football-auto-${i}`, sport: 'futbol', leagueId: 'mls', leagueName: 'MLS',
    probabilities: { homeWin: 60, draw: 20, awayWin: 20, over15: 70 }, analysis: undefined }));
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    let data = { success: true };
    if (path.startsWith('/api/auth/')) data = { success: true, valid: true, role: 'vip_user', user: { id: 'football-auto-vip', plan: 'VIP', name: 'Cliente aislado' } };
    if (path === '/api/settings/active-model') data = { success: true, isConfigured: true, selectedModel: 'modelo-de-prueba' };
    if (path.startsWith('/api/matches')) {
      const match = source.find(match => path.includes(`/${match.id}`));
      data = { success: true, matches: source, match };
      if (path.endsWith('/ai-analysis')) {
        calls.push(request.postDataJSON());
        const report = { aiAvailable: true, dataGrounded: true, modelUsed: 'modelo-de-prueba' };
        data = { success: true, match: { ...match, aiReport: report, isAiAnalyzed: true }, report };
      }
    }
    await route.fulfill({ json: data });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('HECHOS PRIORIZADOS POR IA', { exact: true })).toHaveCount(2, { timeout: 15000 });
  expect(calls).toEqual([{}, {}]);
  await expect(page.getByText('Análisis Autónomo con IA', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Analizar Partidos con IA|Re-analizar Todos|Detener Análisis/ })).toHaveCount(0);
});
