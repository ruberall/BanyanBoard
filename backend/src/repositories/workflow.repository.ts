import type { Queryable } from '../db/queryable';

export interface WorkflowTriggerInput {
  rule_id: string;
  board_id: string;
  card_id: string | null;
  trigger_status: 'success' | 'failed';
  trigger_error: string | null;
}

export interface WorkflowDeliveryInput {
  trigger_id: string;
  attempt: number;
  delivery_status: 'pending' | 'success' | 'failed';
  delivery_error: string | null;
}

export interface StaleCard {
  id: string;
  column_id: string;
}

export class WorkflowRepository {
  constructor(private readonly db: Queryable) {}

  /**
   * Insert a workflow_rule_triggers row and return the generated id.
   */
  async insertTrigger(input: WorkflowTriggerInput): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO workflow_rule_triggers
         (rule_id, board_id, card_id, trigger_status, trigger_error)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [input.rule_id, input.board_id, input.card_id, input.trigger_status, input.trigger_error],
    );
    return result.rows[0].id;
  }

  /**
   * Insert a workflow_action_deliveries row and return the generated id.
   */
  async insertDelivery(input: WorkflowDeliveryInput): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO workflow_action_deliveries
         (trigger_id, attempt, delivery_status, delivery_error)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [input.trigger_id, input.attempt, input.delivery_status, input.delivery_error],
    );
    return result.rows[0].id;
  }

  /**
   * Update the delivery status (and optionally delivery_error) for a delivery row.
   */
  async updateDeliveryStatus(id: string, status: 'success' | 'failed', error?: string): Promise<void> {
    await this.db.query(
      `UPDATE workflow_action_deliveries
          SET delivery_status = $2,
              delivery_error  = $3
        WHERE id = $1`,
      [id, status, error ?? null],
    );
  }

  /**
   * Move a card to the Stale column by updating its column_id.
   */
  async moveCardToStale(cardId: string, staleColumnId: string): Promise<void> {
    await this.db.query(
      'UPDATE cards SET column_id = $2 WHERE id = $1',
      [cardId, staleColumnId],
    );
  }

  /**
   * Set the color of a card by its id.
   */
  async setCardColor(cardId: string, color: string): Promise<void> {
    await this.db.query(
      'UPDATE cards SET color = $2 WHERE id = $1',
      [cardId, color],
    );
  }

  /**
   * Find cards eligible for stale promotion:
   *   - belong to the given board
   *   - not already in the Stale column
   *   - not in the Done column
   *   - stale_suppressed = false
   *   - created_at older than ageDays days
   */
  async findStaleCards(
    boardId: string,
    staleColumnId: string,
    doneColumnId: string,
    ageDays: number,
  ): Promise<StaleCard[]> {
    const result = await this.db.query<StaleCard>(
      `SELECT c.id, c.column_id
         FROM cards c
         JOIN columns col ON col.id = c.column_id
        WHERE col.board_id = $1
          AND c.column_id != $2
          AND c.column_id != $3
          AND c.stale_suppressed = false
          AND c.created_at < NOW() - ($4 || ' days')::interval`,
      [boardId, staleColumnId, doneColumnId, ageDays],
    );
    return result.rows;
  }
}
