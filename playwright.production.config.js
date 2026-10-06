import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

// Large calendar checks run against the same compiled bundle that is deployed.
// Development React profiling emits per-card events which distort load timings.
export default defineConfig({
  ...base,
  workers: 1,
  // API fixtures must stay in Playwright's network router on every reload.
  use: { ...base.use, serviceWorkers: 'block' },
  webServer: {
    ...base.webServer,
    command: 'npm run preview -- --host 127.0.0.1 --port 5179 --strictPort'
  }
});
