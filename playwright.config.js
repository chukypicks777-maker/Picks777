import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  timeout: 60000,
  workers: 2,
  use: { baseURL: 'http://127.0.0.1:5179', headless: true, hasTouch: true, isMobile: true, trace: 'retain-on-failure' },
  projects: [
    { name: 'android-chromium', use: { browserName: 'chromium' } },
    { name: 'iphone-webkit', use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 } },
    { name: 'firefox', use: { browserName: 'firefox', isMobile: false, viewport: { width: 390, height: 844 } } }
  ],
  webServer: { command: 'npm run client -- --host 127.0.0.1 --port 5179 --strictPort', url: 'http://127.0.0.1:5179', reuseExistingServer: false }
});
