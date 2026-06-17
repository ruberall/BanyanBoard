import { test, expect } from '@playwright/test';
import { createBoard, deleteBoard } from './helpers/api.js';

test.describe('Board List Page', () => {
  test('renders heading and create board form', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'My Boards' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Board name' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Board' })).toBeVisible();
  });

  test('creates a board and shows it in the list', async ({ page }) => {
    let boardId: string | undefined;

    await page.goto('/');
    await page.getByRole('textbox', { name: 'Board name' }).fill('E2E Test Board');
    await page.getByRole('button', { name: 'Create Board' }).click();

    const boardLink = page.getByRole('link', { name: 'E2E Test Board' });
    await expect(boardLink).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Board name' })).toHaveValue('');

    // Capture board ID from the href for cleanup
    const href = await boardLink.getAttribute('href');
    boardId = href?.split('/boards/')[1];

    if (boardId) await deleteBoard(boardId);
  });

  test('blank board name is a no-op — no request fires, list unchanged', async ({ page }) => {
    await page.goto('/');

    // Wait for initial list to settle
    await page.waitForLoadState('networkidle');
    const initialCount = await page.locator('ul li').count();

    const requests: string[] = [];
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/boards')) {
        requests.push(req.url());
      }
    });

    await page.getByRole('button', { name: 'Create Board' }).click();

    // Small wait to ensure no request fired
    await page.waitForTimeout(300);

    expect(requests).toHaveLength(0);
    await expect(page.locator('ul li')).toHaveCount(initialCount);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
