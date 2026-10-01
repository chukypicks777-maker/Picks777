import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { SOCIAL_LINKS } from '../../src/constants/socials.js';
import { getContextualPick, getEffectiveOdds } from '../../src/utils/mathProbabilities.js';
import { formatOdds } from '../../src/utils/oddsFormatter.js';
import { formatCurrency } from '../../src/utils/currencyFormatter.js';

const matches = JSON.parse(readFileSync(new URL('../../server/data/real_matches.json', import.meta.url))).slice(0, 3).map((match, index) => ({
  ...match, id: 100 + index, isFeatured: index === 0,
  kickoff: new Date(Date.now() + 3600000).toISOString(), status: 'SCHEDULED', fetchedAt: new Date().toISOString()
}));
const firstPick = getContextualPick(matches[0]);
const dailyLegs = [
  { ...firstPick, matchId: String(matches[0].id), odds: 2.05 },
  { matchId: 'daily-other', selection: 'Gana visitante', matchTitle: 'Otro partido', league: 'Prueba', odds: 1.87, probability: 55 }
];

async function setup(page, { daily = dailyLegs } = {}) {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.route(/^https:\/\//, route => route.abort());
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body = { success: true };
    if (path.startsWith('/api/auth/')) body = { success: true, valid: true, role: 'vip_user', user: { id: 'client-fixture', name: 'Cliente de prueba', plan: 'VIP' } };
    if (path.startsWith('/api/matches')) body = { success: true, matches, match: matches.find(match => path.includes('/' + match.id)) };
    if (path.endsWith('/ai-analysis')) body = { ...body, report: { aiAvailable: false, summary: 'Prueba determinista' } };
    if (path === '/api/community') body = { success: true, settings: { links: SOCIAL_LINKS, revision: 1, promoImageVisible: true } };
    if (path === '/api/parlays/daily-ai') body = { success: true, bankerParlay: { legs: daily } };
    await route.fulfill({ json: body });
  });
  await page.goto('/');
  await expect(page.locator('.tilt-card-inner').first()).toBeVisible();
}

async function openTicket(page) {
  await page.locator('header').getByRole('button', { name: /^Parlay/ }).filter({ visible: true }).first().click();
}

test('el anuncio permanece oculto al cambiar de mercado y recargar', async ({ page }) => {
  await setup(page);
  const hide = page.getByRole('button', { name: 'Ocultar', exact: true });
  const target = await hide.boundingBox();
  expect(target.width).toBeGreaterThanOrEqual(44);
  expect(target.height).toBeGreaterThanOrEqual(44);
  await hide.tap();
  await expect(page.getByText('Comunidades oficiales', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Banqueros', exact: true }).click();
  await page.getByRole('button', { name: 'Todos los Mercados', exact: true }).click();
  await expect(page.getByText('Comunidades oficiales', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('header')).toBeVisible();
  await expect(page.getByText('Comunidades oficiales', { exact: true })).toHaveCount(0);
});

test('el retorno usa el producto completo de cuotas antes de redondear', async ({ page }) => {
  await setup(page);
  await openTicket(page);
  await page.getByRole('button', { name: 'Cargar Banquero', exact: true }).click();
  const amount = page.locator('input[type="number"]');
  await amount.fill('100');
  const payout = page.getByText('Retorno Potencial:', { exact: true }).locator('..').locator('..');
  await expect(payout).toContainText(formatCurrency(383.35, 'USD'));
});

test('un ID numérico y su texto identifican el mismo partido sin duplicar la cuota', async ({ page }) => {
  await setup(page);
  await openTicket(page);
  await page.getByRole('button', { name: 'Cargar Banquero', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar parlay', exact: true }).click();
  const card = page.locator('.tilt-card-inner').filter({ hasText: matches[0].homeTeam.name }).first();
  await card.getByRole('button', { name: /Al Parlay|En Parlay/ }).click();
  // Toggle removes the already selected pick; it must never append it twice.
  await expect(page.locator('header').getByRole('button', { name: /^Parlay/ }).filter({ visible: true }).first()).toContainText('1');
});

for (const format of ['decimal', 'american', 'fractional']) {
  test(`las cuotas se multiplican y cada pick conserva su momio (${format})`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('oddsFormat', value), format);
    await setup(page);
    const picks = matches.slice(0, 2).map(match => getContextualPick(match));
    for (const match of matches.slice(0, 2)) {
      const card = page.locator('.tilt-card-inner').filter({ hasText: match.homeTeam.name }).first();
      await card.getByRole('button', { name: /Al Parlay/ }).click();
      await page.getByRole('button', { name: 'Cerrar parlay', exact: true }).click();
    }
    await openTicket(page);
    const total = page.getByText('Multiplicador Cuota:', { exact: true }).locator('..');
    await expect(total).toContainText(formatOdds(getEffectiveOdds(picks[0]) * getEffectiveOdds(picks[1]), format));
    for (const pick of picks) {
      const row = page.getByRole('region', { name: 'Boleto de parlay' }).getByText(pick.matchTitle, { exact: false }).locator('..').locator('..');
      await expect(row).toContainText(formatOdds(getEffectiveOdds(pick), format));
    }
    await page.getByRole('button', { name: 'Vaciar', exact: true }).click();
    await expect(page.getByText(/Ticket vacío/)).toBeVisible();
    await expect(total).toHaveCount(0);
  });
}

test('nuevo boleto elimina selecciones, cuota y monto previos incluso minimizado', async ({ page }) => {
  await setup(page);
  await openTicket(page);
  await page.getByRole('button', { name: 'Cargar Banquero', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Monto (USD)' }).fill('300');
  await page.getByRole('button', { name: 'Minimizar parlay' }).click();
  await page.getByRole('button', { name: 'Nuevo boleto', exact: true }).tap();
  await expect(page.getByText(/Ticket vacío/)).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar parlay', exact: true }).click();
  await page.locator('.tilt-card-inner').first().getByRole('button', { name: /Al Parlay/ }).click();
  await expect(page.getByRole('spinbutton', { name: 'Monto (USD)' })).toHaveValue('50');
  await expect(page.locator('header').getByRole('button', { name: /^Parlay/ }).filter({ visible: true }).first()).toContainText('1');
  await expect(page.getByRole('region', { name: 'Boleto de parlay' }).getByText('Otro partido', { exact: false })).toHaveCount(0);
  await page.screenshot({ path: `artifacts/mobile/client-parlay-${test.info().project.name}.png` });
});

test('cambiar selección del mismo partido recalcula sin sumar el pick anterior', async ({ page }) => {
  await setup(page);
  const card = page.locator('.tilt-card-inner').first();
  await card.getByRole('button', { name: /Al Parlay/ }).click();
  await page.getByRole('button', { name: 'Cerrar parlay', exact: true }).click();
  await card.getByRole('button', { name: /^(Detalle|Ver Informe)$/ }).click();
  const detail = page.getByRole('dialog', { name: 'Detalle del partido' });
  await detail.getByRole('button', { name: 'Cambiar selección en Parlay', exact: true }).first().click();
  const ticket = page.getByRole('region', { name: 'Boleto de parlay' });
  await expect(page.locator('header').getByRole('button', { name: /^Parlay/ }).filter({ visible: true }).first()).toContainText('1');
  await expect(ticket.getByText(firstPick.selection, { exact: true })).toHaveCount(0);
  const rowOdd = ticket.getByLabel(`Momio de ${firstPick.matchTitle}`, { exact: true });
  const total = ticket.getByText('Multiplicador Cuota:', { exact: true }).locator('..');
  await expect(total).toContainText(await rowOdd.textContent());
});

test('ocultar funciona al navegar aunque el navegador bloquee guardar preferencias', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Almacenamiento bloqueado', 'SecurityError'); };
  });
  await setup(page);
  await page.getByRole('button', { name: 'Ocultar', exact: true }).tap();
  await page.getByRole('button', { name: 'Banqueros', exact: true }).click();
  await page.getByRole('button', { name: 'Todos los Mercados', exact: true }).click();
  await expect(page.getByText('Comunidades oficiales', { exact: true })).toHaveCount(0);
});

test('una respuesta diaria tardía no restaura el boleto que se acaba de vaciar', async ({ page }) => {
  await setup(page);
  let release, started;
  const response = new Promise(resolve => { release = resolve; });
  const requested = new Promise(resolve => { started = resolve; });
  let completed;
  const done = new Promise(resolve => { completed = resolve; });
  await page.route('**/api/parlays/daily-ai', async route => {
    started();
    await response;
    try { await route.fulfill({ json: { success: true, bankerParlay: { legs: dailyLegs } } }); }
    catch { /* The client cancels this response when the user starts a new ticket. */ }
    finally { completed(); }
  });
  await openTicket(page);
  await page.getByRole('button', { name: 'Cargar Banquero', exact: true }).click();
  await requested;
  await expect(page.getByRole('button', { name: 'Cargando…', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Nuevo boleto', exact: true }).click();
  release();
  await done;
  await expect(page.getByText(/Ticket vacío/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cargar Banquero', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Cerrar parlay', exact: true }).click();
  await page.locator('.tilt-card-inner').first().getByRole('button', { name: /Al Parlay/ }).click();
  await expect(page.locator('header').getByRole('button', { name: /^Parlay/ }).filter({ visible: true }).first()).toContainText('1');
  await expect(page.getByRole('region', { name: 'Boleto de parlay' }).getByText('Otro partido', { exact: false })).toHaveCount(0);
});

test('una carga diaria fallida conserva el boleto y comunica el error', async ({ page }) => {
  await setup(page);
  await page.locator('.tilt-card-inner').first().getByRole('button', { name: /Al Parlay/ }).click();
  const ticket = page.getByRole('region', { name: 'Boleto de parlay' });
  const previousTotal = await ticket.getByText('Multiplicador Cuota:', { exact: true }).locator('..').textContent();
  await page.route('**/api/parlays/daily-ai', route => route.fulfill({ status: 503, json: { success: false, message: 'No se pudo consultar el parlay.' } }));
  await page.getByRole('button', { name: 'Cargar Banquero', exact: true }).click();
  await expect(page.getByText('No se pudo consultar el parlay.', { exact: true })).toBeVisible();
  await expect(ticket.getByText('Multiplicador Cuota:', { exact: true }).locator('..')).toHaveText(previousTotal);
  await expect(page.getByRole('button', { name: 'Cargar Banquero', exact: true })).toBeEnabled();
});
