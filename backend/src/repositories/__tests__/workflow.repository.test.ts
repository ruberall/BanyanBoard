/**
 * workflow.repository.test.ts
 *
 * Unit tests for WorkflowRepository — the SQL persistence layer for workflow
 * tracking tables (workflow_rule_triggers, workflow_action_deliveries) and
 * card-state mutations (moveCardToStale, setCardColor, setSuppressed).
 *
 * All DB calls are mocked via a mock Queryable. No real Postgres required.
 *
 * Tests will FAIL until the Coding Agent implements:
 *   src/repositories/workflow.repository.ts — WorkflowRepository class
 */

import type { Queryable } from '../../db/queryable';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock Queryable that returns responses in call order.
 * Call index wraps around if more calls arrive than responses provided.
 */
function makeMockDb(responses: Array<{ rows: unknown[]; rowCount?: number }> = []) {
  let callIndex = 0;
  return {
    query: jest.fn().mockImplementation(() => {
      const response = responses[callIndex] ?? { rows: [], rowCount: 0 };
      callIndex++;
      return Promise.resolve(response);
    }),
  } as unknown as jest.Mocked<Queryable> & { query: jest.Mock };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkflowRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── insertTrigger ──────────────────────────────────────────────────────────

  describe('insertTrigger(input)', () => {
    it('inserts a trigger row and returns the generated trigger id', async () => {
      // Arrange
      const mockDb = makeMockDb([
        { rows: [{ id: 'trigger-uuid-1' }], rowCount: 1 },
      ]);
      const { WorkflowRepository } = await import('../workflow.repository');
      const repo = new WorkflowRepository(mockDb);

      // Act
      const triggerId = await repo.insertTrigger({
        rule_id:        'stale-rule',
        board_id:       'board-uuid-1',
        card_id:        'card-uuid-1',
        trigger_status: 'success',
        trigger_error:  null,
      });

      // Assert — correct INSERT called and trigger id returned
      expect(triggerId).toBe('trigger-uuid-1');

      const [sql, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(sql.toUpperCase()).toContain('INSERT');
      expect(sql.toUpperCase()).toContain('WORKFLOW_RULE_TRIGGERS');
      expect(values).toContain('stale-rule');
      expect(values).toContain('board-uuid-1');
      expect(values).toContain('card-uuid-1');
    });

    it('sets trigger_error text when provided', async () => {
      // Arrange
      const mockDb = makeMockDb([
        { rows: [{ id: 'trigger-uuid-err' }], rowCount: 1 },
      ]);
      const { WorkflowRepository } = await import('../workflow.repository');
      const repo = new WorkflowRepository(mockDb);

      // Act
      await repo.insertTrigger({
        rule_id:        'stale-rule',
        board_id:       'board-uuid-1',
        card_id:        null,
        trigger_status: 'failed',
        trigger_error:  'DB constraint violation',
      });

      // Assert — error text passed to the query
      const [, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(values).toContain('failed');
      expect(values).toContain('DB constraint violation');
    });
  });

  // ── insertDelivery ─────────────────────────────────────────────────────────

  describe('insertDelivery(input)', () => {
    it('inserts a delivery row with correct trigger_id, attempt, and status', async () => {
      // Arrange
      const mockDb = makeMockDb([
        { rows: [{ id: 'delivery-uuid-1' }], rowCount: 1 },
      ]);
      const { WorkflowRepository } = await import('../workflow.repository');
      const repo = new WorkflowRepository(mockDb);

      // Act
      await repo.insertDelivery({
        trigger_id:      'trigger-uuid-1',
        attempt:         1,
        delivery_status: 'success',
        delivery_error:  null,
      });

      // Assert — correct SQL with right values
      const [sql, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(sql.toUpperCase()).toContain('INSERT');
      expect(sql.toUpperCase()).toContain('WORKFLOW_ACTION_DELIVERIES');
      expect(values).toContain('trigger-uuid-1');
      expect(values).toContain(1);
      expect(values).toContain('success');
    });
  });

  // ── updateDeliveryStatus ───────────────────────────────────────────────────

  describe('updateDeliveryStatus(id, status, error?)', () => {
    it('issues an UPDATE with success status and no error text', async () => {
      // Arrange
      const mockDb = makeMockDb([{ rows: [], rowCount: 1 }]);
      const { WorkflowRepository } = await import('../workflow.repository');
      const repo = new WorkflowRepository(mockDb);

      // Act
      await repo.updateDeliveryStatus('delivery-uuid-1', 'success');

      // Assert
      const [sql, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(sql.toUpperCase()).toContain('UPDATE');
      expect(sql.toUpperCase()).toContain('WORKFLOW_ACTION_DELIVERIES');
      expect(values).toContain('delivery-uuid-1');
      expect(values).toContain('success');
    });

    it('includes error text in UPDATE when status is failed', async () => {
      // Arrange
      const mockDb = makeMockDb([{ rows: [], rowCount: 1 }]);
      const { WorkflowRepository } = await import('../workflow.repository');
      const repo = new WorkflowRepository(mockDb);

      // Act
      await repo.updateDeliveryStatus('delivery-uuid-2', 'failed', 'color update failed after retries');

      // Assert — error text must be in the query params
      const [, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(values).toContain('delivery-uuid-2');
      expect(values).toContain('failed');
      expect(values).toContain('color update failed after retries');
    });
  });

  // ── moveCardToStale ────────────────────────────────────────────────────────

  describe('moveCardToStale(cardId, staleColumnId)', () => {
    it('issues a parameterized UPDATE setting column_id to the Stale column', async () => {
      // Arrange
      const mockDb = makeMockDb([{ rows: [], rowCount: 1 }]);
      const { WorkflowRepository } = await import('../workflow.repository');
      const repo = new WorkflowRepository(mockDb);

      // Act
      await repo.moveCardToStale('card-uuid-1', 'col-stale-uuid');

      // Assert
      const [sql, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(sql.toUpperCase()).toContain('UPDATE');
      expect(sql.toUpperCase()).toContain('CARDS');
      expect(values).toContain('card-uuid-1');
      expect(values).toContain('col-stale-uuid');
    });
  });
});
