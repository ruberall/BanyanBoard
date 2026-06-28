import type { Column } from '../repositories/board.repository';
import type { WorkflowRepository, StaleCard } from '../repositories/workflow.repository';
import { logger } from '../logger';

// Shape of a recorded delivery attempt — assembled before inserting rows.
interface DeliveryRecord {
  attempt: number;
  delivery_status: 'success' | 'failed';
  delivery_error: string | null;
}

export interface WorkflowWarning {
  code: string;
  message: string;
  details?: Array<{ field: string; error: string }>;
}

export interface WorkflowConfig {
  workflowStaleAgeDays: number;
  workflowRule2BaseDelayMs: number;
  workflowRule2MaxAttempts: number;
}

const STALE_RULE_ID     = 'stale-rule';
const DONE_COLOR_RULE_ID = 'done-color-rule';
const DONE_COLOR_HEX     = '#d4edda';

export class WorkflowService {
  private readonly repo: WorkflowRepository;
  private readonly config: WorkflowConfig;

  constructor(repo: WorkflowRepository, config: WorkflowConfig) {
    this.repo = repo;
    this.config = config;
  }

  /**
   * Apply all workflow rules for the given board.
   *
   * Rule #1 (stale-move): cards older than workflowStaleAgeDays that are not in
   * the Stale or Done column are moved to the Stale column.
   *
   * Returns an array of WorkflowWarning for any non-fatal failures so callers
   * (e.g. GET /boards/:id) can surface diagnostics without blocking the response.
   */
  async applyBoardRules(boardId: string, columns: Column[]): Promise<WorkflowWarning[]> {
    const warnings: WorkflowWarning[] = [];

    const staleColumn = columns.find((c) => c.name === 'Stale');
    const doneColumn  = columns.find((c) => c.name === 'Done');

    if (!staleColumn) {
      logger.warn({ boardId, reason: 'no_stale_column' }, 'workflow.rule1.skipped');
      warnings.push({
        code:    'WORKFLOW_STALE_COL_MISSING',
        message: 'Stale column not found on board; skipping stale-move rule',
      });
      return warnings;
    }

    // Find all cards eligible for stale promotion.
    // If Done column is absent we use the stale column id itself as the exclusion
    // so no cards are mistakenly excluded (they'd already be excluded by the
    // staleColumnId != check).
    const doneColumnId = doneColumn?.id ?? staleColumn.id;
    const staleCards = await this.repo.findStaleCards(
      boardId,
      staleColumn.id,
      doneColumnId,
      this.config.workflowStaleAgeDays,
    );

    if (staleCards.length === 0) {
      return warnings;
    }

    // Use Promise.allSettled so one failure does not prevent other cards from moving.
    const results = await Promise.allSettled(
      staleCards.map((card) => this.moveCardToStale(card, boardId, staleColumn.id)),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected') {
        const cardId = staleCards[i].id;
        const err = result.reason as Error;
        logger.warn({ err, cardId, boardId }, 'workflow.stale_move.failed');
        warnings.push({
          code:    'WORKFLOW_ACTION_FAILED',
          message: `Stale rule failed for card ${cardId}: ${err.message}`,
        });
      }
    }

    return warnings;
  }

  /**
   * Rule #2 — Done-color: set a card's color to pale green when it is moved to Done.
   *
   * Retries up to config.workflowRule2MaxAttempts times with exponential backoff.
   * All delivery attempts are tracked in workflow_action_deliveries.
   * The trigger row is inserted after all attempts so its status reflects the
   * final outcome.
   *
   * NEVER throws — always resolves so callers can fire-and-forget safely.
   */
  async triggerDoneColorRule(boardId: string, cardId: string): Promise<void> {
    const maxAttempts  = this.config.workflowRule2MaxAttempts;
    const baseDelayMs  = this.config.workflowRule2BaseDelayMs;
    const deliveries: DeliveryRecord[] = [];
    let finalSuccess = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.repo.setCardColor(cardId, DONE_COLOR_HEX);
        deliveries.push({ attempt, delivery_status: 'success', delivery_error: null });
        finalSuccess = true;
        break;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        deliveries.push({ attempt, delivery_status: 'failed', delivery_error: errMsg });

        if (attempt < maxAttempts) {
          // Exponential backoff: attempt 1 → baseDelayMs, attempt 2 → baseDelayMs*2, …
          const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
          await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    try {
      const lastError = deliveries.at(-1)?.delivery_error ?? null;
      const triggerId = await this.repo.insertTrigger({
        rule_id:        DONE_COLOR_RULE_ID,
        board_id:       boardId,
        card_id:        cardId,
        trigger_status: finalSuccess ? 'success' : 'failed',
        trigger_error:  finalSuccess ? null : lastError,
      });

      for (const d of deliveries) {
        await this.repo.insertDelivery({
          trigger_id:      triggerId,
          attempt:         d.attempt,
          delivery_status: d.delivery_status,
          delivery_error:  d.delivery_error,
        }).catch(() => {}); // best-effort — tracking failure must not throw
      }

      if (finalSuccess) {
        logger.info({ rule: DONE_COLOR_RULE_ID, boardId, cardId }, 'workflow.rule2.applied');
      } else {
        logger.error(
          { rule: DONE_COLOR_RULE_ID, boardId, cardId, finalAttempt: maxAttempts },
          'workflow.rule2.exhausted',
        );
      }
    } catch (err) {
      // Tracking insert failed — log and swallow so we never throw.
      logger.error({ err, rule: DONE_COLOR_RULE_ID, boardId, cardId }, 'workflow.rule2.tracking_failed');
    }
  }

  private async moveCardToStale(
    card: StaleCard,
    boardId: string,
    staleColumnId: string,
  ): Promise<void> {
    // Attempt the move; if it fails the error propagates to Promise.allSettled.
    await this.repo.moveCardToStale(card.id, staleColumnId);

    // Insert success tracking rows.
    const triggerId = await this.repo.insertTrigger({
      rule_id:        STALE_RULE_ID,
      board_id:       boardId,
      card_id:        card.id,
      trigger_status: 'success',
      trigger_error:  null,
    });

    await this.repo.insertDelivery({
      trigger_id:      triggerId,
      attempt:         1,
      delivery_status: 'success',
      delivery_error:  null,
    });
  }
}
