import { defineConfig } from '@playwright/test';

// Used by stepdefs/world.js when launching Chromium for the XSS suite
// (VULN-007). The test runner here is cucumber-js, not @playwright/test,
// so this file is read by our own code rather than driving a Playwright
// `npx playwright test` run.
export default defineConfig({
  use: {
    baseURL: 'http://localhost:8080',
    headless: true,
    trace: 'retain-on-failure',
  },
});
