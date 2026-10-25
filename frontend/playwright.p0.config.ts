import { defineConfig } from '@playwright/test';

// Dedicated fixture-only browser suite; no dotenv/default config/backend startup.
export default defineConfig({
  testDir: './p0-e2e',
  timeout: 30_000,
  workers: 1,
  reporter: 'list',
  outputDir: './node_modules/p0-playwright-results',
  use: {
    baseURL: 'http://127.0.0.1:5187',
    viewport: { width: 1440, height: 1100 },
    launchOptions: {
      executablePath:
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    },
  },
});
