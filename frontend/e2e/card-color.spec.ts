import { test, expect } from '@playwright/test';
import { createBoard, deleteBoard, getColumns, createCard } from './helpers/api.js';
import { loginAsTestUser } from './helpers/auth.js';

test.describe('Card Color Picker', () => {
  let boardId: string;
  let todoColumnId: string;

  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page.request);
    boardId = await createBoard(page.request, 'Card Color E2E Board');
    const columns = await getColumns(page.request, boardId);
    const todo = columns.find((c) => c.name === 'To Do');
    if (!todo) throw new Error('To Do column not found');
    todoColumnId = todo.id;
  });

  test.afterEach(async ({ page }) => {
    await deleteBoard(page.request, boardId);
  });

  // ─── AC-HAPPY-1 ────────────────────────────────────────────────────────────

  test('AC-HAPPY-1: set card color persists after page reload', async ({ page }) => {
    await createCard(page.request, todoColumnId, 'Color Me');

    await page.goto(`/boards/${boardId}`);

    const card = page.locator('article').filter({ hasText: 'Color Me' });
    await expect(card).toBeVisible();

    // Palette button is always visible on the card
    const paletteBtn = card.getByRole('button', { name: /set card color/i });
    await expect(paletteBtn).toBeVisible();

    // Intercept PATCH before clicking swatch
    const patchPromise = page.waitForResponse(
      (resp) => resp.url().includes('/cards/') && resp.request().method() === 'PATCH',
    );

    // Open the color picker modal
    await paletteBtn.click();
    const modal = page.getByRole('dialog', { name: 'Choose card color' });
    await expect(modal).toBeVisible();

    // Pick "Pale rose"
    await page.getByRole('button', { name: 'Pale rose' }).click();

    // Modal should close
    await expect(modal).not.toBeVisible();

    // Optimistic update: card background changes to Pale rose (#fce7f3 = rgb(252, 231, 243))
    await expect(card).toHaveCSS('background-color', 'rgb(252, 231, 243)');

    // Wait for PATCH to complete and verify payload
    const patchResp = await patchPromise;
    expect(patchResp.ok()).toBe(true);
    const body = await patchResp.request().postDataJSON() as { color: string };
    expect(body.color).toBe('#fce7f3');

    // Reload and verify persistence
    await page.reload();

    const cardAfter = page.locator('article').filter({ hasText: 'Color Me' });
    await expect(cardAfter).toBeVisible();
    await expect(cardAfter).toHaveCSS('background-color', 'rgb(252, 231, 243)');
  });

  // ─── AC-HAPPY-2 ────────────────────────────────────────────────────────────

  test('AC-HAPPY-2: clear card color resets to default white after reload', async ({ page }) => {
    // Create card and set color via API PATCH
    const card = await createCard(page.request, todoColumnId, 'Clear My Color');
    const patchRes = await page.request.patch(
      `${process.env.API_URL ?? 'http://localhost:3000'}/cards/${card.id}`,
      { data: { color: '#fce7f3' } },
    );
    expect(patchRes.ok()).toBe(true);

    await page.goto(`/boards/${boardId}`);

    const cardEl = page.locator('article').filter({ hasText: 'Clear My Color' });
    await expect(cardEl).toBeVisible();
    // Card should start with Pale rose color
    await expect(cardEl).toHaveCSS('background-color', 'rgb(252, 231, 243)');

    // Intercept PATCH
    const patchPromise = page.waitForResponse(
      (resp) => resp.url().includes('/cards/') && resp.request().method() === 'PATCH',
    );

    // Open picker and select "No color"
    const paletteBtn = cardEl.getByRole('button', { name: /set card color/i });
    await paletteBtn.click();
    const modal = page.getByRole('dialog', { name: 'Choose card color' });
    await expect(modal).toBeVisible();
    await page.getByRole('button', { name: 'No color' }).click();

    // Modal should close
    await expect(modal).not.toBeVisible();

    // Wait for PATCH
    const patchResp = await patchPromise;
    expect(patchResp.ok()).toBe(true);
    const body = await patchResp.request().postDataJSON() as { color: null };
    expect(body.color).toBeNull();

    // Card should revert to default white
    await expect(cardEl).toHaveCSS('background-color', 'rgb(255, 255, 255)');

    // Reload and verify the default white persists
    await page.reload();
    const cardAfter = page.locator('article').filter({ hasText: 'Clear My Color' });
    await expect(cardAfter).toBeVisible();
    await expect(cardAfter).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  });
});
