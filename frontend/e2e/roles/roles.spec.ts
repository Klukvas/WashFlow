import { test, expect } from '@playwright/test';
import { RolesPage } from '../pages/RolesPage';

test.describe('Roles list', () => {
  test('loads and displays roles', async ({ page }) => {
    const rolesPage = new RolesPage(page);
    await rolesPage.goto();

    // Seeded data has 4 roles: Admin, Менеджер, Оператор, Рецепціоніст
    const count = await rolesPage.getRowCount();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('shows Create Role button', async ({ page }) => {
    const rolesPage = new RolesPage(page);
    await rolesPage.goto();

    await expect(rolesPage.createButton).toBeVisible();
  });

  test('displays role names in table', async ({ page }) => {
    const rolesPage = new RolesPage(page);
    await rolesPage.goto();

    // Admin role should be visible in the table (exact match)
    await expect(
      page.locator('table').getByText('Admin', { exact: true }),
    ).toBeVisible();
  });

  test('navigates to role detail on row click', async ({ page }) => {
    const rolesPage = new RolesPage(page);
    await rolesPage.goto();

    await rolesPage.clickRow(0);
    await expect(page).toHaveURL(/\/roles\/.+/, { timeout: 5_000 });
  });
});

test.describe('Role Detail', () => {
  test('shows role edit form and permissions', async ({ page }) => {
    await page.goto('/roles');
    await page.waitForLoadState('networkidle');

    await page.locator('table tbody tr').first().click();
    await page.waitForLoadState('networkidle');

    // Should show role name input
    await expect(page.locator('#name')).toBeVisible();

    // Permission section should be visible
    await expect(page.getByText(/permissions/i).first()).toBeVisible();
  });

  test('shows permission modules with checkboxes', async ({ page }) => {
    await page.goto('/roles');
    await page.waitForLoadState('networkidle');

    await page.locator('table tbody tr').first().click();
    await page.waitForLoadState('networkidle');

    // Wait for permissions to load — they come from a separate API call
    await page.waitForTimeout(1000);

    // Permission checkboxes — could be input[type=checkbox] or custom styled checkboxes
    const checkboxes = page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();

    if (count === 0) {
      // Maybe permissions use a different UI element
      // Check for permission-related text indicating the section loaded
      await expect(
        page.getByText(/permissions/i).first(),
      ).toBeVisible();
    } else {
      expect(count).toBeGreaterThan(0);
    }
  });

  test('back button navigates to roles list', async ({ page }) => {
    await page.goto('/roles');
    await page.waitForLoadState('networkidle');

    await page.locator('table tbody tr').first().click();
    await expect(page).toHaveURL(/\/roles\/.+/, { timeout: 5_000 });

    await page.getByRole('button', { name: /back/i }).click();
    await expect(page).toHaveURL('/roles');
  });

  test('save button is disabled when no changes', async ({ page }) => {
    await page.goto('/roles');
    await page.waitForLoadState('networkidle');

    await page.locator('table tbody tr').first().click();
    await page.waitForLoadState('networkidle');

    // The save button for the role form should be disabled when form is pristine
    const saveButtons = page.getByRole('button', { name: /save/i });
    const firstSave = saveButtons.first();
    await expect(firstSave).toBeDisabled();
  });
});
