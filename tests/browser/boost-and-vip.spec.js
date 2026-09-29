import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const sampleMatches = JSON.parse(readFileSync(new URL('../../server/data/real_matches.json', import.meta.url)))
  .map(match => ({
    ...match,
    kickoff: new Date(Date.now() + 3600000).toISOString(),
    fetchedAt: new Date().toISOString(),
    status: 'SCHEDULED'
  }));

const trialUser = {
  success: true,
  valid: true,
  isTrial: true,
  trialExpired: false,
  role: 'trial_user',
  daysRemaining: 3,
  user: { id: 'test-user', name: 'Cuenta de prueba', email: 'test@example.invalid', plan: 'Prueba 3 Días', daysRemaining: 3 }
};

async function setup(page, { initial = trialUser } = {}) {
  let session = initial;
  await page.route(/^https:\/\//, route => route.abort());
  await page.route('**/src/auth/providers*', route => route.fulfill({
    contentType: 'application/javascript',
    body: 'export const identityProvider = () => ({ signIn: async () => ({ token: "verified-test-token" }), signOut: async () => {} });'
  }));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body = { success: true };
    if (path === '/api/auth/check-session' || path === '/api/auth/session') body = session || { success: false, valid: false };
    if (path === '/api/auth/google') body = session;
    if (path === '/api/auth/logout') { session = null; body = { success: true }; }
    if (path.startsWith('/api/matches')) body = { success: true, matches: sampleMatches.slice(0, 5) };
    if (path === `/api/matches/${sampleMatches[0].id}`) body = { success: true, match: sampleMatches[0] };
    if (path.endsWith('/ai-analysis')) body = { success: true, match: sampleMatches.find(m => path.includes('/' + m.id + '/')), report: { aiAvailable: false, summary: 'Prueba' } };
    if (path === '/api/community') body = { success: true, settings: { links: [] } };
    await route.fulfill({ json: body });
  });
}

test.describe('Boost, Audio and VIP Unlock Modal Verification', () => {

  test('Direct visit to /banqueros activates Banqueros filter and renders banner', async ({ page }) => {
    await setup(page);
    await page.goto('/banqueros');

    // Verify Banqueros is selected
    const bankerTab = page.getByRole('button', { name: /^Banqueros$/ });
    await expect(bankerTab).toBeVisible();

    // Verify banker banner is displayed
    const bannerTitle = page.getByText(/Picks Banqueros Oficiales/);
    await expect(bannerTitle).toBeVisible();

    // Verify header starts at y=0 (no floating links above navbar)
    const header = page.locator('header');
    await expect(header).toBeVisible();
    const headerBox = await header.boundingBox();
    expect(headerBox.y).toBe(0);

    // Verify footer contains the links that were moved
    const footer = page.locator('footer');
    await expect(footer.getByRole('link', { name: 'Contacto' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Privacidad' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Instalar en mi celular' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Eliminar cuenta' })).toBeVisible();
  });

  test('Category Banqueros button navigates to /banqueros and highlights', async ({ page }) => {
    await setup(page);
    await page.goto('/');

    const bankerBtn = page.getByRole('button', { name: /^Banqueros$/ });
    await expect(bankerBtn).toBeVisible();
    await bankerBtn.click();

    expect(page.url()).toContain('/banqueros');
    await expect(bankerBtn).toHaveClass(/border-emerald-500/);
  });

  test('Desbloquear con VIP opens upgrade modal and back navigation closes modal without expelling user', async ({ page }) => {
    await setup(page);
    await page.goto('/boost');

    // Click on "👑 Desbloquear VIP" button in the banker banner
    const unlockBtn = page.getByRole('button', { name: /Desbloquear VIP/ }).first();
    await expect(unlockBtn).toBeVisible();
    await unlockBtn.click();

    // Modal should be open
    const modal = page.getByRole('dialog', { name: 'Acceso a 777 Picks' });
    await expect(modal).toBeVisible();
    await expect(page.getByText('💎 Desbloquear Acceso VIP')).toBeVisible();

    // Press browser / Android back button
    await page.goBack();

    // Modal should now be closed!
    await expect(modal).not.toBeVisible();

    // The user must STILL be logged in (not expelled to login screen!)
    const navbar = page.locator('header');
    await expect(navbar).toBeVisible();
    await expect(page.getByText('3 Días')).toBeVisible();
  });

  test('Desbloquear con VIP modal closes safely via X button without expelling user', async ({ page }) => {
    await setup(page);
    await page.goto('/boost');

    const unlockBtn = page.getByRole('button', { name: /Desbloquear VIP/ }).first();
    await unlockBtn.click();

    const modal = page.getByRole('dialog', { name: 'Acceso a 777 Picks' });
    await expect(modal).toBeVisible();

    // Click 'X' close button
    const closeBtn = modal.getByRole('button', { name: 'Cerrar' });
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    // Modal closes
    await expect(modal).not.toBeVisible();

    // User is still authenticated
    await expect(page.locator('header')).toBeVisible();
    await expect(page.getByText('3 Días')).toBeVisible();
  });

  test('Desbloquear con VIP modal closes safely via Escape key', async ({ page }) => {
    await setup(page);
    await page.goto('/boost');

    const unlockBtn = page.getByRole('button', { name: /Desbloquear VIP/ }).first();
    await unlockBtn.click();

    const modal = page.getByRole('dialog', { name: 'Acceso a 777 Picks' });
    await expect(modal).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Modal closes
    await expect(modal).not.toBeVisible();
    await expect(page.locator('header')).toBeVisible();
  });

  test('Click sound engine executes on user interaction without audio context errors', async ({ page }) => {
    await setup(page);
    await page.goto('/boost');

    // Evaluate that sounds.playClick() can be invoked cleanly even if context was closed
    const soundResult = await page.evaluate(async () => {
      try {
        const { sounds } = await import('/src/utils/audioEffects.js');
        sounds.playClick();
        sounds.playHover();
        sounds.playSuccess();

        // Simulate closed AudioContext (e.g. app pause / backgrounding on mobile)
        if (sounds.ctx && typeof sounds.ctx.close === 'function') {
          await sounds.ctx.close();
          // Now invoke playClick again; it must recreate and not throw
          sounds.playClick();
        }

        return { success: true, enabled: sounds.enabled };
      } catch (e) {
        return { success: false, error: e.message };
      }
    });

    expect(soundResult.success).toBe(true);
    expect(soundResult.enabled).toBe(true);
  });

  test('Opening Desbloquear con VIP from inside MatchDetailModal keeps match modal open when VIP modal is closed with X', async ({ page }) => {
    await setup(page);
    await page.goto('/boost');

    const detailBtn = page.getByRole('button', { name: 'Detalle' }).first();
    await expect(detailBtn).toBeVisible();
    await detailBtn.click();

    const matchDialog = page.getByRole('dialog', { name: 'Detalle del partido' });
    await expect(matchDialog).toBeVisible();

    const unlockInDialog = matchDialog.locator('button', { hasText: 'Desbloquear con VIP' }).first();
    await expect(unlockInDialog).toBeVisible();
    await unlockInDialog.scrollIntoViewIfNeeded();
    await unlockInDialog.click();

    const authGateModal = page.getByRole('dialog', { name: 'Acceso a 777 Picks' });
    await expect(authGateModal).toBeVisible();

    const closeBtn = authGateModal.getByRole('button', { name: 'Cerrar' });
    await closeBtn.click();

    await expect(authGateModal).not.toBeVisible();
    await expect(matchDialog).toBeVisible();
    const closeDetailModalBtn = matchDialog.getByRole('button', { name: 'Cerrar panel' });
    await expect(closeDetailModalBtn).toBeVisible();
  });

  test('Opening Desbloquear con VIP from inside MatchDetailModal pops VIP first then match on back navigation', async ({ page }) => {
    await setup(page);
    await page.goto('/boost');

    const detailBtn = page.getByRole('button', { name: 'Detalle' }).first();
    await expect(detailBtn).toBeVisible();
    await detailBtn.click();

    const matchDialog = page.getByRole('dialog', { name: 'Detalle del partido' });
    await expect(matchDialog).toBeVisible();

    const unlockInDialog = matchDialog.locator('button', { hasText: 'Desbloquear con VIP' }).first();
    await expect(unlockInDialog).toBeVisible();
    await unlockInDialog.scrollIntoViewIfNeeded();
    await unlockInDialog.click();

    const authGateModal = page.getByRole('dialog', { name: 'Acceso a 777 Picks' });
    await expect(authGateModal).toBeVisible();

    // First back: should close VIP modal and KEEP match dialog
    await page.goBack();
    await expect(authGateModal).not.toBeVisible();
    await expect(matchDialog).toBeVisible();

    // Second back: should close match dialog and return to /boost
    await page.goBack();
    await expect(matchDialog).not.toBeVisible();
    expect(page.url()).toContain('/boost');
  });

});
