import { test, expect } from '@playwright/test';
test('acceso Android confirma la cuenta, oculta el ticket y vuelve sin credenciales en el enlace', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route(/^https:\/\//, route => route.abort());
  await page.route('**/src/utils/firebase*', route => route.fulfill({ contentType: 'application/javascript', body: 'export const loginWithRealGoogle=async()=>({token:"verified-fixture",user:{email:"fixture@example.invalid"}});export const logoutIdentity=async()=>{};' }));
  let posted;
  await page.route('**/api/auth/mobile/complete', async route => { posted = route.request().postDataJSON(); await route.fulfill({ json: { success: true } }); });
  await page.goto('/mobile-auth#' + 'a'.repeat(64));
  await expect(page).toHaveURL(/\/mobile-auth$/);
  await page.getByRole('button', { name: 'Continuar con Google' }).click();
  await expect(page.getByText('fixture@example.invalid', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar esta cuenta' }).click();
  await expect(page.getByRole('status')).toContainText('Identidad confirmada');
  const back = page.getByRole('link', { name: 'Volver a 777 Picks' });
  await expect(back).toHaveAttribute('href', 'picks777://auth-return');
  expect(posted).toEqual({ id: 'a'.repeat(64), credential: 'verified-fixture' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/mobile/native-auth-320.png' });
});
test('una solicitud móvil sin ticket no permite iniciar ni confirmar identidad', async ({ page }) => {
  await page.goto('/mobile-auth');
  await expect(page.getByRole('alert')).toContainText('Solicitud no válida');
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toHaveCount(0);
});
