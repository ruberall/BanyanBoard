import { test, expect } from '@playwright/test';
import { createBoard, deleteBoard, getColumns, createCard, moveCard } from './helpers/api.js';
import { loginAsAttributionUser, ATTRIBUTION_DISPLAY_NAME } from './helpers/auth.js';

test.describe('Activity Feed Attribution', () => {
  let boardId: string;

  test.beforeEach(async ({ page }) => {
    await loginAsAttributionUser(page.request);
    boardId = await createBoard(page.request, 'Attribution Board');
  });

  test.afterEach(async ({ page }) => {
    await deleteBoard(page.request, boardId);
  });

  // -------------------------------------------------------------------------
  // AC-HAPPY-2: Creating a card shows attributed message with full name
  // -------------------------------------------------------------------------

  test('AC-HAPPY-2: card.created event shows full display name in activity feed', async ({ page }) => {
    await page.goto(`/boards/${boardId}`);

    // Wait for the board to be ready and the SSE connection to open before
    // creating the card so the live push is received (not history replay).
    await expect(page.getByRole('heading', { name: 'Attribution Board' })).toBeVisible();
    await page.waitForRequest((req) => req.url().includes('/events'));

    const columns = await getColumns(page.request, boardId);
    const todoCol = columns.find((c) => c.name === 'To Do');
    if (!todoCol) throw new Error('To Do column not found');

    await createCard(page.request, todoCol.id, 'Attribution card');

    await expect(page.getByRole('complementary', { name: 'Activity feed' })).toBeVisible();
    const feedLog = page.getByRole('log', { name: 'Activity events' });
    await expect(feedLog.getByText(/E2E Attribution created card/)).toBeVisible({ timeout: 5000 });
  });

  // -------------------------------------------------------------------------
  // AC-HAPPY-1: Moving a card shows attributed message with full name
  // -------------------------------------------------------------------------

  test('AC-HAPPY-1: card.moved event shows full display name in activity feed', async ({ page }) => {
    // Create the card before navigating so it exists on the board when SSE opens.
    const columns = await getColumns(page.request, boardId);
    const todoCol = columns.find((c) => c.name === 'To Do');
    const inProgressCol = columns.find((c) => c.name === 'In Progress');
    if (!todoCol || !inProgressCol) throw new Error('Expected columns not found');

    const card = await createCard(page.request, todoCol.id, 'Move card');

    await page.goto(`/boards/${boardId}`);
    await expect(page.getByRole('heading', { name: 'Attribution Board' })).toBeVisible();
    await page.waitForRequest((req) => req.url().includes('/events'));

    // Move the card while the SSE connection is live.
    await moveCard(page.request, card.id, inProgressCol.id);

    await expect(page.getByRole('complementary', { name: 'Activity feed' })).toBeVisible();
    const feedLog = page.getByRole('log', { name: 'Activity events' });
    await expect(feedLog.getByText(/E2E Attribution moved/)).toBeVisible({ timeout: 5000 });
  });

  // -------------------------------------------------------------------------
  // AC-HAPPY-3: History replay on initial load includes attributed messages
  // -------------------------------------------------------------------------

  test('AC-HAPPY-3: history replay on page load shows attributed card.created event', async ({ page }) => {
    // Create the card BEFORE opening the board so it lands in SSE history.
    const columns = await getColumns(page.request, boardId);
    const todoCol = columns.find((c) => c.name === 'To Do');
    if (!todoCol) throw new Error('To Do column not found');

    await createCard(page.request, todoCol.id, 'History card');

    // Navigate to the board — SSE connects and flushes history immediately.
    await page.goto(`/boards/${boardId}`);

    await expect(page.getByRole('complementary', { name: 'Activity feed' })).toBeVisible();
    const feedLog = page.getByRole('log', { name: 'Activity events' });
    // The attributed event should arrive from the history replay, not a live push.
    await expect(feedLog.getByText(/E2E Attribution created card/)).toBeVisible({ timeout: 5000 });
  });

  // -------------------------------------------------------------------------
  // AC-HAPPY-4: Attribution persists across page reload (replay after reconnect)
  // -------------------------------------------------------------------------

  test('AC-HAPPY-4: attributed message survives page reload and SSE reconnect', async ({ page }) => {
    // Create the card before the first load so it is in history from the start.
    const columns = await getColumns(page.request, boardId);
    const todoCol = columns.find((c) => c.name === 'To Do');
    if (!todoCol) throw new Error('To Do column not found');

    await createCard(page.request, todoCol.id, 'Reload card');

    await page.goto(`/boards/${boardId}`);
    await expect(page.getByRole('complementary', { name: 'Activity feed' })).toBeVisible();
    const feedLog = page.getByRole('log', { name: 'Activity events' });
    // Confirm attribution appears on the first load.
    await expect(feedLog.getByText(/E2E Attribution created card/)).toBeVisible({ timeout: 5000 });

    // Reload — this opens a new SSE connection and triggers another history replay.
    await page.reload();

    await expect(page.getByRole('complementary', { name: 'Activity feed' })).toBeVisible();
    const feedLogAfterReload = page.getByRole('log', { name: 'Activity events' });
    await expect(feedLogAfterReload.getByText(/E2E Attribution created card/)).toBeVisible({ timeout: 5000 });
  });
});
