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

async function setup(page, { initial = trialUser, redeem = null, sessionOutage = false } = {}) {
  let session = initial;
  let sessionChecks = 0;
  await page.route(/^https:\/\//, route => route.abort());
  await page.route('**/src/auth/providers*', route => route.fulfill({
    contentType: 'application/javascript',
    body: 'export const identityProvider = () => ({ signIn: async () => ({ token: "verified-test-token" }), signOut: async () => {} });'
  }));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/session' && sessionOutage && ++sessionChecks > 1) {
      await route.fulfill({ status: 503, json: { success: false, message: 'Almacenamiento temporalmente no disponible.' } });
      return;
    }
    let body = { success: true };
    if (path === '/api/auth/check-session' || path === '/api/auth/session') body = session || { success: false, valid: false };
    if (path === '/api/auth/google') body = session;
    if (path === '/api/auth/apple') { session = { ...trialUser, user: { ...trialUser.user, provider: 'apple' } }; body = session; }
    if (path === '/api/auth/logout') { session = null; body = { success: true }; }
    if (path === '/api/auth/redeem-code') {
      body = redeem || { success: false, message: 'Código incorrecto o vencido.' };
      if (redeem) session = redeem;
    }
    if (path.startsWith('/api/matches')) body = { success: true, matches: sampleMatches.slice(0, 5) };
    if (path === `/api/matches/${sampleMatches[0].id}`) body = { success: true, match: sampleMatches[0] };
    if (path.endsWith('/ai-analysis')) body = { success: true, match: sampleMatches.find(m => path.includes('/' + m.id + '/')), report: { aiAvailable: false, summary: 'Prueba' } };
    if (path === '/api/community') body = { success: true, settings: { links: [] } };
    await route.fulfill({ json: body });
  });
}

test.describe('Boost, Audio and VIP Unlock Modal Verification', () => {
  test('an invalid VIP code preserves the account, current page and session after reload', async ({ page }) => {
    await setup(page);
    const logouts = [];
    page.on('request', request => { if (request.url().endsWith('/api/auth/logout')) logouts.push(request.url()); });
    await page.goto('/banqueros');
    await page.getByRole('button', { name: /Desbloquear VIP/ }).first().click();
    const modal = page.getByRole('dialog', { name: 'Acceso a 777 Picks' });
    await expect(modal.getByRole('heading', { name: 'Activar membresía VIP' })).toBeVisible();
    await expect(modal.getByText('test@example.invalid', { exact: true })).toBeVisible();
    await modal.getByPlaceholder('Ingresa tu código de acceso').fill('INVALID-CODE');
    await modal.getByRole('button', { name: 'Canjear Clave VIP', exact: true }).click();
    await expect(modal.getByText('Código incorrecto o vencido.', { exact: true })).toBeVisible();
    await modal.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(modal).not.toBeVisible();
    await page.reload();
    await expect(page.locator('header')).toBeVisible();
    await expect(modal).not.toBeVisible();
    expect(page.url()).toContain('/banqueros');
    expect(logouts).toEqual([]);
  });

  test('VIP redemption confirms the stored membership and keeps it on reload', async ({ page }) => {
    const vip = { ...trialUser, isTrial: false, role: 'vip_user', user: { ...trialUser.user, hasCode: true, plan: 'VIP' } };
    await setup(page, { redeem: vip });
    await page.goto('/banqueros');
    await page.getByRole('button', { name: /Desbloquear VIP/ }).first().click();
    const modal = page.getByRole('dialog', { name: 'Acceso a 777 Picks' });
    await modal.getByPlaceholder('Ingresa tu código de acceso').fill('VALID-CODE');
    await modal.getByRole('button', { name: 'Canjear Clave VIP', exact: true }).click();
    await expect(modal).not.toBeVisible();
    await expect(page.getByRole('button', { name: /Desbloquear VIP/ })).toHaveCount(0);
    await page.reload();
    await expect(page.locator('header')).toBeVisible();
    await expect(page.getByRole('button', { name: /Desbloquear VIP/ })).toHaveCount(0);
  });

  test('a session refresh outage preserves identity after expiry but requires reactivation', async ({ page }) => {
    const now = Date.now();
    await page.clock.install({ time: now });
    await setup(page, { initial: { ...trialUser, user: { ...trialUser.user, expiresAt: new Date(now + 60000).toISOString() } }, sessionOutage: true });
    await page.goto('/banqueros');
    await page.getByRole('button', { name: /Desbloquear VIP/ }).first().click();
    await page.clock.fastForward(61000);
    await expect(page.getByRole('alert')).toContainText('Almacenamiento temporalmente no disponible.');
    const modal = page.getByRole('dialog', { name: 'Acceso a 777 Picks' });
    await expect(modal.getByText('test@example.invalid', { exact: true })).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Continuar con Google' })).toHaveCount(0);
    await expect(modal.getByRole('button', { name: 'Reactivar Acceso con Clave' })).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Cerrar', exact: true })).toHaveCount(0);
    await expect(page.locator('header')).toBeVisible();
    await expect(modal).toBeVisible();
  });

  test('the iPhone native channel contains no code redemption or external sales communities', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { value: navigator.userAgent + ' Picks777iOS/1' }));
    await setup(page);
    await page.goto('/banqueros');
    await page.getByRole('button', { name: 'Mi acceso', exact: true }).last().click();
    const modal = page.getByRole('dialog', { name: 'Acceso a 777 Picks' });
    await expect(modal.getByRole('button', { name: 'Actualizar estado de mi cuenta' })).toBeVisible();
    await expect(modal.getByPlaceholder('Ingresa tu código de acceso')).toHaveCount(0);
    await expect(page.locator('a[href*="t.me"],a[href*="wa.me"],a[href*="whatsapp.com"],a[href*="instagram.com"]')).toHaveCount(0);
    await modal.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(page.locator('header')).toBeVisible();
    await page.screenshot({ path: 'artifacts/ios-account-channel.png' });
  });

  test('iPhone offers Apple login and confirms the account without requesting a VIP code', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { value: navigator.userAgent + ' Picks777iOS/1' }));
    await setup(page, { initial: null });
    await page.goto('/');
    await page.getByRole('button', { name: 'Continuar con Apple', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Acceso a 777 Picks' });
    await expect(modal.getByRole('button', { name: 'Actualizar estado de mi cuenta' })).toBeVisible();
    await expect(modal.getByPlaceholder('Ingresa tu código de acceso')).toHaveCount(0);
    await modal.getByRole('button', { name: /Continuar con mi Prueba/ }).click();
    await expect(modal).not.toBeVisible();
    await expect(page.locator('header')).toBeVisible();
    await page.reload();
    await expect(modal).not.toBeVisible();
    await expect(page.locator('header')).toBeVisible();
  });

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
