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

async function setup(page, { sport = 'tenis', owner = false, auto = false } = {}) {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript(({ auto }) => { localStorage.setItem('picks777_auto_ai_pref', String(auto)); localStorage.setItem('oddsFormat', 'american'); }, { auto });
  await page.route(/^https:\/\//, route => route.abort());
  await page.route('**/fixture/image/*', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="14" fill="#0ea5e9"/></svg>' }));
  const reports = new Map();
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    let data = { success: true };
    if (path.startsWith('/api/auth/')) data = { success: true, valid: true, role: owner ? 'owner' : 'vip_user', isAdmin: owner, user: { id: `design-${owner ? 'owner' : 'vip'}`, name: 'Cliente aislado', plan: owner ? 'Owner' : 'VIP' } };
    if (path === '/api/settings/active-model') data = { success: true, isConfigured: auto, selectedModel: 'modelo-de-prueba', modelName: 'IA de prueba' };
    if (path.startsWith('/api/sports/')) {
      const sportId = path.split('/')[3], source = fixtures[sportId] || [];
      const id = path.split('/')[4];
      if (id) {
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
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  await page.route('**/api/sports/tenis/*/ai-analysis?*', async route => {
    await waiting;
    const match = fixtures.tenis[0], report = { aiAvailable: true, dataGrounded: true, modelUsed: 'modelo-confirmado', generatedAt: new Date(now).toISOString(), tacticalKeypoints: ['Dato real de la muestra de prueba.'] };
    await route.fulfill({ json: { success: true, match: { ...match, aiReport: report, isAiAnalyzed: true }, report } });
  });
  await card.getByRole('button', { name: 'Reintentar con IA', exact: true }).click();
  await expect(card.getByRole('status')).toContainText('CONSULTANDO IA');
  release();
  await expect(card).toContainText('HECHOS PRIORIZADOS POR IA');
  await expect(card).toContainText('modelo-confirmado'); await expect(card).toContainText('52%');
  await card.getByRole('button', { name: 'Ver análisis y mercados' }).click();
  const report = page.getByRole('dialog').getByRole('region', { name: 'Informe con IA' });
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
