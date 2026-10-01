import { test, expect } from '@playwright/test';
import { SOCIAL_LINKS } from '../../src/constants/socials.js';
test('Owner oculta todo el anuncio; persiste y un fallo no anuncia éxito', async ({ page }) => {
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
  const announcement = page.getByRole('region', { name: 'Anuncio de comunidad' });
  await expect(announcement).toHaveCount(1);
  await expect(announcement.getByText('COMUNIDAD DE PICKS', { exact: true })).toBeVisible();
  await expect(announcement.getByRole('link')).toHaveCount(4);
  await expect(page.getByAltText('Comunidad de tipsters y picks')).toHaveCount(1);
  await openOwner();
  const toggle = page.getByRole('switch', { name: 'Mostrar anuncio de comunidad' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(announcement).toHaveCount(0);
  await expect(page.getByText('COMUNIDAD DE PICKS', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Tipsters Incluidos Diariamente:', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Únete a la comunidad y consulta cómo obtener tu código de acceso.', { exact: true })).toHaveCount(0);
  await expect(page.getByAltText('Comunidad de tipsters y picks')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Anuncio de comunidad oculto');
  await page.screenshot({ path: 'artifacts/mobile/owner-promo-toggle.png' });
  await page.reload();
  await expect(announcement).toHaveCount(0);
  await expect(page.getByAltText('Comunidad de tipsters y picks')).toHaveCount(0);
  await openOwner();
  fail = true;
  await toggle.click();
  await expect(page.getByRole('status')).toContainText('Servidor temporalmente no disponible');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(announcement).toHaveCount(0);
  fail = false;
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(announcement).toHaveCount(1);
  await expect(announcement.getByRole('link')).toHaveCount(4);
  await expect(page.getByAltText('Comunidad de tipsters y picks')).toHaveCount(1);
});

test('una visita nueva oculta todo el bloque si el Owner ya lo desactivó', async ({ page }) => {
  await page.setViewportSize({ width: 1354, height: 768 });
  await page.addInitScript(links => localStorage.setItem('picks_social_settings', JSON.stringify({ links, revision: 0, promoImageVisible: true })), SOCIAL_LINKS);
  await page.route(/^https:\/\//, route => route.abort());
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body = { success: true };
    if (path.startsWith('/api/auth/')) body = { success: true, valid: true, role: 'vip_user', user: { id: 'visitor-fixture', name: 'Visitante', plan: 'VIP' } };
    if (path.startsWith('/api/matches')) body = { success: true, matches: [], coverage: [] };
    if (path === '/api/community') body = { success: true, settings: { links: SOCIAL_LINKS, revision: 1, promoImageVisible: false } };
    await route.fulfill({ json: body });
  });
  await page.goto('/');
  await expect(page.locator('footer')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Anuncio de comunidad' })).toHaveCount(0);
  await expect(page.getByText('COMUNIDAD DE PICKS', { exact: true })).toHaveCount(0);
  await expect(page.getByAltText('Comunidad de tipsters y picks')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('footer')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Anuncio de comunidad' })).toHaveCount(0);
});
