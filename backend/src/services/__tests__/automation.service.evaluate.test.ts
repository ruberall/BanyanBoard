/**
 * automation.service.evaluate.test.ts
 *
 * Phase 2 coverage: AutomationService.evaluateCardMovedToDone (TASK-019)
 *
 * Tests FAIL until AutomationService gains:
 *   - evaluateCardMovedToDone(boardId, card): Promise<void>
 *     - Queries repo.findEnabledRulesByBoardAndTrigger(boardId, 'card.moved.done')
 *     - For each matching rule, calls repo.insertTriggerExecution({ automation_rule_id, board_id, card_id })
 *     - Always resolves — never rejects to caller (no-throw guarantee)
 *     - Returns void (undefined)
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
