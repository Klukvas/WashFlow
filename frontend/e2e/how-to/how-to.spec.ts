import { test, expect } from '@playwright/test';
import { HowToPage } from '../pages/HowToPage';

test.describe('How-To pages', () => {
  test('/how-to redirects to /how-to/getting-started', async ({ page }) => {
    await page.goto('/how-to');
    await expect(page).toHaveURL('/how-to/getting-started', { timeout: 5_000 });
  });

  test('shows heading and topic sidebar links', async ({ page }) => {
    const howToPage = new HowToPage(page);
    await howToPage.gotoTopic('getting-started');

    await expect(howToPage.heading).toBeVisible();

    const linkCount = await howToPage.topicLinks.count();
    expect(linkCount).toBeGreaterThan(0);
  });

  test('clicking a different topic changes the URL', async ({ page }) => {
    const howToPage = new HowToPage(page);
    await howToPage.gotoTopic('getting-started');

    // Find a link that is NOT getting-started and click it
    const otherLink = howToPage.topicLinks
      .filter({ hasNot: page.locator('[href="/how-to/getting-started"]') })
      .first();
    const href = await otherLink.getAttribute('href');
    await otherLink.click();
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(href!, { timeout: 5_000 });
  });

  test('content area is visible', async ({ page }) => {
    const howToPage = new HowToPage(page);
    await howToPage.gotoTopic('getting-started');

    // Topic content should render cards/sections
    const cards = page.locator('[class*="rounded"]').filter({ hasText: /.+/ });
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('navigating to a flow topic shows step content', async ({ page }) => {
    const howToPage = new HowToPage(page);
    await howToPage.gotoTopic('flow-client-via-order');

    // Flow topics render numbered steps
    await expect(page.getByText(/step/i).first()).toBeVisible({ timeout: 5_000 });
  });
});
