import { test as setup } from '@playwright/test';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import {
  STORAGE_STATE,
  OPERATOR_STORAGE_STATE,
  RECEPTIONIST_STORAGE_STATE,
  MANAGER_STORAGE_STATE,
} from './constants';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.test') });

const BASE_URL = 'http://localhost:5173';
const API_BASE = 'http://localhost:3000/api/v1';

/**
 * Reads the admin auth state to get the access token,
 * then queries the users API to find one user per role.
 * Finally, logs in as each role user and saves storage state.
 */
setup('authenticate role users', async ({ browser }) => {
  // 1. Read admin token from saved storage state
  const fs = await import('fs');
  const adminState = JSON.parse(fs.readFileSync(STORAGE_STATE, 'utf-8'));
  const adminOrigin = adminState.origins?.find(
    (o: any) => o.origin === BASE_URL,
  );
  const accessToken = adminOrigin?.localStorage?.find(
    (item: any) => item.name === 'accessToken',
  )?.value;

  if (!accessToken) {
    throw new Error('Admin access token not found in storage state');
  }

  // 2. Fetch users list via API to discover role users
  const response = await fetch(`${API_BASE}/users?limit=100`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch users: ${response.status}`);
  }

  const body = await response.json();
  const users = body.data ?? body.items ?? [];

  // Find users by role name (Ukrainian role names from seed)
  const roleMap: Record<string, { email: string; storagePath: string }> = {};

  for (const user of users) {
    const roleName = user.role?.name;
    if (!roleName || user.isSuperAdmin) continue;

    if (roleName === 'Оператор' && !roleMap['operator']) {
      roleMap['operator'] = {
        email: user.email,
        storagePath: OPERATOR_STORAGE_STATE,
      };
    } else if (roleName === 'Рецепціоніст' && !roleMap['receptionist']) {
      roleMap['receptionist'] = {
        email: user.email,
        storagePath: RECEPTIONIST_STORAGE_STATE,
      };
    } else if (roleName === 'Менеджер' && !roleMap['manager']) {
      roleMap['manager'] = {
        email: user.email,
        storagePath: MANAGER_STORAGE_STATE,
      };
    }

    if (
      roleMap['operator'] &&
      roleMap['receptionist'] &&
      roleMap['manager']
    ) {
      break;
    }
  }

  // 3. Log in as each role user and save auth state
  for (const [role, { email, storagePath }] of Object.entries(roleMap)) {
    console.log(`Logging in as ${role}: ${email}`);
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/login`);
    await page.locator('#email').fill(email);
    await page.locator('#password').fill('password123');
    await page.locator('[data-testid="login-submit"]').click();

    await page.waitForURL(/\/(dashboard)?$/, { timeout: 10_000 });
    await context.storageState({ path: storagePath });
    await context.close();
  }

  // Warn about any missing roles
  for (const role of ['operator', 'receptionist', 'manager']) {
    if (!roleMap[role]) {
      console.warn(`WARNING: No seeded user found for role "${role}"`);
    }
  }
});
