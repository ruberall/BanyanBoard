/**
 * automation.service.evaluate.test.ts
 *
 * Phase 2 coverage: AutomationService.evaluateCardMovedToDone (TASK-019)
 * Phase 3 additions: dispatcher integration (optional 2nd constructor param)
 *
 * Tests FAIL until AutomationService gains:
 *   Phase 2:
 *   - evaluateCardMovedToDone(boardId, card): Promise<void>
 *     - Queries repo.findEnabledRulesByBoardAndTrigger(boardId, 'card.moved.done')
 *     - For each matching rule, calls repo.insertTriggerExecution({ automation_rule_id, board_id, card_id })
 *     - Always resolves — never rejects to caller (no-throw guarantee)
 *     - Returns void (undefined)
 *   Phase 3:
 *   - constructor(repo, dispatcher?: WebhookDispatcher)
 *   - evaluateCardMovedToDone(boardId, card: { id, title, fromColumnName?, toColumnName? }): Promise<void>
 *     - After insertTriggerExecution succeeds, calls dispatcher.dispatch(rule, execution, payload)
 *     - payload shape: { version:'1', event:'card.moved.done', rule_id, board_id,
 *                        trigger_execution_id, occurred_at, data:{card_id, card_title, from_column, to_column} }
 *     - dispatch errors are swallowed (no-throw from evaluateCardMovedToDone)
 *     - backward compat: no dispatcher → no dispatch call
 */

import { AutomationService } from '../automation.service';
import type { AutomationRepository, AutomationRule, TriggerExecution } from '../../repositories/automation.repository';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_RULE: AutomationRule = {
  id: 'rule-uuid-1',
  board_id: 'board-uuid-1',
  trigger_type: 'card.moved.done',
  webhook_url: 'https://example.com/hook',
  enabled: true,
  created_at: new Date('2026-06-16T00:00:00Z'),
};

const BASE_EXECUTION: TriggerExecution = {
  id: 'te-uuid-1',
  automation_rule_id: 'rule-uuid-1',
  board_id: 'board-uuid-1',
  card_id: 'card-uuid-1',
  occurred_at: new Date('2026-06-16T00:00:00Z'),
};

const BASE_CARD = { id: 'card-uuid-1', title: 'Write tests' };

// Phase 3 extended card shape (includes column context for payload building)
const FULL_CARD = {
  id: 'card-uuid-1',
  title: 'Write tests',
  fromColumnName: 'In Progress' as string | null,
  toColumnName: 'Done',
};

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

function makeMockRepo(): jest.Mocked<AutomationRepository> {
  return {
    insertRule: jest.fn(),
    findRulesByBoard: jest.fn(),
    findEnabledRulesByBoardAndTrigger: jest.fn().mockResolvedValue([]),
    updateRuleEnabled: jest.fn(),
    deleteRule: jest.fn(),
    insertTriggerExecution: jest.fn().mockResolvedValue(BASE_EXECUTION),
    insertWebhookDelivery: jest.fn(),
    updateDeliveryAttempt: jest.fn(),
    findDeliveriesByBoard: jest.fn(),
  } as unknown as jest.Mocked<AutomationRepository>;
}

// ---------------------------------------------------------------------------
// Mock dispatcher (Phase 3)
// ---------------------------------------------------------------------------

function makeMockDispatcher(): { dispatch: jest.Mock } {
  return { dispatch: jest.fn().mockResolvedValue(undefined) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AutomationService.evaluateCardMovedToDone', () => {
  let repo: jest.Mocked<AutomationRepository>;
  let service: AutomationService;

  beforeEach(() => {
    repo = makeMockRepo();
    service = new AutomationService(repo);
  });

  it('calls findEnabledRulesByBoardAndTrigger with boardId and card.moved.done trigger type', async () => {
    // Arrange — repo returns no rules (default mock)

    // Act
    await service.evaluateCardMovedToDone('board-uuid-1', BASE_CARD);

    // Assert
    expect(repo.findEnabledRulesByBoardAndTrigger).toHaveBeenCalledTimes(1);
    expect(repo.findEnabledRulesByBoardAndTrigger).toHaveBeenCalledWith('board-uuid-1', 'card.moved.done');
  });

  it('inserts one trigger_execution when one enabled rule matches', async () => {
    // Arrange
    repo.findEnabledRulesByBoardAndTrigger.mockResolvedValueOnce([BASE_RULE]);

    // Act
    await service.evaluateCardMovedToDone('board-uuid-1', BASE_CARD);

    // Assert
    expect(repo.insertTriggerExecution).toHaveBeenCalledTimes(1);
    expect(repo.insertTriggerExecution).toHaveBeenCalledWith({
      automation_rule_id: BASE_RULE.id,
      board_id: 'board-uuid-1',
      card_id: BASE_CARD.id,
    });
  });

  it('inserts N trigger_executions when N rules match', async () => {
    // Arrange — two enabled rules for the same board
    const rule2: AutomationRule = { ...BASE_RULE, id: 'rule-uuid-2', webhook_url: 'https://example.com/hook2' };
    repo.findEnabledRulesByBoardAndTrigger.mockResolvedValueOnce([BASE_RULE, rule2]);

    // Act
    await service.evaluateCardMovedToDone('board-uuid-1', BASE_CARD);

    // Assert — one insertTriggerExecution per rule, each with its own rule id
    expect(repo.insertTriggerExecution).toHaveBeenCalledTimes(2);
    expect(repo.insertTriggerExecution).toHaveBeenCalledWith(
      expect.objectContaining({ automation_rule_id: BASE_RULE.id }),
    );
    expect(repo.insertTriggerExecution).toHaveBeenCalledWith(
      expect.objectContaining({ automation_rule_id: rule2.id }),
    );
  });

  it('does NOT call insertTriggerExecution when no rules match', async () => {
    // Arrange — default mock already returns []

    // Act
    await service.evaluateCardMovedToDone('board-uuid-1', BASE_CARD);

    // Assert
    expect(repo.insertTriggerExecution).not.toHaveBeenCalled();
  });

  it('always resolves even when insertTriggerExecution throws (no-throw guarantee)', async () => {
    // Arrange — rule matches but insertion blows up
    repo.findEnabledRulesByBoardAndTrigger.mockResolvedValueOnce([BASE_RULE]);
    repo.insertTriggerExecution.mockRejectedValueOnce(new Error('DB write failed'));

    // Act + Assert — must resolve, not reject
    await expect(
      service.evaluateCardMovedToDone('board-uuid-1', BASE_CARD),
    ).resolves.toBeUndefined();
  });

  it('returns void (resolved value is undefined)', async () => {
    // Arrange — one rule found and insertion succeeds
    repo.findEnabledRulesByBoardAndTrigger.mockResolvedValueOnce([BASE_RULE]);

    // Act
    const result = await service.evaluateCardMovedToDone('board-uuid-1', BASE_CARD);

    // Assert
    expect(result).toBeUndefined();
  });

  it('passes the correct card_id through to each insertTriggerExecution call', async () => {
    // Arrange — different card id to ensure the value is threaded through, not hardcoded
    const differentCard = { id: 'card-uuid-99', title: 'Another card' };
    repo.findEnabledRulesByBoardAndTrigger.mockResolvedValueOnce([BASE_RULE]);

    // Act
    await service.evaluateCardMovedToDone('board-uuid-1', differentCard);

    // Assert
    expect(repo.insertTriggerExecution).toHaveBeenCalledWith(
      expect.objectContaining({ card_id: 'card-uuid-99' }),
    );
  });

  it('accepts a card with both id and title fields (minimum card shape)', async () => {
    // Arrange — verify the method accepts { id, title } without extra fields
    const minimalCard = { id: 'card-uuid-minimal', title: 'Minimal card' };
    repo.findEnabledRulesByBoardAndTrigger.mockResolvedValueOnce([BASE_RULE]);

    // Act + Assert — must not throw; title is present but unused in this phase
    await expect(
      service.evaluateCardMovedToDone('board-uuid-1', minimalCard),
    ).resolves.toBeUndefined();

    expect(repo.insertTriggerExecution).toHaveBeenCalledWith(
      expect.objectContaining({ card_id: 'card-uuid-minimal' }),
    );
  });
});

// ---------------------------------------------------------------------------
// Phase 3: AutomationService with optional WebhookDispatcher
// ---------------------------------------------------------------------------

describe('AutomationService.evaluateCardMovedToDone (Phase 3 — dispatcher integration)', () => {
  let repo: jest.Mocked<AutomationRepository>;
  let dispatcher: ReturnType<typeof makeMockDispatcher>;

  beforeEach(() => {
    repo = makeMockRepo();
    dispatcher = makeMockDispatcher();
  });

  it('calls dispatcher.dispatch after insertTriggerExecution when dispatcher is provided', async () => {
    repo.findEnabledRulesByBoardAndTrigger.mockResolvedValueOnce([BASE_RULE]);
    const service = new AutomationService(repo, dispatcher as never);

    await service.evaluateCardMovedToDone('board-uuid-1', FULL_CARD);

    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      BASE_RULE,
      BASE_EXECUTION,
      expect.objectContaining({
        version: '1',
        event: 'card.moved.done',
        rule_id: BASE_RULE.id,
        board_id: 'board-uuid-1',
        trigger_execution_id: BASE_EXECUTION.id,
      }),
    );
  });

  it('includes the exact payload envelope shape in dispatch call (stub detection)', async () => {
    repo.findEnabledRulesByBoardAndTrigger.mockResolvedValueOnce([BASE_RULE]);
    const service = new AutomationService(repo, dispatcher as never);

    await service.evaluateCardMovedToDone('board-uuid-1', FULL_CARD);

    const [_rule, _exec, payload] = dispatcher.dispatch.mock.calls[0] as [
      AutomationRule,
      TriggerExecution,
      {
        version: string;
        event: string;
        rule_id: string;
        board_id: string;
        trigger_execution_id: string;
        occurred_at: string;
        data: { card_id: string; card_title: string; from_column: string | null; to_column: string };
      },
    ];

    expect(payload.version).toBe('1');
    expect(payload.event).toBe('card.moved.done');
    expect(payload.rule_id).toBe(BASE_RULE.id);
    expect(payload.board_id).toBe('board-uuid-1');
    expect(payload.trigger_execution_id).toBe(BASE_EXECUTION.id);
    // occurred_at must be the ISO string from execution.occurred_at
    expect(payload.occurred_at).toBe(BASE_EXECUTION.occurred_at.toISOString());
    expect(payload.data).toEqual({
      card_id: FULL_CARD.id,
      card_title: FULL_CARD.title,
      from_column: FULL_CARD.fromColumnName,
      to_column: FULL_CARD.toColumnName,
    });
  });

  it('sets from_column to null when card.fromColumnName is undefined', async () => {
    repo.findEnabledRulesByBoardAndTrigger.mockResolvedValueOnce([BASE_RULE]);
    const service = new AutomationService(repo, dispatcher as never);
    const cardWithoutFrom = { id: 'card-uuid-1', title: 'Write tests', toColumnName: 'Done' };

    await service.evaluateCardMovedToDone('board-uuid-1', cardWithoutFrom);

    const [_rule, _exec, payload] = dispatcher.dispatch.mock.calls[0] as [AutomationRule, TriggerExecution, { data: { from_column: string | null } }];
    expect(payload.data.from_column).toBeNull();
  });

  it('does NOT call dispatcher.dispatch when no dispatcher is provided (backward compat)', async () => {
    repo.findEnabledRulesByBoardAndTrigger.mockResolvedValueOnce([BASE_RULE]);
    const serviceNoDispatcher = new AutomationService(repo);

    await serviceNoDispatcher.evaluateCardMovedToDone('board-uuid-1', FULL_CARD);

    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('swallows dispatch rejection — evaluateCardMovedToDone still resolves (no-throw)', async () => {
    repo.findEnabledRulesByBoardAndTrigger.mockResolvedValueOnce([BASE_RULE]);
    dispatcher.dispatch.mockRejectedValueOnce(new Error('Dispatcher exploded'));
    const service = new AutomationService(repo, dispatcher as never);

    await expect(
      service.evaluateCardMovedToDone('board-uuid-1', FULL_CARD),
    ).resolves.toBeUndefined();
  });

  it('calls dispatch once per matching rule (N rules → N dispatches)', async () => {
    const rule2: AutomationRule = { ...BASE_RULE, id: 'rule-uuid-2', webhook_url: 'https://other.example.com/hook' };
    repo.findEnabledRulesByBoardAndTrigger.mockResolvedValueOnce([BASE_RULE, rule2]);
    const execution2: TriggerExecution = { ...BASE_EXECUTION, id: 'te-uuid-2', automation_rule_id: rule2.id };
    repo.insertTriggerExecution
      .mockResolvedValueOnce(BASE_EXECUTION)
      .mockResolvedValueOnce(execution2);
    const service = new AutomationService(repo, dispatcher as never);

    await service.evaluateCardMovedToDone('board-uuid-1', FULL_CARD);

    expect(dispatcher.dispatch).toHaveBeenCalledTimes(2);
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      BASE_RULE,
      BASE_EXECUTION,
      expect.objectContaining({ rule_id: BASE_RULE.id }),
    );
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      rule2,
      execution2,
      expect.objectContaining({ rule_id: rule2.id }),
    );
  });
});
