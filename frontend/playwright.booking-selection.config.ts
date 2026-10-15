import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'booking-selection.spec.ts',
  outputDir: './test-results/booking-selection',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5179',
    timezoneId: 'UTC',
    channel: 'chrome',
    headless: true,
    launchOptions: { timeout: 30_000 },
  },
});
