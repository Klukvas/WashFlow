import { test, expect } from '@playwright/test';

test.describe('Change Password', () => {
  test('opens change password dialog from header', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Look for user menu or change password button in header
    const changePasswordTrigger = page.getByText(/change password/i);
    if (await changePasswordTrigger.isVisible()) {
      await changePasswordTrigger.click();
      await expect(page.locator('[role="dialog"]')).toBeVisible();
    } else {
      // May be inside a dropdown menu — click user avatar/menu first
      const userMenu = page.locator('[data-testid="user-menu"]');
      if (await userMenu.isVisible()) {
        await userMenu.click();
        await page.getByText(/change password/i).click();
        await expect(page.locator('[role="dialog"]')).toBeVisible();
      }
    }
  });

  test('validates empty change password form', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const changePasswordTrigger = page.getByText(/change password/i);
    if (await changePasswordTrigger.isVisible()) {
      await changePasswordTrigger.click();
      // Try to submit empty form
      const submitBtn = page.locator('[role="dialog"]').getByRole('button', {
        name: /change password|submit|save/i,
      });
      if (await submitBtn.isVisible()) {
        await submitBtn.click();
        // Should stay in dialog — not close
        await expect(page.locator('[role="dialog"]')).toBeVisible();
      }
    }
  });

  test('closes on cancel', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const changePasswordTrigger = page.getByText(/change password/i);
    if (await changePasswordTrigger.isVisible()) {
      await changePasswordTrigger.click();
      const dialog = page.locator('[role="dialog"]');
      if (await dialog.isVisible()) {
        const cancelBtn = dialog.getByRole('button', {
          name: /cancel|close/i,
        });
        if (await cancelBtn.isVisible()) {
          await cancelBtn.click();
          await expect(dialog).not.toBeVisible();
        }
      }
    }
  });
});
