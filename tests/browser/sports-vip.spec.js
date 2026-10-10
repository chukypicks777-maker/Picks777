import { test, expect } from '@playwright/test';
import { rankSportWinners } from '../../src/utils/sportPicks.js';
import { SPORT_LEAGUES } from '../../src/constants/leagues.js';

// Baseball, tennis and basketball are VIP-only: trial members only see the
// lock and never reach the sports API. Football keeps its own trial access.
const now = Date.now();
const fixtures = Object.fromEntries(['beisbol', 'tenis', 'basquetbol'].map(sport => [sport, Array.from({ length: 12 }, (_, index) => {
  const probability = 52 + index * 3, league = SPORT_LEAGUES[sport].find(item => item.id === (sport === 'tenis' ? 'atp' : sport === 'beisbol' ? 'mlb' : 'nba'));
  const lines = [1.5, -1.5, 5.5, -5.5].map(line => ({ line, probability: 55 }));
  return { id: `${sport}-vip-${index}`, sport, tour: sport === 'tenis' ? 'atp' : undefined, leagueId: league.id, leagueName: league.name, leagueFlag: league.flag,
    homeTeam: { id: `a-${index}`, name: `Equipo A ${index}`, shortName: `A${index}` }, awayTeam: { id: `b-${index}`, name: `Equipo B ${index}`, shortName: `B${index}` },
    status: 'SCHEDULED', kickoff: new Date(now + (index + 1) * 3600000).toISOString(), source: 'Fuente aislada de prueba', sourceUrl: 'https://example.invalid', fetchedAt: new Date(now).toISOString(), odds: {},
    analysis: { winner: { home: probability, away: 100 - probability }, firstSet: { home: 61, away: 39 }, secondSet: { home: 61, away: 39 }, winsSet: { home: { yes: 84, no: 16 }, away: { yes: 64, no: 36 } },
      firstInning: { home: 30, draw: 45, away: 25 }, firstFive: [{ line: 2.5, over: 58, under: 42 }], extraInnings: { yes: 9, no: 91 }, totalRuns: [{ line: 8.5, over: 50, under: 50 }],
      handicaps: { home: lines, away: lines }, sampleSize: { home: 8, away: 10 }, available: true, method: 'Método de prueba aislado.' } };
})]));

async function setup(page, { sport = 'tenis', vip = false } = {}) {
  const sportRequests = [];
  await page.setViewportSize({ width: 360, height: 800 });
  await page.route(/^https:\/\//, route => route.abort());
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    let data = { success: true };
    if (path.startsWith('/api/auth/')) data = vip
      ? { success: true, valid: true, role: 'vip_user', user: { id: 'vip-client', name: 'Cliente VIP', plan: 'VIP', hasCode: true } }
      : { success: true, valid: true, role: 'trial_user', isTrial: true, trialExpired: false, daysRemaining: 3, user: { id: 'trial-client', name: 'Cliente prueba', plan: 'Prueba 3 Días' } };
    if (path.startsWith('/api/sports/')) {
      sportRequests.push(path);
      const sportId = path.split('/')[3], source = fixtures[sportId] || [], id = path.split('/')[4];
      if (id === 'details') data = { success: true, matches: source.filter(match => request.postDataJSON().ids.includes(match.id)) };
      else if (id) data = { success: true, match: source.find(match => match.id === id) };
      else data = { success: true, matches: url.searchParams.get('category') === 'bankers' ? rankSportWinners(source, now) : source,
        ranking: { examined: source.length, available: source.length }, coverage: SPORT_LEAGUES[sportId].map(league => ({ ...league, leagueId: league.id, status: 'available' })) };
    }
    await route.fulfill({ json: data });
  });
  await page.goto(`/${sport}`, { waitUntil: 'domcontentloaded' });
  await expect(vip ? page.getByRole('article').first() : page.getByRole('tabpanel').getByText('SOLO ACCESO VIP')).toBeVisible({ timeout: 30000 });
  return sportRequests;
}

const openFirstAnalysis = async page => {
  await page.getByRole('tabpanel').getByRole('article').first().getByRole('button', { name: 'Ver análisis y mercados' }).click();
  return page.getByRole('dialog', { name: 'Análisis del encuentro' });
};

test('trial members only see the lock in baseball, tennis and basketball; the unlock opens the VIP window', async ({ page }) => {
  for (const sport of ['tenis', 'beisbol', 'basquetbol']) {
    const sportRequests = await setup(page, { sport });
    const panel = page.getByRole('tabpanel');
    await expect(panel.getByRole('heading', { name: /es exclusivo VIP/ })).toBeVisible();
    await expect(panel.getByRole('article')).toHaveCount(0);
    for (const name of ['Béisbol', 'Tenis', 'Básquetbol']) await expect(page.getByRole('tab', { name: new RegExp(name) }).locator('svg')).toHaveCount(1);
    await expect(page.getByRole('tab', { name: /Fútbol/ }).locator('svg')).toHaveCount(0);
    expect(sportRequests).toEqual([]);
  }
  await page.getByRole('tabpanel').getByRole('button', { name: 'Desbloquear con VIP' }).click();
  await expect(page.getByRole('dialog', { name: 'Acceso a 777 Picks' })).toBeVisible();
});

test('VIP members see every Banquero and market unlocked', async ({ page }) => {
  await setup(page, { sport: 'tenis', vip: true });
  const panel = page.getByRole('tabpanel');
  await expect(panel.getByRole('article').first().getByText('VIP', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /Tenis/ }).locator('svg')).toHaveCount(0);
  const dialog = await openFirstAnalysis(page);
  await expect(dialog.getByRole('region', { name: 'Ganador del primer set' })).toBeVisible();
  await page.keyboard.press('Escape');
  await panel.getByRole('button', { name: 'Banqueros', exact: true }).click();
  await expect(panel.getByRole('article')).toHaveCount(10);
  await expect(panel.getByText('SOLO ACCESO VIP')).toHaveCount(0);
  await expect(panel.getByText(/reservados para miembros VIP/)).toHaveCount(0);

  await setup(page, { sport: 'beisbol', vip: true });
  const dialogRuns = await openFirstAnalysis(page);
  await expect(dialogRuns.getByRole('region', { name: 'Totales extra innings' }).getByText('50%')).toHaveCount(2);
  await expect(dialogRuns.getByText('SOLO ACCESO VIP')).toHaveCount(0);
});
