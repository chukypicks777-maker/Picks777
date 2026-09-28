import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const sampleMatches = JSON.parse(readFileSync(new URL('../../server/data/real_matches.json', import.meta.url))).map(match => ({ ...match, kickoff: new Date(Date.now() + 3600000).toISOString(), fetchedAt: new Date().toISOString(), status: 'SCHEDULED' }));

const trial = { success: true, valid: true, isTrial: true, trialExpired: false, role: 'trial_user', daysRemaining: 3,
  user: { id: 'test-user', name: 'Cuenta de prueba', email: 'test@example.invalid', plan: 'Prueba 3 Días', daysRemaining: 3 } };
async function setup(page, { initial = null, loseCookie = false, googleResult = trial } = {}) {
  let session = initial;
  // Deterministic UI checks do not depend on third-party fonts and badge servers.
  await page.route(/^https:\/\//, route => route.abort());
  await page.route('**/src/auth/providers*', route => route.fulfill({ contentType: 'application/javascript', body:
    'export const identityProvider = () => ({ signIn: async () => ({token:"verified-test-token"}), signOut: async () => {} });' }));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body = { success: true };
    if (path === '/api/auth/check-session' || path === '/api/auth/session') body = session || { success: false, valid: false };
    if (path === '/api/auth/google') { body = googleResult; if (!loseCookie) session = googleResult; }
    if (path === '/api/auth/logout') session = null;
    if (path.startsWith('/api/matches')) body = { success: true, matches: sampleMatches.slice(0, 3) };
    if (path === `/api/matches/${sampleMatches[0].id}`) body = { success: true, match: sampleMatches[0] };
    if (path.endsWith('/ai-analysis')) body = { success: true, match: sampleMatches.find(match => path.includes('/' + match.id + '/')), report: { aiAvailable: false, summary: 'Fixture de prueba de interfaz' } };
    if (path === '/api/community') body = { success: true, settings: { links: [] } };
    if (path === '/api/admin/codes') body = { success: true, codes: [], stats: { total: 0, active: 0, available: 0, expired: 0 } };
    if (path === '/api/admin/mobile') body = { success: true, available: true, versionName: '1.0.5', versionCode: 4, bytes: 724735, sha256: 'a'.repeat(64), origin: 'https://picks777.vercel.app' };
    await route.fulfill({ json: body });
  });
}

test('owner puede abrir instalación Android en una pantalla de 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await setup(page, { initial: { ...trial, isAdmin: true, isTrial: false, role: 'owner' } });
  await page.goto('/');
  const owner = page.getByRole('button', { name: /Owner/ });
  for (const button of await owner.all()) if (await button.isVisible()) { await button.click(); break; }
  await page.getByRole('button', { name: 'Aplicación Android', exact: true }).click();
  const download = page.getByRole('link', { name: 'Descargar APK para instalar' });
  await expect(download).toBeVisible();
  await expect(download).toHaveAttribute('href', '/api/admin/mobile/apk');
  await download.scrollIntoViewIfNeeded();
  const bounds = await download.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(360);
  await page.screenshot({ path: 'artifacts/mobile/admin-android-360.png' });
});

test('un informe estadístico no se anuncia como análisis IA exitoso', async ({ page }) => {
  await setup(page, { initial: { ...trial, isAdmin: true, isTrial: false, role: 'owner' } });
  await page.goto('/');
  await page.getByRole('button', { name: /Analizar Partidos con IA/ }).click();
  await expect(page.getByText(/0 informes con IA, 3 cálculos estadísticos y 0 solicitudes sin resultado/)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/89% de efectividad/)).toHaveCount(0);
});

for (const [width, height] of [[320,568], [844,390]]) {
  test(`detalle y parlay conservan controles accesibles ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await setup(page, { initial: trial });
    await page.goto('/');
    await page.getByRole('button', { name: 'Ver Informe', exact: true }).first().click();
    const close = page.getByRole('button', { name: 'Cerrar panel', exact: true });
    await expect(close).toBeVisible();
    const bounds = await close.boundingBox();
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
    await page.screenshot({ path: `artifacts/mobile/detail-${width}x${height}.png` });
    await close.click();
    const parlay = page.getByRole('button', { name: /^Parlay/ });
    for (const button of await parlay.all()) if (await button.isVisible()) { await button.click(); break; }
    const closeParlay = page.getByRole('button', { name: 'Cerrar parlay' });
    await expect(closeParlay).toBeVisible();
    await closeParlay.click();
    await expect(closeParlay).toHaveCount(0);
  });
}

test('Google → prueba gratuita → recarga conserva acceso sin guardar privilegios en localStorage', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Continuar con Google' }).click();
  await page.getByRole('button', { name: 'Continuar con mi Prueba Gratuita (3 Días)', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Acceso a 777 Picks' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Acceso a 777 Picks' })).toHaveCount(0);
  await expect(page.getByText('Comprobando tu sesión…')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('deportepicks_auth'))).toBeNull();
});

test('Google restaura VIP y entra sin volver a pedir el código', async ({ page }) => {
  await setup(page, { googleResult: { ...trial, isTrial: false, role: 'vip_user', user: { ...trial.user, plan: 'VIP', hasCode: true } } });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continuar con Google' }).click();
  await expect(page.getByRole('dialog', { name: 'Acceso a 777 Picks' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Acceso a 777 Picks' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ver Informe', exact: true }).first()).toBeVisible();
});

test('cookie no persistida muestra un error y mantiene el paso de prueba', async ({ page }) => {
  await setup(page, { loseCookie: true });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continuar con Google' }).click();
  await page.getByRole('button', { name: 'Continuar con mi Prueba Gratuita (3 Días)', exact: true }).click();
  await expect(page.getByText(/No se pudo conservar la sesión/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Continuar con mi Prueba/ })).toBeVisible();
});

test('cambiar de cuenta regresa al selector y permite volver a entrar', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Continuar con Google' }).click();
  await page.getByRole('button', { name: '← Cambiar de cuenta Google', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar con Google' }).click();
  await page.getByRole('button', { name: /Continuar con mi Prueba/ }).click();
  await expect(page.getByRole('dialog', { name: 'Acceso a 777 Picks' })).toHaveCount(0);
});

test('prueba vencida no ofrece continuar sin código', async ({ page }) => {
  await setup(page, { initial: { ...trial, valid: false, trialExpired: true } });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Reactivar Acceso con Clave' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Continuar con mi Prueba/ })).toHaveCount(0);
});

for (const [width, height] of [[320,568], [360,640], [390,844], [412,915], [600,960], [844,390]]) {
  test(`acceso y página adaptables ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await setup(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', { name: 'Continuar con Google' }).click();
    const continueButton = page.getByRole('button', { name: /Continuar con mi Prueba/ });
    await continueButton.scrollIntoViewIfNeeded();
    const bounds = await continueButton.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
    await page.screenshot({ path: `artifacts/mobile/login-${width}x${height}.png` });
    await continueButton.click();
    await expect(page.getByRole('dialog', { name: 'Acceso a 777 Picks' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/mobile/home-${width}x${height}.png` });
    expect(errors).toEqual([]);
  });
}
