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
    kickoff: new Date(now + 3600000).toISOString(), source: 'Fuente de prueba', sourceUrl: 'https://example.invalid', fetchedAt: new Date(now).toISOString(), odds: {} };
  const games = [0, 1, 2, 3, 4, 5].flatMap(i => [
    { ...match, id: `a-${i}`, status: 'FINISHED', kickoff: new Date(now - (i + 1) * 86400000).toISOString(), awayTeam: { id: 'c' }, finalScore: { home: 102 + i * 2, away: 98 + i },
      setScores: [{ home: 6, away: 3 }, { home: 6, away: 4 }] },
    { ...match, id: `b-${i}`, status: 'FINISHED', kickoff: new Date(now - (i + 1) * 86400000).toISOString(), homeTeam: { id: 'c' }, finalScore: { home: 99 + i, away: 101 + i * 2 },
      setScores: [{ home: 6, away: 3 }, { home: 6, away: 4 }] }
  ]);
  if (sport === 'beisbol') games.forEach((game, i) => { game.finalScore = { home: 3 + i % 4, away: 1 + i % 3 }; });
  if (sport === 'tenis') { match.tour = 'atp'; games.forEach(game => { game.tour = 'atp'; }); match.maxSets = 3; }
  match.analysis = sport === 'beisbol' ? baseballAnalysis(match, games, now) : sport === 'tenis' ? tennisAnalysis(match, games, now) : basketballAnalysis(match, games, now);
  return match;
}
const feeds = {
  beisbol: [fixture('beisbol', 'mlb', 'LA Dodgers', 'ATL Braves'), fixture('beisbol', 'npb', 'Rakuten', 'SoftBank')],
  tenis: [fixture('tenis', 'atp', 'Jugador A', 'Jugador B'), fixture('tenis', 'wimbledon', 'Jugador C', 'Jugador D')],
  basquetbol: [fixture('basquetbol', 'nba', 'Boston Celtics', 'LA Lakers'), fixture('basquetbol', 'wnba', 'New York Liberty', 'Las Vegas Aces')]
};

async function setup(page, path = '/') {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.route(/^https:\/\//, route => route.abort());
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    let body = { success: true };
    if (path.startsWith('/api/auth/')) body = { success: true, valid: true, role: 'vip_user', user: { id: 'sports-client', name: 'Cliente', plan: 'VIP' } };
    if (path.startsWith('/api/matches')) {
      const matches = url.searchParams.get('sport') === 'femenil' || path.includes('femenil') ? women : football;
      body = { success: true, matches, match: matches[0] };
      if (path.endsWith('/ai-analysis')) body.report = { aiAvailable: false, summary: 'Informe de prueba' };
    }
    if (path.startsWith('/api/sports/')) {
      const sport = path.split('/')[3];
      body = path.split('/').length > 4 ? { success: true, match: feeds[sport].find(match => match.id === path.split('/')[4]) }
        : { success: true, matches: feeds[sport], coverage: SPORT_LEAGUES[sport].map(league => ({ leagueId: league.id, name: league.name, status: 'available' })) };
    }
    if (path === '/api/community') body = { success: true, settings: { links: [] } };
    await route.fulfill({ json: body });
  });
  await page.goto(path);
}

test('la liga femenil tiene encuentros propios, informe, recarga y regreso a fútbol', async ({ page }) => {
  await setup(page);
  const tabs = page.getByRole('tablist', { name: 'Deportes' });
  await expect(tabs.getByRole('tab')).toHaveCount(5);
  await tabs.getByRole('tab', { name: 'Liga femenil', exact: true }).click();
  await expect(page).toHaveURL(/\/femenil$/);
  const panel = page.getByRole('tabpanel');
  await expect(panel.getByRole('heading', { name: '🇲🇽 Liga MX Femenil' })).toBeVisible();
  await expect(panel.getByText('Tigres Femenil').first()).toBeVisible();
  await panel.locator('button').filter({ hasText: 'Liga MX Femenil' }).first().click();
  await page.getByRole('button', { name: /^(Ver Informe|Detalle)$/ }).first().click();
  await expect(page.getByRole('dialog', { name: 'Detalle del partido' })).toContainText('Tigres Femenil');
  await page.getByRole('button', { name: 'Cerrar panel', exact: true }).click();
  await expect(panel.getByText('Tigres Femenil').first()).toBeVisible();
  await page.reload();
  await expect(panel.getByText('Tigres Femenil').first()).toBeVisible();
  await tabs.getByRole('tab', { name: 'Fútbol', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ver Informe', exact: true }).first()).toBeVisible();
  await expect(page.getByText('Tigres Femenil', { exact: true })).toHaveCount(0);
});

test('béisbol muestra cuatro ligas y carreras 1.5–5.5 por equipo, empate del primer inning y total 1 a 5', async ({ page }) => {
  await setup(page, '/beisbol');
  const panel = page.getByRole('tabpanel');
  for (const name of ['MLB', 'NPB', 'KBO', 'LMB']) await expect(panel.getByRole('button', { name: new RegExp(name) })).toBeVisible();
  await panel.getByRole('button', { name: /MLB/ }).click();
  await expect(panel.getByRole('article')).toHaveCount(1);
  await panel.getByRole('button', { name: 'Ver análisis y mercados' }).click();
  const dialog = page.getByRole('dialog', { name: 'Análisis del encuentro' });
  for (const name of ['Carreras · LA Dodgers', 'Carreras · ATL Braves', 'Innings 1 a 5 · Total de carreras de ambos equipos']) {
    const market = dialog.getByRole('region', { name, exact: true });
    for (const line of ['1.5', '2.5', '3.5', '4.5', '5.5']) await expect(market.getByRole('rowheader', { name: line, exact: true })).toHaveCount(1);
    await expect(market.getByRole('columnheader', { name: 'Más de' })).toHaveCount(1);
    await expect(market.getByRole('columnheader', { name: 'Menos de' })).toHaveCount(1);
  }
  await expect(dialog.getByRole('region', { name: 'Primer inning · 1X2' }).getByText('Empate', { exact: true })).toHaveCount(1);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.screenshot({ path: `artifacts/mobile/baseball-markets-${test.info().project.name}.png` });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
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
