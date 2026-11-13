import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src/ui/__tests__',
  testMatch: 'calendar-localization.spec.ts',
  outputDir: './test-results/calendar-localization',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    channel: 'chrome',
    headless: true,
    launchOptions: { timeout: 30_000 },
    timezoneId: 'America/Los_Angeles',
  },
});
