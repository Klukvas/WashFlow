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

    await expect(
      page.getByRole('button', { name: /create/i }),
    ).toBeVisible();
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
    const dialogCreateBtn = page.getByRole('button', { name: /create/i }).last();
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
    await expect(page.locator('#firstName')).not.toBeVisible({ timeout: 3_000 });
  });
});
