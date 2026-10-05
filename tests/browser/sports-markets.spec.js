import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { SPORT_LEAGUES } from '../../src/constants/leagues.js';
import { baseballAnalysis, basketballAnalysis, tennisAnalysis } from '../../server/services/sportProbabilityModel.js';

const now = Date.now();
const football = JSON.parse(readFileSync(new URL('../../server/data/real_matches.json', import.meta.url))).slice(0, 1).map(match => ({ ...match, status: 'SCHEDULED', kickoff: new Date(now + 3600000).toISOString() }));
const women = football.map(match => ({ ...match, id: 'espn-femenil-test', sport: 'femenil', leagueId: 'mexico_femenil', leagueName: 'Liga MX Femenil', leagueFlag: '🇲🇽', homeTeam: { ...match.homeTeam, name: 'Tigres Femenil' }, awayTeam: { ...match.awayTeam, name: 'América Femenil' } }));

function fixture(sport, leagueId, homeName, awayName) {
  const league = SPORT_LEAGUES[sport].find(league => league.id === leagueId);
  const match = { id: `${sport}-${leagueId}`, sport, leagueId, leagueName: league.name, leagueFlag: league.flag, status: 'SCHEDULED',
    homeTeam: { id: 'a', name: homeName, shortName: homeName }, awayTeam: { id: 'b', name: awayName, shortName: awayName },
    kickoff: new Date(now + 3600000).toISOString(), source: 'Fuente de prueba', sourceUrl: 'https://example.invalid', fetchedAt: new Date(now).toISOString(), odds: sport === 'basquetbol' && leagueId === 'nba' ? { homeWin: 1.8, awayWin: 2.15 } : {} };
  const games = [0, 1, 2, 3, 4, 5].flatMap(i => [
    { ...match, id: `a-${i}`, status: 'FINISHED', kickoff: new Date(now - (i + 1) * 86400000).toISOString(), awayTeam: { id: 'c' }, finalScore: { home: 102 + i * 2, away: 98 + i },
      setScores: [{ home: 6, away: 3 }, { home: 6, away: 4 }] },
    { ...match, id: `b-${i}`, status: 'FINISHED', kickoff: new Date(now - (i + 1) * 86400000).toISOString(), homeTeam: { id: 'c' }, finalScore: { home: 99 + i, away: 101 + i * 2 },
      setScores: [{ home: 6, away: 3 }, { home: 6, away: 4 }] }
  ]);
  if (sport === 'beisbol') {
    match.scheduledInnings = 9;
    games.forEach((game, i) => {
      game.finalScore = { home: 3 + i % 4, away: 1 + i % 3 };
      const extra = i % 4 === 0, regulationRuns = Math.min(game.finalScore.home, game.finalScore.away);
      game.scheduledInnings = 9; game.lastInning = extra ? 10 : 9;
      game.inningScores = Array.from({ length: game.lastInning }, (_, n) => ({ num: n + 1,
        home: n === 0 ? (extra ? regulationRuns : game.finalScore.home) : n === 9 ? game.finalScore.home - regulationRuns : 0,
        away: n === 0 ? (extra ? regulationRuns : game.finalScore.away) : n === 9 ? game.finalScore.away - regulationRuns : 0 }));
    });
  }
  if (sport === 'tenis') { match.tour = 'atp'; games.forEach(game => { game.tour = 'atp'; }); match.maxSets = 3; }
  match.analysis = sport === 'beisbol' ? baseballAnalysis(match, games, now) : sport === 'tenis' ? tennisAnalysis(match, games, now) : basketballAnalysis(match, games, now);
  return match;
}
const feeds = {
  beisbol: [fixture('beisbol', 'mlb', 'LA Dodgers', 'ATL Braves'), fixture('beisbol', 'npb', 'Rakuten', 'SoftBank')],
  tenis: [fixture('tenis', 'atp', 'Jugador A', 'Jugador B'), fixture('tenis', 'wimbledon', 'Jugador C', 'Jugador D')],
  basquetbol: [fixture('basquetbol', 'nba', 'Boston Celtics', 'LA Lakers'), fixture('basquetbol', 'wnba', 'New York Liberty', 'Las Vegas Aces')]
};
feeds.basquetbol[0].oddsProvider = 'Casa de prueba';

async function setup(page, path = '/') {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.route(/^https:\/\//, route => route.abort());
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    let body = { success: true };
    if (path.startsWith('/api/auth/')) body = { success: true, valid: true, role: 'vip_user', user: { id: 'sports-client', name: 'Cliente', plan: 'VIP' } };
    if (path.startsWith('/api/matches')) {
      const matches = url.searchParams.get('sport') === 'femenil' || url.searchParams.get('league') === 'mexico_femenil' || path.includes('femenil') ? women : football;
      body = { success: true, matches, match: matches[0] };
      if (path.endsWith('/ai-analysis')) body.report = { aiAvailable: false, summary: 'Informe de prueba' };
    }
    if (path.startsWith('/api/sports/')) {
      const sport = path.split('/')[3];
      body = path.split('/').length > 4 ? { success: true, match: feeds[sport].find(match => match.id === path.split('/')[4]) }
        : { success: true, matches: feeds[sport].filter(match => !url.searchParams.has('league') || match.leagueId === url.searchParams.get('league')), coverage: SPORT_LEAGUES[sport].filter(league => !url.searchParams.has('league') || league.id === url.searchParams.get('league')).map(league => ({ leagueId: league.id, name: league.name, status: 'available' })) };
    }
    if (path === '/api/community') body = { success: true, settings: { links: [] } };
    await route.fulfill({ json: body });
  });
  await page.goto(path, { waitUntil: 'domcontentloaded' });
}

test('la liga femenil tiene encuentros propios, informe, recarga y regreso a fútbol', async ({ page }) => {
  await setup(page);
  const tabs = page.getByRole('tablist', { name: 'Deportes' });
  await expect(tabs.getByRole('tab')).toHaveCount(4);
  await expect(tabs.getByRole('tab', { name: 'Liga femenil', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /Liga MX Femenil/ }).click();
  await expect(page).toHaveURL(/league=mexico_femenil/);
  const panel = page.getByRole('tabpanel');
  await expect(panel.getByRole('heading', { name: '🇲🇽 Liga MX Femenil' })).toBeVisible();
  await expect(panel.getByText('Tigres Femenil').first()).toBeVisible();
  await page.getByRole('button', { name: /^(Ver Informe|Detalle)$/ }).first().click();
  await expect(page.getByRole('dialog', { name: 'Detalle del partido' })).toContainText('Tigres Femenil');
  await page.getByRole('button', { name: 'Cerrar panel', exact: true }).click();
  await expect(panel.getByText('Tigres Femenil').first()).toBeVisible();
  await page.reload();
  await expect(panel.getByText('Tigres Femenil').first()).toBeVisible();
  await panel.getByRole('button', { name: /Todas las Ligas/ }).click();
  await expect(page.getByRole('button', { name: 'Ver Informe', exact: true }).first()).toBeVisible();
  await expect(page.getByText('Tigres Femenil', { exact: true })).toHaveCount(0);
});

test('béisbol abre toda la tarjeta y ofrece Over/Under, totales 1.5–9.5 y extra innings sí/no', async ({ page }) => {
  await setup(page, '/beisbol');
  const panel = page.getByRole('tabpanel');
  for (const name of ['MLB', 'NPB', 'KBO', 'LMB']) await expect(panel.getByRole('button', { name: new RegExp(name) })).toBeVisible();
  const social = panel.getByRole('navigation', { name: 'Comunidades de Picks777' });
  for (const name of ['Telegram', 'WhatsApp', 'Instagram']) {
    await expect(social.getByRole('link', { name, exact: true })).toBeVisible();
    await expect(social.getByRole('link', { name, exact: true })).toHaveAttribute('target', '_blank');
  }
  await expect(panel.getByText('Ganador, carreras por equipo, primer inning y total de innings 1 a 5.', { exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: /MLB/ }).click();
  await expect(panel.getByRole('article')).toHaveCount(1);
  await panel.getByRole('article').click({ position: { x: 25, y: 70 } });
  const dialog = page.getByRole('dialog', { name: 'Análisis del encuentro' });
  for (const name of ['Carreras · LA Dodgers', 'Carreras · ATL Braves', 'Innings 1 a 5 · Total de carreras de ambos equipos']) {
    const market = dialog.getByRole('region', { name, exact: true });
    for (const line of ['1.5', '2.5', '3.5', '4.5', '5.5']) await expect(market.getByRole('rowheader', { name: line, exact: true })).toHaveCount(1);
    await expect(market.getByRole('columnheader', { name: 'Over', exact: true })).toHaveCount(1);
    await expect(market.getByRole('columnheader', { name: 'Under', exact: true })).toHaveCount(1);
  }
  const totals = dialog.getByRole('region', { name: 'Totales extra innings', exact: true });
  for (const line of ['1.5', '2.5', '3.5', '4.5', '5.5', '6.5', '7.5', '8.5', '9.5']) await expect(totals.getByRole('rowheader', { name: line, exact: true })).toHaveCount(1);
  await expect(dialog.getByRole('region', { name: /anota al menos una carrera/ })).toHaveCount(0);
  await dialog.getByText('¿Habrá extra innings?', { exact: true }).click();
  const extra = dialog.getByRole('region', { name: 'Probabilidad de extra innings', exact: true });
  for (const name of ['Sí', 'No']) await expect(extra.getByText(name, { exact: true })).toBeVisible();
  await expect(extra).not.toContainText('N/D');
  await expect(dialog.getByRole('region', { name: 'Primer inning · 1X2' }).getByText('Empate', { exact: true })).toHaveCount(1);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.screenshot({ path: `artifacts/mobile/baseball-markets-${test.info().project.name}.png` });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('las tarjetas de tenis y básquetbol abren desde el cuerpo y con teclado; las redes respetan la configuración', async ({ page }) => {
  for (const sport of ['tenis', 'basquetbol']) {
    await setup(page, `/${sport}`);
    await page.route('**/api/community', route => route.fulfill({ json: { success: true, settings: { revision: 100, promoImageVisible: false, links: [
      { id: 'telegram', url: 'https://t.me/picks_test' }, { id: 'whatsapp', url: 'https://chat.whatsapp.com/picks_test' }, { id: 'instagram', url: 'https://instagram.com/picks_test' }
    ] } } }));
    await page.reload();
    const panel = page.getByRole('tabpanel'), card = panel.getByRole('article').first();
    const social = panel.getByRole('navigation', { name: 'Comunidades de Picks777' });
    await expect(social.getByRole('link', { name: 'Telegram', exact: true })).toHaveAttribute('href', 'https://t.me/picks_test');
    await expect(social.getByRole('link', { name: 'WhatsApp', exact: true })).toHaveAttribute('href', 'https://chat.whatsapp.com/picks_test');
    await expect(social.getByRole('link', { name: 'Instagram', exact: true })).toHaveAttribute('href', 'https://instagram.com/picks_test');
    await card.click({ position: { x: 25, y: 70 } });
    const dialog = page.getByRole('dialog', { name: 'Análisis del encuentro' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await card.getByRole('button', { name: 'Ver análisis y mercados' }).focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
  }
});

test('tenis ofrece los seis torneos, ambos sets y sí/no para al menos un set de cada jugador', async ({ page }) => {
  await setup(page, '/tenis');
  const panel = page.getByRole('tabpanel');
  for (const name of SPORT_LEAGUES.tenis.map(league => league.name)) await expect(panel.getByRole('button', { name: new RegExp(name) })).toHaveCount(1);
  await panel.getByRole('button', { name: /^🎾 ATP/ }).click();
  await panel.getByRole('button', { name: 'Ver análisis y mercados' }).click();
  const dialog = page.getByRole('dialog', { name: 'Análisis del encuentro' });
  for (const name of ['Ganador del primer set', 'Ganador del segundo set']) {
    const market = dialog.getByRole('region', { name });
    await expect(market.getByText('Jugador A', { exact: true })).toHaveCount(1);
    await expect(market.getByText('Jugador B', { exact: true })).toHaveCount(1);
  }
  for (const name of ['Jugador A', 'Jugador B']) {
    const market = dialog.getByRole('region', { name: `${name} gana al menos un set` });
    await expect(market.getByText('Sí', { exact: true })).toHaveCount(1); await expect(market.getByText('No', { exact: true })).toHaveCount(1);
  }
  await dialog.screenshot({ path: `artifacts/mobile/tennis-markets-${test.info().project.name}.png` });
});

test('básquetbol ofrece las cuatro ligas y todos los hándicaps para ambos equipos', async ({ page }) => {
  await setup(page, '/basquetbol');
  const panel = page.getByRole('tabpanel');
  for (const name of SPORT_LEAGUES.basquetbol.map(league => league.name)) await expect(panel.getByRole('button', { name: new RegExp(`^🇺🇸 ${name.replace(/[()]/g, '\\$&')}(?:\\s|$)`) })).toHaveCount(1);
  await panel.getByRole('button', { name: /^🇺🇸 NBA/ }).click();
  await panel.getByRole('button', { name: 'Ver análisis y mercados' }).click();
  const dialog = page.getByRole('dialog', { name: 'Análisis del encuentro' });
  for (const name of ['Boston Celtics', 'LA Lakers']) {
    const market = dialog.getByRole('region', { name: `Hándicap · ${name}` });
    for (const line of ['+1.5', '+2.5', '+3.5', '+4.5', '+5.5', '+6.5', '+7.5', '-1.5', '-2.5', '-3.5', '-4.5', '-5.5', '-6.5']) await expect(market.getByRole('rowheader', { name: line, exact: true })).toHaveCount(1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.screenshot({ path: `artifacts/mobile/basketball-markets-${test.info().project.name}.png` });
});

test('un fallo del calendario muestra el error y permite reintentar sin fabricar porcentajes', async ({ page }) => {
  await setup(page, '/tenis');
  await page.route('**/api/sports/tenis', route => route.fulfill({ status: 503, json: { success: false, message: 'Calendario no disponible', coverage: [] } }));
  await page.getByRole('button', { name: 'Actualizar encuentros' }).click();
  await expect(page.getByRole('alert')).toContainText('Calendario no disponible');
  await expect(page.getByRole('button', { name: 'Ver análisis y mercados' })).toHaveCount(0);
  await page.unroute('**/api/sports/tenis');
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ver análisis y mercados' }).first()).toBeVisible();
});

test('todos los deportes muestran fecha, hora y momios en el formato elegido; las rachas tienen resultados', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('oddsFormat', 'american'));
  for (const sport of ['beisbol', 'tenis', 'basquetbol']) {
    await setup(page, `/${sport}`);
    await page.setViewportSize({ width: 320, height: 740 });
    const panel = page.getByRole('tabpanel'), card = panel.getByRole('article').first();
    await expect(card.locator('time')).toContainText(/.*\d+.*·.*\d{2}:\d{2}/);
    await expect(card).toContainText(/Momio [+-]\d+/);
    await expect(panel.getByText('Ganador y hándicaps positivos y negativos para ambos equipos.', { exact: true })).toHaveCount(0);
    await expect(panel.getByText('Ganador del partido, primer y segundo set, y al menos un set por jugador.', { exact: true })).toHaveCount(0);
    if (sport !== 'tenis') await expect(card.getByRole('img', { name: /Victoria|Derrota|Empate/ })).toHaveCount(10);
    if (sport === 'basquetbol') {
      await expect(card).toContainText('Momio -125');
      await expect(card).toContainText('Publicado');
      await expect(card).toContainText('Casa de prueba');
    } else await expect(card).toContainText('Teórico');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await card.screenshot({ path: `artifacts/mobile/${sport}-card-odds-${test.info().project.name}.png` });
    await card.getByRole('button', { name: 'Ver análisis y mercados' }).click();
    const dialog = page.getByRole('dialog', { name: 'Análisis del encuentro' });
    await expect(dialog.locator('time')).toContainText(/.*\d+.*·.*\d{2}:\d{2}/);
    await expect(dialog.getByRole('region', { name: 'Ganador del encuentro', exact: true })).toContainText(/Momio [+-]\d+/);
    if (sport !== 'tenis') {
      const form = dialog.getByRole('region', { name: 'Cómo llegan los equipos' });
      await expect(form.getByRole('img', { name: /Victoria|Derrota|Empate/ })).toHaveCount(10);
      await form.getByText('Ver los resultados recientes', { exact: true }).click();
      await expect(form.getByRole('link')).toHaveCount(10);
    }
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const markets = sport === 'beisbol' ? ['Carreras · LA Dodgers', 'Totales extra innings'] : sport === 'tenis' ? ['Ganador del primer set', 'Ganador del segundo set'] : ['Hándicap · Boston Celtics', 'Hándicap · LA Lakers'];
    for (const market of markets) await expect(dialog.getByRole('region', { name: market, exact: true })).toContainText(/Momio [+-]\d+/);
    await page.keyboard.press('Escape');
    await page.getByRole('combobox', { name: 'Formato de Momios', exact: true }).selectOption('decimal');
    await card.getByRole('button', { name: 'Ver análisis y mercados' }).click();
    await expect(dialog.getByRole('region', { name: 'Ganador del encuentro', exact: true })).toContainText(/Momio \d+\.\d{2}/);
    await page.keyboard.press('Escape');
    await page.getByRole('combobox', { name: 'Formato de Momios', exact: true }).selectOption('american');
  }
});

test('las ligas rápidas aparecen durante una consulta lenta y cambiar el formato o la visibilidad no cancela la carga', async ({ page }) => {
  await setup(page, '/tenis');
  let release, npbCalls = 0, mlbCalls = 0;
  const waiting = new Promise(resolve => { release = resolve; });
  await page.route('**/api/sports/beisbol?league=*', async route => {
    const league = new URL(route.request().url()).searchParams.get('league');
    if (league === 'npb') { npbCalls++; await waiting; }
    if (league === 'mlb') mlbCalls++;
    await route.fulfill({ json: { success: true, matches: feeds.beisbol.filter(match => match.leagueId === league), coverage: [{ leagueId: league, name: league.toUpperCase(), status: 'available' }] } });
  });
  await page.getByRole('tab', { name: 'Béisbol', exact: true }).click();
  const panel = page.getByRole('tabpanel');
  await expect(panel.getByRole('article', { name: 'LA Dodgers vs ATL Braves' })).toBeVisible();
  await expect.poll(() => npbCalls).toBe(1);
  await expect(panel.getByRole('article', { name: 'Rakuten vs SoftBank' })).toHaveCount(0);
  await expect(panel.getByRole('status').filter({ hasText: 'Consultando' })).toContainText('NPB');
  await page.getByRole('combobox', { name: 'Formato de Momios' }).selectOption('american');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  release();
  await expect(panel.getByRole('article')).toHaveCount(2);
  await expect(panel.getByRole('status').filter({ hasText: 'Consultando' })).toHaveCount(0);
  expect(mlbCalls).toBe(1); expect(npbCalls).toBe(1);
  await page.getByRole('tab', { name: 'Tenis', exact: true }).click();
  await page.getByRole('tab', { name: 'Béisbol', exact: true }).click();
  await expect(panel.getByRole('article')).toHaveCount(2);
});

test('básquetbol carga el calendario primero y completa forma y probabilidades sin cambiar de sección', async ({ page }) => {
  await setup(page, '/tenis');
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const original = { ...feeds.basquetbol[0], odds: {}, analysis: basketballAnalysis({ ...feeds.basquetbol[0], odds: {} }, []) };
  await page.route('**/api/sports/basquetbol?league=*', route => {
    const league = new URL(route.request().url()).searchParams.get('league');
    return route.fulfill({ json: { success: true, matches: league === 'nba' ? [original] : [], coverage: [{ leagueId: league, name: league, status: 'available' }] } });
  });
  await page.route('**/api/sports/basquetbol/*', async route => { await waiting; await route.fulfill({ json: { success: true, match: feeds.basquetbol[0] } }); });
  await page.getByRole('tab', { name: 'Básquetbol', exact: true }).click();
  const card = page.getByRole('article', { name: 'Boston Celtics vs LA Lakers' });
  await expect(card).toBeVisible(); await expect(card).toContainText('N/D');
  release();
  await expect(card.getByRole('img', { name: /Victoria|Derrota|Empate/ })).toHaveCount(10);
  await expect(card).toContainText('Publicado');
  await card.getByRole('button', { name: 'Ver análisis y mercados' }).click();
  const market = page.getByRole('dialog').getByRole('region', { name: 'Hándicap · Boston Celtics' });
  await expect(market.getByRole('row').filter({ has: page.getByRole('rowheader', { name: '+1.5', exact: true }) })).toContainText(/\d+.*%.*Momio/);
});

test('los filtros de fútbol están entre las ligas y el destacado; /femenil conserva la selección', async ({ page }) => {
  await setup(page);
  const panel = page.getByRole('tabpanel');
  const league = panel.getByRole('button', { name: /Todas las Ligas/ });
  const filter = panel.getByRole('button', { name: 'Todos', exact: true });
  const hero = panel.getByRole('button', { name: 'Ver Informe', exact: true }).first();
  await expect(hero).toBeVisible();
  const leagueBounds = await league.boundingBox(), filterBounds = await filter.boundingBox(), heroBounds = await hero.boundingBox();
  expect(filterBounds.y).toBeGreaterThan(leagueBounds.y);
  expect(filterBounds.y).toBeLessThan(heroBounds.y);
  await expect(panel.locator('time').first()).toContainText(/.*\d+.*·.*\d{2}:\d{2}/);
  await page.goto('/femenil');
  await expect(panel.getByRole('heading', { name: '🇲🇽 Liga MX Femenil' })).toBeVisible();
  await expect(panel.getByText('Tigres Femenil').first()).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Fútbol', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('la sincronización superior actualiza el deporte abierto y respeta el ganador implícito en sus momios', async ({ page }) => {
  await setup(page, '/basquetbol');
  const card = page.getByRole('article', { name: 'Boston Celtics vs LA Lakers' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('54.4%');
  await expect(page.getByRole('button', { name: 'Actualizar encuentros' })).toBeEnabled();
  let currentCalls = 0, footballCalls = 0;
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path === '/api/sports/basquetbol') currentCalls++;
    if (path === '/api/matches') footballCalls++;
  });
  const sync = page.getByRole('button', { name: 'Sincronizar partidos en vivo', exact: true });
  await expect(sync).toBeEnabled();
  await sync.click();
  await expect.poll(() => currentCalls).toBe(4);
  await expect(card).toBeVisible();
  expect(footballCalls).toBe(0);
});

test('femenil actualiza su calendario con los filtros activos y retira datos cuando falla su proveedor', async ({ page }) => {
  await page.clock.install();
  await setup(page);
  await page.getByRole('button', { name: /Liga MX Femenil/ }).click();
  await expect(page.getByText('Tigres Femenil').first()).toBeVisible();
  let unavailable = false, observedLeague;
  const updated = women.map(match => ({ ...match, id: 'espn-femenil-new-game', homeTeam: { ...match.homeTeam, name: 'Nuevo equipo femenil' } }));
  await page.route('**/api/matches/live-sync**', route => {
    observedLeague = new URL(route.request().url()).searchParams.get('league');
    return route.fulfill({ status: unavailable ? 503 : 200, json: unavailable ? { success: false, message: 'Proveedor femenil no disponible' } : { success: true, matches: updated } });
  });
  await page.clock.runFor(25000);
  await expect(page.getByText('Nuevo equipo femenil').first()).toBeVisible();
  await expect(page.getByText('Tigres Femenil', { exact: true })).toHaveCount(0);
  expect(observedLeague).toBe('mexico_femenil');
  unavailable = true;
  await page.clock.runFor(25000);
  await expect(page.getByRole('alert')).toContainText('Proveedor femenil no disponible');
  await expect(page.getByText('Nuevo equipo femenil', { exact: true })).toHaveCount(0);
  await page.route('**/api/matches?**', route => route.fulfill({ status: 503, json: { success: false, message: 'Proveedor femenil no disponible' } }));
  await page.getByRole('button', { name: 'Sincronizar partidos en vivo', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Proveedor femenil no disponible');
  await expect(page.getByText('Feed de datos en vivo sincronizado.', { exact: true })).toHaveCount(0);
});
