import { test, expect } from '@playwright/test';
import { SOCIAL_LINKS } from '../../src/constants/socials.js';
test('solo Owner cambia la imagen; ocultarla persiste y un fallo no anuncia éxito', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  let settings = { links: SOCIAL_LINKS, revision: 0, promoImageVisible: true };
  let fail = false;
  await page.route(/^https:\/\//, route => route.abort());
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body = { success: true };
    if (path.startsWith('/api/auth/')) body = { success: true, valid: true, isAdmin: true, role: 'owner', user: { id: 'owner-fixture', name: 'Owner test', plan: 'Owner' } };
    if (path.startsWith('/api/matches')) body = { success: true, matches: [], coverage: [] };
    if (path === '/api/admin/codes') body = { success: true, codes: [], stats: {} };
    if (path === '/api/community' || path === '/api/settings/groups') body = { success: true, settings };
    if (path === '/api/settings/groups/promo-image') {
      if (fail) return route.fulfill({ status: 503, json: { success: false, message: 'Servidor temporalmente no disponible.' } });
      const input = route.request().postDataJSON();
      settings = { ...settings, promoImageVisible: input.visible, revision: settings.revision + 1 };
      body = { success: true, settings };
    }
    await route.fulfill({ json: body });
  });
  const openOwner = async () => {
    await page.getByRole('button', { name: /Owner/ }).filter({ visible: true }).first().click();
    await page.getByRole('button', { name: 'Grupos y Comunidad', exact: true }).click();
  };
  await page.goto('/');
  await expect(page.getByAltText('Comunidad de tipsters y picks')).toHaveCount(1);
  await openOwner();
  const toggle = page.getByRole('switch', { name: 'Mostrar imagen del anuncio' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByAltText('Comunidad de tipsters y picks')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Imagen del anuncio oculta');
  await page.screenshot({ path: 'artifacts/mobile/owner-promo-toggle.png' });
  await page.reload();
  await expect(page.getByAltText('Comunidad de tipsters y picks')).toHaveCount(0);
  await openOwner();
  fail = true;
  await toggle.click();
  await expect(page.getByRole('status')).toContainText('Servidor temporalmente no disponible');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  fail = false;
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByAltText('Comunidad de tipsters y picks')).toHaveCount(1);
});
