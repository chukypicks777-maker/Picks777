import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '5181', '--strictPort'], { stdio: 'pipe' });
let browser;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Preview did not start')), 15000);
    server.stdout.on('data', data => { if (String(data).includes('5181')) { clearTimeout(timer); resolve(); } });
    server.on('error', reject);
    server.on('exit', code => { if (code) { clearTimeout(timer); reject(new Error('Preview exited')); } });
  });
  browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5181/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
  } catch {
    await page.waitForLoadState('domcontentloaded');
  }
  const links = await (await fetch('http://127.0.0.1:5181/.well-known/assetlinks.json')).json();
  assert.equal(links[0].target.package_name, 'app.picks777.mobile');
  await context.setOffline(true);
  await page.goto('http://127.0.0.1:5181/btts', { waitUntil: 'domcontentloaded' });
  assert.equal(await page.locator('h1').textContent(), 'Sin conexión');
  const cached = await page.evaluate(async () => {
    const entries = [];
    for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) entries.push(new URL(request.url).pathname);
    return entries;
  });
  assert.deepEqual(cached, ['/offline.html']);
  console.log('PASS: built app serves Digital Asset Links; offline navigation works; cache contains only offline.html.');
} finally {
  await browser?.close();
  server.kill();
}
