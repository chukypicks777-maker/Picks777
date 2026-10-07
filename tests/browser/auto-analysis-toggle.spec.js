import { test, expect } from '@playwright/test';
import { SPORT_LEAGUES } from '../../src/constants/leagues.js';

const tabs = { futbol: 'Fútbol', beisbol: 'Béisbol', tenis: 'Tenis', basquetbol: 'Básquetbol' };
const now = Date.now();
const sources = Object.fromEntries(Object.keys(tabs).map(sport => [sport, [0, 1, 2].map(index => {
  const league = sport === 'futbol' ? { id: 'mls', name: 'MLS' } : SPORT_LEAGUES[sport][0];
  return { id: `${sport}-toggle-${index}`, sport, leagueId: league.id, leagueName: league.name,
    homeTeam: { id: `h${index}`, name: `Local ${index}` }, awayTeam: { id: `a${index}`, name: `Visita ${index}` },
    status: 'SCHEDULED', kickoff: new Date(now + 3600000 + index * 60000).toISOString(), odds: {},
    source: 'Fuente aislada de prueba', sourceUrl: 'https://example.invalid', fetchedAt: new Date(now).toISOString(),
    ...(sport === 'futbol' ? { probabilities: { homeWin: 60, draw: 20, awayWin: 20, over15: 70 } }
      : { analysis: { winner: { home: 60, away: 40 }, sampleSize: { home: 8, away: 8 } } }) };
})]));

for (const sport of Object.keys(tabs)) {
  test(`${sport}: Owner checkbox stops an active queue, preserves progress and resumes only pending reports`, async ({ page }) => {
    const calls = [], reports = new Map();
    let releaseBlocked, blockedOnce = false;
    const blocked = new Promise(resolve => { releaseBlocked = resolve; });
    const withReport = match => ({ ...match, aiReport: reports.get(match.id) || null, isAiAnalyzed: reports.has(match.id) });
    await page.setViewportSize({ width: 360, height: 800 });
    await page.addInitScript(() => {
      if (localStorage.getItem('picks777_auto_ai_pref') === null) localStorage.setItem('picks777_auto_ai_pref', 'true');
    });
    await page.route(/^https:\/\//, route => route.abort());
    await page.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      let data = { success: true };
      if (path.startsWith('/api/auth/')) data = { success: true, valid: true, role: 'owner', isAdmin: true, user: { id: 'toggle-owner', plan: 'Owner', name: 'Owner aislado' } };
      if (path === '/api/settings/active-model') data = { success: true, isConfigured: true, selectedModel: 'modelo-aislado' };
      if (path.startsWith('/api/sports/') || path.startsWith('/api/matches')) {
        const requestedSport = path.startsWith('/api/matches') ? 'futbol' : path.split('/')[3];
        const source = sources[requestedSport] || [];
        const match = source.find(match => path.includes(`/${match.id}`));
        if (path.endsWith('/ai-analysis')) {
          calls.push(match.id);
          if (match.id === `${sport}-toggle-1` && !blockedOnce) {
            blockedOnce = true;
            await blocked;
            return route.abort().catch(() => {});
          }
          const report = { aiAvailable: true, dataGrounded: true, modelUsed: 'modelo-aislado', generatedAt: new Date(now).toISOString() };
          reports.set(match.id, report);
          data = { success: true, match: withReport(match), report };
        } else if (path.endsWith('/details')) {
          data = { success: true, matches: source.filter(match => request.postDataJSON().ids.includes(match.id)).map(withReport) };
        } else if (match) data = { success: true, match: withReport(match) };
        else data = { success: true, matches: source.filter(match => !new URL(request.url()).searchParams.has('league') || match.leagueId === new URL(request.url()).searchParams.get('league')).map(withReport), coverage: [] };
      }
      await route.fulfill({ json: data }).catch(() => {});
    });
    try {
      await page.goto(sport === 'futbol' ? '/' : `/${sport}`, { waitUntil: 'domcontentloaded' });
      const checkbox = page.getByRole('checkbox', { name: 'Auto-analizar en segundo plano al cargar' });
      await expect(checkbox).toBeChecked();
      await expect.poll(() => calls.length, { timeout: 15000 }).toBe(2);
      await expect(page.getByText('1 / 3', { exact: true })).toBeVisible();
      let cancelled = false;
      page.on('requestfailed', request => {
        if (request.url().includes(`${sport}-toggle-1/ai-analysis`)) cancelled = true;
      });
      await checkbox.uncheck();
      await expect.poll(() => cancelled).toBe(true);
      await expect(checkbox).not.toBeChecked();
      await expect(page.getByRole('button', { name: 'Detener Análisis', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Analizar Partidos con IA (2)', exact: true })).toBeVisible();
      releaseBlocked();
      // Observe longer than the 2-second autonomous startup delay.
      await page.waitForTimeout(2500);
      expect(calls).toHaveLength(2);
      expect(await page.evaluate(() => localStorage.getItem('picks777_auto_ai_pref'))).toBe('false');

      const other = sport === 'beisbol' ? 'tenis' : 'beisbol';
      await page.getByRole('tab', { name: tabs[other], exact: true }).click();
      await expect(checkbox).not.toBeChecked();
      await page.getByRole('tab', { name: tabs[sport], exact: true }).click();
      await expect(checkbox).not.toBeChecked();
      await expect(page.getByText('1 / 3', { exact: true })).toBeVisible();
      await checkbox.check();
      await expect(checkbox).toBeChecked();
      await expect(page.getByText('3 / 3', { exact: true })).toBeVisible({ timeout: 15000 });
      expect(calls.filter(id => id === `${sport}-toggle-0`)).toHaveLength(1);
      expect(calls.filter(id => id === `${sport}-toggle-1`)).toHaveLength(2);
      expect(calls.filter(id => id === `${sport}-toggle-2`)).toHaveLength(1);
      expect(calls.filter(id => id.startsWith(other))).toHaveLength(0);

      await checkbox.uncheck();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(checkbox).not.toBeChecked();
      await expect(page.getByText('3 / 3', { exact: true })).toBeVisible({ timeout: 15000 });
      expect(calls).toHaveLength(4);
      await test.info().attach('toggle-preserves-progress', { body: JSON.stringify({ sport, calls, cancelled: true, savedPreference: false, completedReports: 3 }), contentType: 'application/json' });
    } finally { releaseBlocked(); }
  });
}
