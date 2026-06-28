/**
 * workflow.service.test.ts
 *
 * Unit tests for WorkflowService — the rule execution orchestrator.
 * All repository methods are mocked; these tests verify rule logic behaviour.
 *
 * Tests will FAIL until the Coding Agent implements:
 *   src/services/workflow.service.ts — WorkflowService class
 *   src/repositories/workflow.repository.ts — WorkflowRepository class
 *
 * Acceptance Criteria covered:
 *   AC-HAPPY-1  — old card in non-Done column is moved to Stale; tracking rows inserted
 *   AC-HAPPY-2  — card < 2 days old is NOT moved; no tracking rows
 *   AC-HAPPY-3  — card in Done column is NOT moved even if old
 *   AC-STALE-SUPPRESS-1 — card with stale_suppressed=true is NOT moved
 *   AC-ERROR-1  — DB failure on card move returns WorkflowWarning; board load not blocked
 *   graceful degradation — no Stale column in columns[] returns warning, does not throw
 *   Promise.allSettled — one card move failure does not prevent other cards from moving
 *
 * Phase 3 additions (TASK-017):
 *   AC-HAPPY-4   — triggerDoneColorRule calls setCardColor('#d4edda') and inserts tracking rows
 *   AC-HAPPY-4   — retry on failure: second delivery row inserted with attempt=2 on retry success
 *   AC-ERROR-2   — total failure: 3 delivery rows all failed; trigger row trigger_status='failed'
 *   never throws — triggerDoneColorRule always resolves; callers can fire-and-forget safely
 *
 * These Phase 3 tests will FAIL until:
 *   WorkflowService.triggerDoneColorRule(boardId, cardId): Promise<void> is implemented
 *   WorkflowRepository.setCardColor(cardId, color): Promise<void> is added
 */

import type { Column } from '../../repositories/board.repository';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fixColumns: Column[] = [
  { id: 'col-todo',        board_id: 'board-1', name: 'To Do',       position: 1 },
  { id: 'col-inprogress',  board_id: 'board-1', name: 'In Progress', position: 2 },
  { id: 'col-stale',       board_id: 'board-1', name: 'Stale',       position: 3 },
  { id: 'col-done',        board_id: 'board-1', name: 'Done',        position: 4 },
];

/** Stale candidate row shape returned by WorkflowRepository.findStaleCards */
interface StaleCard {
  id: string;
  column_id: string;
}

/** Minimal config subset required by WorkflowService constructor */
const fixConfig = {
  workflowStaleAgeDays:       2,
  workflowRule2BaseDelayMs:   200,
  workflowRule2MaxAttempts:   3,
};

// ---------------------------------------------------------------------------
// Mock WorkflowRepository factory
//
// Returns a plain object matching the WorkflowRepository interface.
// No static import of WorkflowRepository — avoids compile-time resolution
// of the not-yet-existing source file.
// ---------------------------------------------------------------------------

function makeMockRepo() {
  return {
    findStaleCards:       jest.fn(),
    moveCardToStale:      jest.fn(),
    setCardColor:         jest.fn(),
    setSuppressed:        jest.fn(),
    insertTrigger:        jest.fn(),
    insertDelivery:       jest.fn(),
    updateDeliveryStatus: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkflowService', () => {
  async function loadService(repo: ReturnType<typeof makeMockRepo>) {
    const { WorkflowService } = await import('../workflow.service');
    return new WorkflowService(repo as any, fixConfig);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── applyBoardRules ────────────────────────────────────────────────────────

  describe('applyBoardRules(boardId, columns)', () => {
    // ── Happy path ───────────────────────────────────────────────────────────

    it('AC-HAPPY-1: moves an old card to Stale and inserts trigger + delivery tracking rows', async () => {
      // Arrange
      const repo = makeMockRepo();
      const staleCard: StaleCard = { id: 'card-old', column_id: 'col-todo' };
      repo.findStaleCards.mockResolvedValueOnce([staleCard]);
      repo.moveCardToStale.mockResolvedValueOnce(undefined);
      repo.insertTrigger.mockResolvedValueOnce('trigger-uuid-1');
      repo.insertDelivery.mockResolvedValueOnce(undefined);
      const service = await loadService(repo);

      // Act
      const warnings = await service.applyBoardRules('board-1', fixColumns);

      // Assert — no warnings on success
      expect(warnings).toHaveLength(0);

      // Card was moved to Stale column
      expect(repo.moveCardToStale).toHaveBeenCalledWith('card-old', 'col-stale');

      // Trigger row inserted with success status
      expect(repo.insertTrigger).toHaveBeenCalledWith(
        expect.objectContaining({
          rule_id:        'stale-rule',
          board_id:       'board-1',
          card_id:        'card-old',
          trigger_status: 'success',
        }),
      );

      // Delivery row inserted with success status, attempt 1
      expect(repo.insertDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger_id:      'trigger-uuid-1',
          attempt:         1,
          delivery_status: 'success',
        }),
      );
    });

    it('AC-HAPPY-2: does NOT move a card < 2 days old; no tracking rows inserted', async () => {
      // Arrange — findStaleCards returns empty (young card filtered by SQL WHERE clause)
      const repo = makeMockRepo();
      repo.findStaleCards.mockResolvedValueOnce([]);
      const service = await loadService(repo);

      // Act
      const warnings = await service.applyBoardRules('board-1', fixColumns);

      // Assert
      expect(warnings).toHaveLength(0);
      expect(repo.moveCardToStale).not.toHaveBeenCalled();
      expect(repo.insertTrigger).not.toHaveBeenCalled();
      expect(repo.insertDelivery).not.toHaveBeenCalled();
    });

    it('AC-HAPPY-3: cards in Done are excluded — Done column id passed to findStaleCards', async () => {
      // Arrange — findStaleCards called with doneColumnId so Done cards are excluded at SQL level
      const repo = makeMockRepo();
      repo.findStaleCards.mockResolvedValueOnce([]);
      const service = await loadService(repo);

      // Act
      await service.applyBoardRules('board-1', fixColumns);

      // Assert — the Done column ID was passed to exclude Done cards
      expect(repo.findStaleCards).toHaveBeenCalledWith(
        'board-1',
        'col-stale',
        'col-done',
        expect.any(Number),
      );
    });

    it('AC-STALE-SUPPRESS-1: suppressed cards excluded — stale_suppressed=true filtered by SQL', async () => {
      // Arrange — suppressed cards filtered by the SQL WHERE stale_suppressed = false;
      // findStaleCards returns nothing for this board
      const repo = makeMockRepo();
      repo.findStaleCards.mockResolvedValueOnce([]);
      const service = await loadService(repo);

      // Act
      const warnings = await service.applyBoardRules('board-1', fixColumns);

      // Assert — stale query ran but no moves happened
      expect(warnings).toHaveLength(0);
      expect(repo.moveCardToStale).not.toHaveBeenCalled();
    });

    // ── Error boundaries ─────────────────────────────────────────────────────

    it('AC-ERROR-1: DB failure on card move returns WorkflowWarning; does NOT throw', async () => {
      // Arrange — one stale card, move fails with a DB error
      const repo = makeMockRepo();
      const staleCard: StaleCard = { id: 'card-old', column_id: 'col-todo' };
      repo.findStaleCards.mockResolvedValueOnce([staleCard]);
      const dbError = new Error('DB constraint violation');
      repo.moveCardToStale.mockRejectedValueOnce(dbError);
      repo.insertTrigger.mockResolvedValueOnce('trigger-failed-1');
      repo.insertDelivery.mockResolvedValueOnce(undefined);
      const service = await loadService(repo);

      // Act — must not throw; board load continues normally
      const warnings = await service.applyBoardRules('board-1', fixColumns);

      // Assert — failure captured as a warning
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatchObject({
        code:    expect.stringContaining('WORKFLOW'),
        message: expect.stringContaining('card-old'),
      });
    });

    it('graceful degradation: returns a warning when no Stale column in columns[]', async () => {
      // Arrange — columns list without a Stale column (pre-migration board scenario)
      const columnsWithoutStale: Column[] = [
        { id: 'col-todo', board_id: 'board-1', name: 'To Do', position: 1 },
        { id: 'col-done', board_id: 'board-1', name: 'Done',  position: 2 },
      ];
      const repo = makeMockRepo();
      const service = await loadService(repo);

      // Act — must not throw
      const warnings = await service.applyBoardRules('board-1', columnsWithoutStale);

      // Assert — service skipped rule and returned a diagnostic warning
      expect(warnings).toHaveLength(1);
      expect(warnings[0].code).toBeDefined();

      // No DB operations attempted when Stale column is absent
      expect(repo.findStaleCards).not.toHaveBeenCalled();
      expect(repo.moveCardToStale).not.toHaveBeenCalled();
    });

    it('Promise.allSettled: one card move failure does not prevent other cards from moving', async () => {
      // Arrange — two stale cards; first move fails, second succeeds
      const repo = makeMockRepo();
      const card1: StaleCard = { id: 'card-fail', column_id: 'col-todo' };
      const card2: StaleCard = { id: 'card-ok',   column_id: 'col-todo' };
      repo.findStaleCards.mockResolvedValueOnce([card1, card2]);

      const dbError = new Error('move failed for card-fail');
      repo.moveCardToStale
        .mockRejectedValueOnce(dbError)    // card-fail fails
        .mockResolvedValueOnce(undefined); // card-ok succeeds

      repo.insertTrigger.mockResolvedValue('trigger-x');
      repo.insertDelivery.mockResolvedValue(undefined);
      const service = await loadService(repo);

      // Act
      const warnings = await service.applyBoardRules('board-1', fixColumns);

      // Assert — exactly one warning (from card-fail), card-ok moved successfully
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain('card-fail');

      // card-ok was still moved despite card-fail's failure
      expect(repo.moveCardToStale).toHaveBeenCalledWith('card-ok', 'col-stale');
    });
  });

  // ── triggerDoneColorRule ───────────────────────────────────────────────────
  //
  // Phase 3 (TASK-017): Rule #2 — Done-color async retry harness
  //
  // These tests will FAIL until WorkflowService.triggerDoneColorRule is implemented
  // and WorkflowRepository.setCardColor(cardId, color): Promise<void> is added.
  //
  // Design decisions applied:
  //   - retryWithBackoff called with config.workflowRule2MaxAttempts / workflowRule2BaseDelayMs
  //   - On success: insertTrigger (status='success') + insertDelivery (attempt=1, status='success')
  //   - On partial failure: delivery row per attempt; trigger row status matches final outcome
  //   - On total failure: trigger row trigger_status='failed'; 3 delivery rows all 'failed'
  //   - Always resolves — never propagates rejection to callers

  describe('triggerDoneColorRule(boardId, cardId)', () => {
    // Use fake timers so retryWithBackoff delays resolve instantly in tests.
    // This avoids real wall-clock waits (baseDelayMs=200 → would take ~600ms per test).
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('AC-HAPPY-4: sets card color to pale green and inserts trigger + delivery tracking rows on success', async () => {
      // Arrange
      const repo = makeMockRepo();
      repo.setCardColor.mockResolvedValueOnce(undefined);
      repo.insertTrigger.mockResolvedValueOnce('trigger-rule2-1');
      repo.insertDelivery.mockResolvedValueOnce(undefined);
      const service = await loadService(repo);

      // Act — await the promise; it should resolve without throwing
      const promise = service.triggerDoneColorRule('board-1', 'card-done');
      await jest.runAllTimersAsync();
      await promise;

      // Assert — setCardColor called with correct hex
      expect(repo.setCardColor).toHaveBeenCalledTimes(1);
      expect(repo.setCardColor).toHaveBeenCalledWith('card-done', '#d4edda');

      // Trigger row inserted with success status for Rule #2
      expect(repo.insertTrigger).toHaveBeenCalledWith(
        expect.objectContaining({
          rule_id:        'done-color-rule',
          board_id:       'board-1',
          card_id:        'card-done',
          trigger_status: 'success',
        }),
      );

      // Delivery row inserted with attempt=1 and success
      expect(repo.insertDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger_id:      'trigger-rule2-1',
          attempt:         1,
          delivery_status: 'success',
        }),
      );
    });

    it('AC-ERROR-2 partial: retries on failure — second delivery row inserted with attempt=2 on retry success', async () => {
      // Arrange — first setCardColor attempt fails; second succeeds
      const repo = makeMockRepo();
      repo.setCardColor
        .mockRejectedValueOnce(new Error('transient DB error'))
        .mockResolvedValueOnce(undefined);
      repo.insertTrigger.mockResolvedValue('trigger-retry-1');
      repo.insertDelivery.mockResolvedValue(undefined);
      const service = await loadService(repo);

      // Act
      const promise = service.triggerDoneColorRule('board-1', 'card-done');
      await jest.runAllTimersAsync();
      await promise;

      // Assert — setCardColor was attempted twice
      expect(repo.setCardColor).toHaveBeenCalledTimes(2);

      // Two delivery rows: attempt 1 failed, attempt 2 succeeded
      expect(repo.insertDelivery).toHaveBeenCalledTimes(2);
      expect(repo.insertDelivery).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ attempt: 1, delivery_status: 'failed' }),
      );
      expect(repo.insertDelivery).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ attempt: 2, delivery_status: 'success' }),
      );

      // Trigger row reflects final success
      expect(repo.insertTrigger).toHaveBeenCalledWith(
        expect.objectContaining({ trigger_status: 'success' }),
      );
    });

    it('AC-ERROR-2 total failure: 3 delivery rows all failed; trigger row trigger_status=failed after exhausting retries', async () => {
      // Arrange — all 3 attempts fail
      const dbError = new Error('DB down');
      const repo = makeMockRepo();
      repo.setCardColor.mockRejectedValue(dbError);
      repo.insertTrigger.mockResolvedValue('trigger-exhausted-1');
      repo.insertDelivery.mockResolvedValue(undefined);
      const service = await loadService(repo);

      // Act — must resolve (not throw) even on total failure
      const promise = service.triggerDoneColorRule('board-1', 'card-done');
      await jest.runAllTimersAsync();
      await promise;

      // Assert — exactly 3 attempts were made (config: workflowRule2MaxAttempts=3)
      expect(repo.setCardColor).toHaveBeenCalledTimes(3);

      // Three delivery rows, all failed
      expect(repo.insertDelivery).toHaveBeenCalledTimes(3);
      expect(repo.insertDelivery).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ attempt: 1, delivery_status: 'failed' }),
      );
      expect(repo.insertDelivery).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ attempt: 2, delivery_status: 'failed' }),
      );
      expect(repo.insertDelivery).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ attempt: 3, delivery_status: 'failed' }),
      );

      // Trigger row reflects final failure
      expect(repo.insertTrigger).toHaveBeenCalledWith(
        expect.objectContaining({
          rule_id:        'done-color-rule',
          trigger_status: 'failed',
        }),
      );
    });

    it('never throws: triggerDoneColorRule always resolves even on total failure', async () => {
      // Arrange — every attempt throws; the caller must never see a rejection
      const repo = makeMockRepo();
      repo.setCardColor.mockRejectedValue(new Error('persistent failure'));
      repo.insertTrigger.mockResolvedValue('trigger-safe-1');
      repo.insertDelivery.mockResolvedValue(undefined);
      const service = await loadService(repo);

      // Act + Assert — the returned promise must resolve, not reject
      const promise = service.triggerDoneColorRule('board-1', 'card-done');
      await jest.runAllTimersAsync();
      await expect(promise).resolves.toBeUndefined();
    });

    it('no workflowService injection: WorkflowService not constructed without config — confirms config drives behavior', async () => {
      // Arrange — use non-default config to verify config values are actually used
      const repo = makeMockRepo();
      // Build a service with maxAttempts=1 so retryWithBackoff makes exactly 1 attempt
      const singleAttemptConfig = {
        workflowStaleAgeDays:     2,
        workflowRule2BaseDelayMs: 200,
        workflowRule2MaxAttempts: 1,  // only 1 attempt allowed
      };
      const { WorkflowService } = await import('../workflow.service');
      const service = new WorkflowService(repo as any, singleAttemptConfig);

      repo.setCardColor.mockRejectedValue(new Error('fails once'));
      repo.insertTrigger.mockResolvedValue('trigger-cfg-1');
      repo.insertDelivery.mockResolvedValue(undefined);

      // Act
      const promise = service.triggerDoneColorRule('board-1', 'card-done');
      await jest.runAllTimersAsync();
      await promise;

      // Assert — only 1 attempt made (config honored)
      expect(repo.setCardColor).toHaveBeenCalledTimes(1);
      // Only 1 delivery row (maxAttempts=1)
      expect(repo.insertDelivery).toHaveBeenCalledTimes(1);
    });
  });
});
