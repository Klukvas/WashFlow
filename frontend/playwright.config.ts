import { defineConfig, devices } from '@playwright/test';
import {
  STORAGE_STATE,
  REGISTRATION_STORAGE_STATE,
  OPERATOR_STORAGE_STATE,
  RECEPTIONIST_STORAGE_STATE,
  MANAGER_STORAGE_STATE,
} from './e2e/constants';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    // ── Setup projects ──────────────────────────────────────────────
    {
      name: 'setup',
      testMatch: /e2e\/global-setup\.ts/,
    },
    {
      name: 'setup-registration',
      testMatch: /e2e\/setup-registration\.ts/,
    },
    {
      name: 'setup-roles',
      testMatch: /e2e\/setup-roles\.ts/,
      dependencies: ['setup'],
    },

    // ── Main authenticated tests (admin) ────────────────────────────
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: STORAGE_STATE,
      },
      dependencies: ['setup'],
      testIgnore: [
        /global-setup\.ts/,
        /setup-registration\.ts/,
        /setup-roles\.ts/,
        /\.fresh-tenant\.spec\.ts/,
        /permissions\//,
      ],
    },

    // ── Fresh tenant tests (newly registered user) ──────────────────
    {
      name: 'fresh-tenant',
      use: {
        ...devices['Desktop Chrome'],
        storageState: REGISTRATION_STORAGE_STATE,
      },
      dependencies: ['setup-registration'],
      testMatch: /\.fresh-tenant\.spec\.ts/,
    },

    // ── Role-based permission tests ─────────────────────────────────
    {
      name: 'role-operator',
      use: {
        ...devices['Desktop Chrome'],
        storageState: OPERATOR_STORAGE_STATE,
      },
      dependencies: ['setup-roles'],
      testMatch: /permissions\/role-operator\.spec\.ts/,
    },
    {
      name: 'role-receptionist',
      use: {
        ...devices['Desktop Chrome'],
        storageState: RECEPTIONIST_STORAGE_STATE,
      },
      dependencies: ['setup-roles'],
      testMatch: /permissions\/role-receptionist\.spec\.ts/,
    },
    {
      name: 'role-manager',
      use: {
        ...devices['Desktop Chrome'],
        storageState: MANAGER_STORAGE_STATE,
      },
      dependencies: ['setup-roles'],
      testMatch: /permissions\/role-manager\.spec\.ts/,
    },
  ],
  // Expects dev server to already be running (pnpm dev)
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
