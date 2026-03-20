import { test as setup } from '@playwright/test';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import {
  OPERATOR_STORAGE_STATE,
  RECEPTIONIST_STORAGE_STATE,
  MANAGER_STORAGE_STATE,
} from './constants';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.test') });

const BASE_URL = 'http://localhost:5173';
const API_BASE = 'http://localhost:3003/api/v1';

/**
 * Reads the admin auth state to get the access token,
 * then queries the users API to find one user per role.
 * Finally, logs in as each role user and saves storage state.
 */
setup('authenticate role users', async ({ browser }) => {
  // 1. Login as admin to get access token
  const EMAIL = process.env.PLAYWRIGHT_EMAIL ?? 'admin@washflow.com';
  const PASSWORD = process.env.PLAYWRIGHT_PASSWORD ?? 'admin123';
  const loginResponse = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!loginResponse.ok) {
    throw new Error(`Admin login failed: ${loginResponse.status}`);
  }
  const loginBody = await loginResponse.json();
  const accessToken = loginBody.data?.accessToken ?? loginBody.accessToken;
  if (!accessToken) {
    throw new Error('No access token in login response');
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

    if (roleMap['operator'] && roleMap['receptionist'] && roleMap['manager']) {
      break;
    }
  }

  // 3. Log in as each role user via API and save auth state
  for (const [role, { email, storagePath }] of Object.entries(roleMap)) {
    console.log(`Logging in as ${role}: ${email}`);
    const context = await browser.newContext();
    const page = await context.newPage();

    // Navigate to the app so cookies/localStorage belong to the correct origin
    await page.goto(BASE_URL);

    // Login via Vite proxy (relative URL) so cookies are set for the page origin.
    // Uses API instead of UI form to avoid HTML5 email validation issues with transliterated emails.
    const roleLoginRes = await page.request.post('/api/v1/auth/login', {
      data: { email, password: 'password123' },
    });

    if (!roleLoginRes.ok()) {
      console.warn(
        `WARNING: Login as ${role} (${email}) failed: ${roleLoginRes.status()}`,
      );
      await context.close();
      continue;
    }

    const roleLoginBody = await roleLoginRes.json();
    const roleUser = roleLoginBody.data?.user ?? roleLoginBody.user;

    // Store user profile in localStorage so the auth store hydrates on page load
    await page.evaluate((user) => {
      localStorage.setItem('user', JSON.stringify(user));
    }, roleUser);

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
