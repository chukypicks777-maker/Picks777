import { test, expect } from '@playwright/test';

test('installation works without a VIP session on narrow phones and tablets', async ({ page }) => {
  await page.route(/^https:\/\//, route => route.abort());
  for (const [width, height] of [[320,568],[390,844],[768,1024]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/instalar');
    await expect(page.getByRole('heading', { name: 'Instalar 777 Picks', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'iPhone y iPad' })).toBeVisible();
    await expect(page.getByText(/Añadir a pantalla de inicio/).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const icon = page.locator('link[rel="apple-touch-icon"]');
  await expect(icon).toHaveAttribute('href', '/icons/apple-touch-icon.png');
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  for (const item of manifest.icons) {
    const response = await page.request.get(item.src);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('image/png');
  }
  await page.screenshot({ path: `artifacts/mobile/install-${test.info().project.name}.png` });
});
