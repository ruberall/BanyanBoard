import { test, expect } from '@playwright/test';
import { createBoard, deleteBoard, getColumns, createCard } from './helpers/api.js';
import { loginAsTestUser } from './helpers/auth.js';

test.describe('Card Labels', () => {
  let boardId: string;
  let todoColumnId: string;

  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page.request);
    boardId = await createBoard(page.request, 'Labels E2E Board');
    const columns = await getColumns(page.request, boardId);
    const todo = columns.find((c) => c.name === 'To Do');
    if (!todo) throw new Error('To Do column not found');
    todoColumnId = todo.id;
  });

  test.afterEach(async ({ page }) => {
    await deleteBoard(page.request, boardId);
  });

  // ─── AC-FILTER-HAPPY-1 ───────────────────────────────────────────────────

  test('AC-FILTER-HAPPY-1: filter bar shows only cards matching the typed substring', async ({ page }) => {
    // Seed three cards with distinct titles via API
    await createCard(page.request, todoColumnId, 'Banana split');
    await createCard(page.request, todoColumnId, 'Apple pie');
    await createCard(page.request, todoColumnId, 'Banana bread');

    await page.goto(`/boards/${boardId}`);

    const todoColumn = page.locator('section[aria-label="Column: To Do"]');
    // All three cards visible initially
    await expect(todoColumn.locator('article')).toHaveCount(3);

    // Type a filter substring
    await page.getByRole('textbox', { name: 'Filter cards' }).fill('Banana');

    // Only "Banana split" and "Banana bread" should be visible
    await expect(todoColumn.getByRole('heading', { name: 'Banana split' })).toBeVisible();
    await expect(todoColumn.getByRole('heading', { name: 'Banana bread' })).toBeVisible();
    await expect(todoColumn.getByRole('heading', { name: 'Apple pie' })).toBeHidden();

    // Clear filter — all cards return
    await page.getByRole('button', { name: 'Clear filter' }).click();
    await expect(todoColumn.locator('article')).toHaveCount(3);
  });

  // ─── AC-COLOR-HAPPY-1 ────────────────────────────────────────────────────

  test('AC-COLOR-HAPPY-1: clicking a swatch updates the badge color and sends PATCH', async ({ page }) => {
    // Create a card with a label (default color #95B9C7)
    await createCard(page.request, todoColumnId, 'Color Test Card', [
      { name: 'urgent', color: '#95B9C7' },
    ]);

    await page.goto(`/boards/${boardId}`);

    const badge = page.getByRole('button', { name: /urgent — click to change color/i });
    await expect(badge).toBeVisible();

    // Verify initial default color (browser normalizes hex → rgb)
    await expect(badge).toHaveCSS('background-color', 'rgb(149, 185, 199)');

    // Start intercepting PATCH /cards/:id
    const patchPromise = page.waitForResponse(
      (resp) => resp.url().includes('/cards/') && resp.request().method() === 'PATCH',
    );

    // Open color picker and choose Pale rose
    await badge.click();
    const picker = page.getByRole('dialog', { name: 'Choose label color' });
    await expect(picker).toBeVisible();

    await page.getByRole('button', { name: 'Pale rose' }).click();

    // Picker should dismiss
    await expect(picker).not.toBeVisible();

    // Badge background-color should update to Pale rose (#fce7f3 = rgb(252, 231, 243))
    await expect(badge).toHaveCSS('background-color', 'rgb(252, 231, 243)');

    // PATCH request should have been sent
    const patchResp = await patchPromise;
    expect(patchResp.ok()).toBe(true);
    const body = await patchResp.request().postDataJSON() as { labels: { name: string; color: string }[] };
    expect(body.labels).toEqual([{ name: 'urgent', color: '#fce7f3' }]);
  });

  // ─── AC-COLOR-HAPPY-2 ────────────────────────────────────────────────────

  test('AC-COLOR-HAPPY-2: chosen label color persists after page reload', async ({ page }) => {
    await createCard(page.request, todoColumnId, 'Persist Color Card', [
      { name: 'feature', color: '#95B9C7' },
    ]);

    await page.goto(`/boards/${boardId}`);

    const badge = page.getByRole('button', { name: /feature — click to change color/i });
    await expect(badge).toBeVisible();

    // Pick Pale teal
    const patchDone = page.waitForResponse(
      (resp) => resp.url().includes('/cards/') && resp.request().method() === 'PATCH',
    );
    await badge.click();
    await page.getByRole('button', { name: 'Pale teal' }).click();
    await patchDone;

    // Reload the page
    await page.reload();

    // Badge should retain the Pale teal color (#ccfbf1 = rgb(204, 251, 241))
    const badgeAfter = page.getByRole('button', { name: /feature — click to change color/i });
    await expect(badgeAfter).toBeVisible();
    await expect(badgeAfter).toHaveCSS('background-color', 'rgb(204, 251, 241)');
  });
});
