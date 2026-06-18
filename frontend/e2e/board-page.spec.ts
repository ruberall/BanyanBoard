import { test, expect } from '@playwright/test';
import { createBoard, deleteBoard } from './helpers/api.js';
import { loginAsTestUser } from './helpers/auth.js';

test.describe('Board Page', () => {
  let boardId: string;

  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page.request);
    boardId = await createBoard(page.request, 'E2E Board');
  });

  test.afterEach(async ({ page }) => {
    await deleteBoard(page.request, boardId);
  });

  test('renders board heading and three default columns', async ({ page }) => {
    await page.goto(`/boards/${boardId}`);
    await expect(page.getByRole('heading', { name: 'E2E Board' })).toBeVisible();
    await expect(page.locator('section[aria-label="Column: To Do"]')).toBeVisible();
    await expect(page.locator('section[aria-label="Column: In Progress"]')).toBeVisible();
    await expect(page.locator('section[aria-label="Column: Done"]')).toBeVisible();
  });

  test('adds a card to a column', async ({ page }) => {
    await page.goto(`/boards/${boardId}`);
    const todoColumn = page.locator('section[aria-label="Column: To Do"]');

    await todoColumn.getByPlaceholder('Card title...').fill('My test card');
    await todoColumn.getByRole('button', { name: 'Add card' }).click();

    await expect(todoColumn.getByRole('heading', { name: 'My test card' })).toBeVisible();
    await expect(todoColumn.getByPlaceholder('Card title...')).toHaveValue('');
  });

  test('blank card title shows validation error — no card created', async ({ page }) => {
    await page.goto(`/boards/${boardId}`);
    const todoColumn = page.locator('section[aria-label="Column: To Do"]');

    await todoColumn.getByRole('button', { name: 'Add card' }).click();

    await expect(todoColumn.getByRole('alert')).toContainText('Title is required');
    await expect(todoColumn.locator('article')).toHaveCount(0);
  });

  test('moves a card between columns via keyboard DnD and persists', async ({ page }) => {
    await page.goto(`/boards/${boardId}`);
    const todoColumn = page.locator('section[aria-label="Column: To Do"]');
    const inProgressColumn = page.locator('section[aria-label="Column: In Progress"]');

    // Create a card
    await todoColumn.getByPlaceholder('Card title...').fill('Keyboard move card');
    await todoColumn.getByRole('button', { name: 'Add card' }).click();
    await expect(todoColumn.getByRole('heading', { name: 'Keyboard move card' })).toBeVisible();

    // Keyboard drag: focus handle → Space (lift) → ArrowRight (move) → Space (drop)
    const handle = page.getByRole('button', { name: 'Reorder card: Keyboard move card' });
    await handle.focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');

    // Card should now be in In Progress
    await expect(inProgressColumn.getByRole('heading', { name: 'Keyboard move card' })).toBeVisible();
    await expect(todoColumn.getByText('No cards yet')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);

    // Persist: reload and verify
    await page.reload();
    await expect(inProgressColumn.getByRole('heading', { name: 'Keyboard move card' })).toBeVisible();
  });
});
