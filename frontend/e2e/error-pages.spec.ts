import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth.js';

test.beforeEach(async ({ page }) => {
  await loginAsTestUser(page.request);
});

test.describe('Error Pages', () => {
  test('unknown route renders NotFoundPage with back link', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');
    await expect(page.getByRole('heading', { name: 'Not Found' })).toBeVisible();
    await expect(page.getByText('The page you were looking for does not exist.')).toBeVisible();

    const backLink = page.getByRole('link', { name: 'Back to boards' });
    await expect(backLink).toBeVisible();
    await backLink.click();

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'My Boards' })).toBeVisible();
  });

  test('invalid board UUID renders ErrorBanner without crash', async ({ page }) => {
    await page.goto('/boards/00000000-0000-0000-0000-000000000000');

    // Wait for loading to resolve: status disappears OR alert appears (TanStack Query may retry ~3s)
    await page.waitForSelector('[role="alert"], [role="status"]', { timeout: 8000 });
    // If status is still visible, wait for it to go away
    const status = page.getByRole('status');
    if (await status.isVisible()) {
      await expect(status).toBeHidden({ timeout: 8000 });
    }

    const alert = page.getByRole('alert').first();
    await expect(alert).toBeVisible({ timeout: 5000 });
    await expect(alert).toContainText(/not found|error/i);
    await expect(page.getByRole('heading', { name: 'E2E Board' })).toHaveCount(0);
    await expect(page.locator('section[aria-label^="Column:"]')).toHaveCount(0);
  });
});
