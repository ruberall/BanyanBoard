import type { WorkflowWarning } from './workflow.service';

/**
 * Pure message-building functions for WorkflowService's Rule #1 (stale-move)
 * warnings. Extracted so characterization tests can import and call these
 * directly without a DB round-trip — see TASK-022 creative decision (Decision 1).
 */

export function staleColumnMissingWarning(): WorkflowWarning {
  return {
    code:    'WORKFLOW_STALE_COL_MISSING',
    message: 'Stale column not found on board; skipping stale-move rule',
  };
}

export function staleMoveFailedWarning(cardId: string, errMessage: string): WorkflowWarning {
  return {
    code:    'WORKFLOW_ACTION_FAILED',
    message: `Stale rule failed for card ${cardId}: ${errMessage}`,
  };
}
