/**
 * automation.repository.test.ts
 *
 * Unit tests for AutomationRepository — the SQL persistence layer for the
 * three new automation webhook tables (automation_rules, trigger_executions,
 * webhook_deliveries).
 *
 * All DB calls are mocked via a mock Queryable. No real Postgres required.
 *
 * Tests will FAIL until the Coding Agent implements:
 *   src/repositories/automation.repository.ts — AutomationRepository class
 */

import type { Queryable } from '../db/queryable';

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
// Test data fixtures
// ---------------------------------------------------------------------------

const RULE_ID    = 'rule-uuid-aaaa';
const BOARD_ID   = 'board-uuid-bbbb';
const EXEC_ID    = 'exec-uuid-cccc';
const DELIVERY_ID = 'delivery-uuid-dddd';
const CARD_ID    = 'card-uuid-eeee';

const fixRule = {
  id:           RULE_ID,
  board_id:     BOARD_ID,
  trigger_type: 'card.moved.done',
  webhook_url:  'https://example.com/hook',
  enabled:      true,
  created_at:   '2026-06-30T00:00:00.000Z',
};

const fixExecution = {
  id:                 EXEC_ID,
  automation_rule_id: RULE_ID,
  board_id:           BOARD_ID,
  card_id:            CARD_ID,
  occurred_at:        '2026-06-30T01:00:00.000Z',
};

const fixDelivery = {
  id:                   DELIVERY_ID,
  trigger_execution_id: EXEC_ID,
  automation_rule_id:   RULE_ID,
  board_id:             BOARD_ID,
  attempt_count:        0,
  status:               'pending',
  http_response_code:   null,
  error:                null,
  created_at:           '2026-06-30T01:00:00.000Z',
  updated_at:           '2026-06-30T01:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AutomationRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── insertRule ─────────────────────────────────────────────────────────────

  describe('insertRule(input)', () => {
    it('inserts an automation_rule row and returns the full domain object', async () => {
      // Arrange
      const mockDb = makeMockDb([{ rows: [fixRule], rowCount: 1 }]);
      const { AutomationRepository } = await import('../repositories/automation.repository');
      const repo = new AutomationRepository(mockDb);

      // Act
      const result = await repo.insertRule({
        board_id:     BOARD_ID,
        trigger_type: 'card.moved.done',
        webhook_url:  'https://example.com/hook',
      });

      // Assert — returned domain object matches fixture
      expect(result.id).toBe(RULE_ID);
      expect(result.board_id).toBe(BOARD_ID);
      expect(result.trigger_type).toBe('card.moved.done');
      expect(result.webhook_url).toBe('https://example.com/hook');
      expect(result.enabled).toBe(true);

      // SQL assertions — parameterized INSERT with RETURNING
      const [sql, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(sql.toUpperCase()).toContain('INSERT');
      expect(sql.toUpperCase()).toContain('AUTOMATION_RULES');
      expect(sql.toUpperCase()).toContain('RETURNING');
      // No string interpolation — values passed as parameters
      expect(values).toContain(BOARD_ID);
      expect(values).toContain('card.moved.done');
      expect(values).toContain('https://example.com/hook');
      // Parameterized placeholders must be used (not string interpolation)
      expect(sql).toMatch(/\$\d/);
    });
  });

  // ── findRulesByBoard ───────────────────────────────────────────────────────

  describe('findRulesByBoard(boardId)', () => {
    it('returns all automation rules for a board', async () => {
      // Arrange
      const mockDb = makeMockDb([{ rows: [fixRule], rowCount: 1 }]);
      const { AutomationRepository } = await import('../repositories/automation.repository');
      const repo = new AutomationRepository(mockDb);

      // Act
      const results = await repo.findRulesByBoard(BOARD_ID);

      // Assert — array returned with the rule
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(RULE_ID);

      // SQL assertions — parameterized boardId
      const [sql, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(sql.toUpperCase()).toContain('SELECT');
      expect(sql.toUpperCase()).toContain('AUTOMATION_RULES');
      expect(values).toContain(BOARD_ID);
      expect(sql).toMatch(/\$\d/);
    });

    it('returns empty array when no rules exist for the board', async () => {
      // Arrange
      const mockDb = makeMockDb([{ rows: [], rowCount: 0 }]);
      const { AutomationRepository } = await import('../repositories/automation.repository');
      const repo = new AutomationRepository(mockDb);

      // Act
      const results = await repo.findRulesByBoard('no-rules-board');

      // Assert
      expect(results).toEqual([]);
    });
  });

  // ── findEnabledRulesByBoardAndTrigger ──────────────────────────────────────

  describe('findEnabledRulesByBoardAndTrigger(boardId, triggerType)', () => {
    it('returns only enabled rules matching boardId and triggerType', async () => {
      // Arrange
      const mockDb = makeMockDb([{ rows: [fixRule], rowCount: 1 }]);
      const { AutomationRepository } = await import('../repositories/automation.repository');
      const repo = new AutomationRepository(mockDb);

      // Act
      const results = await repo.findEnabledRulesByBoardAndTrigger(BOARD_ID, 'card.moved.done');

      // Assert — only enabled rules returned
      expect(results).toHaveLength(1);
      expect(results[0].enabled).toBe(true);

      // SQL assertions — parameterized boardId + triggerType, filters enabled=true
      const [sql, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(sql.toUpperCase()).toContain('AUTOMATION_RULES');
      expect(sql.toLowerCase()).toContain('enabled');
      expect(values).toContain(BOARD_ID);
      expect(values).toContain('card.moved.done');
      expect(sql).toMatch(/\$\d/);
    });
  });

  // ── updateRuleEnabled ──────────────────────────────────────────────────────

  describe('updateRuleEnabled(ruleId, enabled)', () => {
    it('issues a parameterized UPDATE setting enabled for the given ruleId', async () => {
      // Arrange
      const mockDb = makeMockDb([{ rows: [], rowCount: 1 }]);
      const { AutomationRepository } = await import('../repositories/automation.repository');
      const repo = new AutomationRepository(mockDb);

      // Act
      await repo.updateRuleEnabled(RULE_ID, false);

      // Assert
      const [sql, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(sql.toUpperCase()).toContain('UPDATE');
      expect(sql.toUpperCase()).toContain('AUTOMATION_RULES');
      expect(values).toContain(RULE_ID);
      expect(values).toContain(false);
      expect(sql).toMatch(/\$\d/);
    });
  });

  // ── deleteRule ─────────────────────────────────────────────────────────────

  describe('deleteRule(ruleId)', () => {
    it('issues a parameterized DELETE for the given ruleId', async () => {
      // Arrange
      const mockDb = makeMockDb([{ rows: [], rowCount: 1 }]);
      const { AutomationRepository } = await import('../repositories/automation.repository');
      const repo = new AutomationRepository(mockDb);

      // Act
      await repo.deleteRule(RULE_ID);

      // Assert
      const [sql, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(sql.toUpperCase()).toContain('DELETE');
      expect(sql.toUpperCase()).toContain('AUTOMATION_RULES');
      expect(values).toContain(RULE_ID);
      expect(sql).toMatch(/\$\d/);
    });
  });

  // ── insertTriggerExecution ─────────────────────────────────────────────────

  describe('insertTriggerExecution(input)', () => {
    it('inserts a trigger_execution row and returns the full domain object with id', async () => {
      // Arrange
      const mockDb = makeMockDb([{ rows: [fixExecution], rowCount: 1 }]);
      const { AutomationRepository } = await import('../repositories/automation.repository');
      const repo = new AutomationRepository(mockDb);

      // Act
      const result = await repo.insertTriggerExecution({
        automation_rule_id: RULE_ID,
        board_id:           BOARD_ID,
        card_id:            CARD_ID,
      });

      // Assert — RETURNING gives back the id
      expect(result.id).toBe(EXEC_ID);
      expect(result.automation_rule_id).toBe(RULE_ID);

      // SQL assertions — parameterized INSERT with RETURNING
      const [sql, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(sql.toUpperCase()).toContain('INSERT');
      expect(sql.toUpperCase()).toContain('TRIGGER_EXECUTIONS');
      expect(sql.toUpperCase()).toContain('RETURNING');
      expect(values).toContain(RULE_ID);
      expect(values).toContain(BOARD_ID);
      expect(sql).toMatch(/\$\d/);
    });

    it('accepts null card_id for executions not tied to a specific card', async () => {
      // Arrange
      const execWithNullCard = { ...fixExecution, card_id: null };
      const mockDb = makeMockDb([{ rows: [execWithNullCard], rowCount: 1 }]);
      const { AutomationRepository } = await import('../repositories/automation.repository');
      const repo = new AutomationRepository(mockDb);

      // Act
      const result = await repo.insertTriggerExecution({
        automation_rule_id: RULE_ID,
        board_id:           BOARD_ID,
        card_id:            null,
      });

      // Assert
      expect(result.card_id).toBeNull();
      const [, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(values).toContain(null);
    });
  });

  // ── insertWebhookDelivery ──────────────────────────────────────────────────

  describe('insertWebhookDelivery(input)', () => {
    it('inserts a webhook_delivery row with initial status=pending, attempt_count=0 and returns the full domain object', async () => {
      // Arrange
      const mockDb = makeMockDb([{ rows: [fixDelivery], rowCount: 1 }]);
      const { AutomationRepository } = await import('../repositories/automation.repository');
      const repo = new AutomationRepository(mockDb);

      // Act
      const result = await repo.insertWebhookDelivery({
        trigger_execution_id: EXEC_ID,
        automation_rule_id:   RULE_ID,
        board_id:             BOARD_ID,
      });

      // Assert — RETURNING gives back the id with pending status
      expect(result.id).toBe(DELIVERY_ID);
      expect(result.status).toBe('pending');
      expect(result.attempt_count).toBe(0);

      // SQL assertions — parameterized INSERT with RETURNING
      const [sql, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(sql.toUpperCase()).toContain('INSERT');
      expect(sql.toUpperCase()).toContain('WEBHOOK_DELIVERIES');
      expect(sql.toUpperCase()).toContain('RETURNING');
      expect(values).toContain(EXEC_ID);
      expect(values).toContain(RULE_ID);
      expect(values).toContain(BOARD_ID);
      expect(sql).toMatch(/\$\d/);
    });
  });

  // ── updateDeliveryAttempt ──────────────────────────────────────────────────

  describe('updateDeliveryAttempt(deliveryId, update)', () => {
    it('issues UPDATE setting status, attempt_count, http_response_code and sets updated_at', async () => {
      // Arrange
      const mockDb = makeMockDb([{ rows: [], rowCount: 1 }]);
      const { AutomationRepository } = await import('../repositories/automation.repository');
      const repo = new AutomationRepository(mockDb);

      // Act
      await repo.updateDeliveryAttempt(DELIVERY_ID, {
        status:             'delivered',
        attempt_count:      1,
        http_response_code: 200,
        error:              null,
      });

      // Assert
      const [sql, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(sql.toUpperCase()).toContain('UPDATE');
      expect(sql.toUpperCase()).toContain('WEBHOOK_DELIVERIES');
      // updated_at = now() must be set
      expect(sql.toLowerCase()).toContain('updated_at');
      expect(values).toContain(DELIVERY_ID);
      expect(values).toContain('delivered');
      expect(values).toContain(1);
      expect(values).toContain(200);
      expect(sql).toMatch(/\$\d/);
    });

    it('handles failed status with error object', async () => {
      // Arrange
      const mockDb = makeMockDb([{ rows: [], rowCount: 1 }]);
      const { AutomationRepository } = await import('../repositories/automation.repository');
      const repo = new AutomationRepository(mockDb);

      const errorPayload = { message: 'Connection refused', code: 'ECONNREFUSED' };

      // Act
      await repo.updateDeliveryAttempt(DELIVERY_ID, {
        status:             'failed',
        attempt_count:      2,
        http_response_code: null,
        error:              errorPayload,
      });

      // Assert — error jsonb value is passed
      const [, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(values).toContain('failed');
      expect(values).toContain(2);
      // The error payload should be in the values (may be serialized)
      const hasErrorPayload = values.some(
        (v) => v !== null && typeof v === 'object' && (v as Record<string, unknown>).message === 'Connection refused',
      ) || values.some((v) => typeof v === 'string' && v.includes('ECONNREFUSED'));
      expect(hasErrorPayload).toBe(true);
    });
  });

  // ── findDeliveriesByBoard ──────────────────────────────────────────────────

  describe('findDeliveriesByBoard(boardId, limit?, cursor?)', () => {
    it('returns a DeliveryPage with deliveries for a board ordered by id DESC', async () => {
      // Arrange — two deliveries (newer first); fetchLimit = default(20)+1 = 21 rows requested
      const delivery1 = { ...fixDelivery, id: 'delivery-1', created_at: '2026-06-30T02:00:00.000Z' };
      const delivery2 = { ...fixDelivery, id: 'delivery-2', created_at: '2026-06-30T01:00:00.000Z' };
      const mockDb = makeMockDb([{ rows: [delivery1, delivery2], rowCount: 2 }]);
      const { AutomationRepository } = await import('../repositories/automation.repository');
      const repo = new AutomationRepository(mockDb);

      // Act
      const page = await repo.findDeliveriesByBoard(BOARD_ID);

      // Assert — paginated envelope returned
      expect(page.data).toHaveLength(2);
      expect(page.data[0].id).toBe('delivery-1');
      expect(page.hasMore).toBe(false);
      expect(page.nextCursor).toBeUndefined();

      const [sql, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(sql.toUpperCase()).toContain('WEBHOOK_DELIVERIES');
      expect(sql.toUpperCase()).toContain('ORDER');
      expect(values).toContain(BOARD_ID);
      expect(sql).toMatch(/\$\d/);
    });

    it('returns empty DeliveryPage when no deliveries exist for the board', async () => {
      // Arrange
      const mockDb = makeMockDb([{ rows: [], rowCount: 0 }]);
      const { AutomationRepository } = await import('../repositories/automation.repository');
      const repo = new AutomationRepository(mockDb);

      // Act
      const page = await repo.findDeliveriesByBoard('empty-board');

      // Assert
      expect(page.data).toEqual([]);
      expect(page.hasMore).toBe(false);
      expect(page.nextCursor).toBeUndefined();
    });

    it('passes fetchLimit (limit + 1) when limit is provided', async () => {
      // Arrange
      const mockDb = makeMockDb([{ rows: [], rowCount: 0 }]);
      const { AutomationRepository } = await import('../repositories/automation.repository');
      const repo = new AutomationRepository(mockDb);

      // Act
      await repo.findDeliveriesByBoard(BOARD_ID, 10);

      // Assert — fetchLimit (11) appears in query parameters
      const [sql, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(values).toContain(BOARD_ID);
      expect(values).toContain(11);
      expect(sql.toUpperCase()).toContain('LIMIT');
    });
  });
});
