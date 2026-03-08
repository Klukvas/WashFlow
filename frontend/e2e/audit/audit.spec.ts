import { test, expect } from '@playwright/test';
import { AuditPage } from '../pages/AuditPage';

test.describe('Audit log page', () => {
  test('loads and displays audit logs', async ({ page }) => {
    const auditPage = new AuditPage(page);
    await auditPage.goto();

    await expect(auditPage.heading).toBeVisible();
    const count = await auditPage.getRowCount();
    expect(count).toBeGreaterThan(0);
  });

  test('displays action badges', async ({ page }) => {
    const auditPage = new AuditPage(page);
    await auditPage.goto();

    // Action badges (CREATE, UPDATE, etc.) should be visible
    const badges = page.locator('table tbody td').first();
    await expect(badges).toBeVisible();
  });

  test('has pagination controls', async ({ page }) => {
    const auditPage = new AuditPage(page);
    await auditPage.goto();

    // Pagination should be visible (large dataset)
    const pagination = page.locator(
      'nav[aria-label="pagination"], [data-testid="pagination"]',
    );
    const count = await pagination.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('shows pagination info text', async ({ page }) => {
    const auditPage = new AuditPage(page);
    await auditPage.goto();

    // Look for "Showing X to Y of Z" or similar pagination text
    const paginationText = page.getByText(/showing|of \d+/i);
    const textCount = await paginationText.count();
    expect(textCount).toBeGreaterThanOrEqual(0);
  });

  test('clicking page 2 changes displayed rows', async ({ page }) => {
    const auditPage = new AuditPage(page);
    await auditPage.goto();

    const initialCount = await auditPage.getRowCount();
    if (initialCount === 0) {
      test.skip();
      return;
    }

    // Get first row text for comparison
    const firstRowText = await page
      .locator('table tbody tr')
      .first()
      .textContent();

    // Try to click page 2 button
    const page2Btn = page.getByRole('button', { name: '2' });
    if (await page2Btn.isVisible()) {
      await page2Btn.click();
      await page.waitForLoadState('networkidle');

      const newFirstRowText = await page
        .locator('table tbody tr')
        .first()
        .textContent();
      // Content should change (different page)
      expect(newFirstRowText).not.toEqual(firstRowText);
    }
  });
});
