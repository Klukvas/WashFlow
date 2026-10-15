import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'auth-cookie-ordering.spec.ts',
  outputDir: './test-results/auth-cookie-ordering',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5179',
    channel: 'chrome',
    headless: true,
    serviceWorkers: 'block',
  },
});
