import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('loads dashboard page', async ({ page }) => {
    // Should not redirect away — stays on /
    await expect(page).toHaveURL('/');
  });

  test('displays KPI cards', async ({ page }) => {
    // KPI row: Revenue Today, Orders Today, Avg Duration, Cancel Rate, Active Clients, Occupancy
    await expect(page.getByText('Revenue Today')).toBeVisible();
    await expect(page.getByText('Orders Today')).toBeVisible();
    await expect(page.getByText('Avg Duration')).toBeVisible();
    await expect(page.getByText('Cancel Rate').first()).toBeVisible();
    await expect(page.getByText('Active Clients').first()).toBeVisible();
    await expect(page.getByText('Occupancy')).toBeVisible();
  });

  test('displays stats cards', async ({ page }) => {
    await expect(page.getByText('Total Orders', { exact: true })).toBeVisible();
    await expect(page.getByText('Revenue').first()).toBeVisible();
    await expect(page.getByText('Completion Rate')).toBeVisible();
  });

  test('displays Live Operations panel', async ({ page }) => {
    await expect(page.getByText('Live Operations')).toBeVisible();
    await expect(page.getByText('In Progress')).toBeVisible();
    await expect(page.getByText('Waiting')).toBeVisible();
    await expect(page.getByText('Free Posts')).toBeVisible();
    await expect(page.getByText('Overdue')).toBeVisible();
  });

  test('displays Branch Performance table', async ({ page }) => {
    await expect(page.getByText('Branch Performance')).toBeVisible();
  });

  test('displays Employee Performance table', async ({ page }) => {
    await expect(page.getByText('Employee Performance')).toBeVisible();
  });

  test('displays Alerts panel', async ({ page }) => {
    await expect(page.getByText('Alerts').first()).toBeVisible();
  });

  test('KPI cards show numeric values', async ({ page }) => {
    // Wait for KPI data to load — look for at least one numeric value
    // The "Orders Today" card should have a number
    const ordersCard = page.getByText('Orders Today').locator('..');
    await expect(ordersCard.locator('.font-bold')).not.toHaveText('');
  });
});
