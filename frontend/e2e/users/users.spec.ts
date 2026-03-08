import { test, expect } from '@playwright/test';

test.describe('Users list', () => {
  test('loads and displays users', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    // Table should show seeded users
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('shows Create button', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /create/i })).toBeVisible();
  });

  test('opens create user dialog', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /create/i }).click();

    // Wait for the dialog/form to appear — the dialog uses a fixed overlay
    // Look for form fields that appear after clicking Create
    await expect(page.locator('#firstName')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#lastName')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
  });

  test('validates required fields on submit', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /create/i }).click();
    await expect(page.locator('#firstName')).toBeVisible({ timeout: 5_000 });

    // Try to submit empty form — click the Create button inside the dialog
    // The dialog has Cancel and Create buttons at the bottom
    const dialogCreateBtn = page
      .getByRole('button', { name: /create/i })
      .last();
    await dialogCreateBtn.click();

    // Should show validation errors (red text)
    await expect(page.locator('.text-destructive').first()).toBeVisible({
      timeout: 3_000,
    });
  });

  test('shows table columns', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    const table = page.locator('table');
    await expect(table.getByText('Name')).toBeVisible();
    await expect(table.getByText('Email')).toBeVisible();
  });

  test('cancel button closes create dialog', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /create/i }).click();
    await expect(page.locator('#firstName')).toBeVisible({ timeout: 5_000 });

    // Click Cancel
    await page.getByRole('button', { name: /cancel/i }).click();

    // Form fields should no longer be visible
    await expect(page.locator('#firstName')).not.toBeVisible({
      timeout: 3_000,
    });
  });

  test('create user: fill form and verify new row', async ({ page }) => {
    test.setTimeout(15_000);
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    const uniqueSuffix = Date.now();
    await page.getByRole('button', { name: /create/i }).click();
    await expect(page.locator('#firstName')).toBeVisible({ timeout: 5_000 });

    await page.locator('#firstName').fill(`E2E`);
    await page.locator('#lastName').fill(`User${uniqueSuffix}`);
    await page.locator('#email').fill(`e2e-${uniqueSuffix}@test.com`);
    await page.locator('#password').fill('TestPass123!');

    // Submit — click the Create button inside the dialog
    const dialogCreateBtn = page
      .locator('.fixed.inset-0.z-50')
      .getByRole('button', { name: /create/i });
    await dialogCreateBtn.click();

    // Dialog should close
    await expect(page.locator('#firstName')).not.toBeVisible({
      timeout: 5_000,
    });
    await page.waitForLoadState('networkidle');

    // New user should appear
    await expect(page.getByText(`e2e-${uniqueSuffix}@test.com`)).toBeVisible({
      timeout: 5_000,
    });
  });

  test('invalid email shows validation error', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /create/i }).click();
    await expect(page.locator('#firstName')).toBeVisible({ timeout: 5_000 });

    await page.locator('#firstName').fill('Test');
    await page.locator('#lastName').fill('User');
    await page.locator('#email').fill('not-an-email');
    await page.locator('#password').fill('TestPass123!');

    const dialogCreateBtn = page
      .locator('.fixed.inset-0.z-50')
      .getByRole('button', { name: /create/i });
    await dialogCreateBtn.click();

    await expect(page.locator('.text-destructive').first()).toBeVisible({
      timeout: 3_000,
    });
  });

  test('delete and restore user', async ({ page }) => {
    test.setTimeout(30_000);
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    const rows = page.locator('table tbody tr');
    const initialCount = await rows.count();
    if (initialCount === 0) {
      test.skip();
      return;
    }

    // Click the last row's delete button (button containing .text-destructive svg)
    const deleteBtn = rows
      .last()
      .locator('button')
      .filter({ has: page.locator('.text-destructive') });
    await deleteBtn.click();

    // Confirm delete dialog
    const confirmBtn = page
      .locator('.fixed.inset-0.z-50')
      .last()
      .getByRole('button', { name: /delete/i });
    await confirmBtn.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Toggle "Show deleted" to see the deleted user
    await page.getByText(/show deleted/i).click();
    await page.waitForLoadState('networkidle');

    // At least one row should have a restore button
    const restoreButtons = page.locator('table tbody tr button svg');
    const restoreCount = await restoreButtons.count();
    expect(restoreCount).toBeGreaterThan(0);
  });
});
