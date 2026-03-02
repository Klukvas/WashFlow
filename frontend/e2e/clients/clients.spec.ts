import { test, expect } from '@playwright/test';
import { ClientsPage } from '../pages/ClientsPage';

test.describe('Clients list', () => {
  test('loads and displays clients', async ({ page }) => {
    const clientsPage = new ClientsPage(page);
    await clientsPage.goto();

    await expect(clientsPage.heading).toBeVisible();
    const count = await clientsPage.getRowCount();
    expect(count).toBeGreaterThan(0);
  });

  test('shows Add Client button', async ({ page }) => {
    const clientsPage = new ClientsPage(page);
    await clientsPage.goto();

    await expect(clientsPage.addClientButton).toBeVisible();
  });

  test('opens create form on Create click', async ({ page }) => {
    const clientsPage = new ClientsPage(page);
    await clientsPage.goto();

    await clientsPage.addClientButton.click();
    // Create form (slide-in panel) with name inputs should appear
    await expect(
      page.getByRole('textbox', { name: 'First Name' }),
    ).toBeVisible();
  });

  test('navigates to client detail on row click', async ({ page }) => {
    const clientsPage = new ClientsPage(page);
    await clientsPage.goto();

    await page.locator('table tbody tr').first().click();
    await expect(page).toHaveURL(/\/clients\/.+/, { timeout: 5_000 });
  });
});
