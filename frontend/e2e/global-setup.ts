import { test as setup } from '@playwright/test';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { STORAGE_STATE } from './constants';

// Explicitly load .env.test — dotenv auto-inject doesn't reach Playwright workers
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.test') });

const TENANT_ID = process.env.PLAYWRIGHT_TENANT_ID ?? '00000000-0000-4000-8000-000000000001';
const EMAIL = process.env.PLAYWRIGHT_EMAIL ?? 'admin@washflow.com';
const PASSWORD = process.env.PLAYWRIGHT_PASSWORD ?? 'admin123';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');

  await page.locator('#tenantId').fill(TENANT_ID);
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('[data-testid="login-submit"]').click();

  // Wait for redirect to dashboard after successful login
  await page.waitForURL('/', { timeout: 10_000 });

  await page.context().storageState({ path: STORAGE_STATE });
});
