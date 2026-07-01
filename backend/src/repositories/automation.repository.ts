import type { Queryable } from '../db/queryable';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface DeliveryPage {
  data: WebhookDelivery[];
  hasMore: boolean;
  nextCursor: string | undefined;
}

export interface AutomationRule {
  id: string;
  board_id: string;
  trigger_type: string;
  webhook_url: string;
  enabled: boolean;
  created_at: Date;
}

export interface AutomationRuleInput {
  board_id: string;
  trigger_type: string;
  webhook_url: string;
  enabled?: boolean;
}

export interface TriggerExecution {
  id: string;
  automation_rule_id: string;
  board_id: string;
  card_id: string | null;
  occurred_at: Date;
}

export interface TriggerExecutionInput {
  automation_rule_id: string;
  board_id: string;
  card_id?: string | null;
}

export interface WebhookDelivery {
  id: string;
  trigger_execution_id: string;
  automation_rule_id: string;
  board_id: string;
  attempt_count: number;
  status: 'pending' | 'delivered' | 'failed' | 'exhausted';
  http_response_code: number | null;
  error: Array<{ field: string; error: string }> | null;
  created_at: Date;
  updated_at: Date;
}

export interface WebhookDeliveryInput {
  trigger_execution_id: string;
  automation_rule_id: string;
  board_id: string;
  status?: string;
  attempt_count?: number;
}

export interface DeliveryAttemptUpdate {
  attempt_count: number;
  status: string;
  http_response_code: number | null;
  error: unknown;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class AutomationRepository {
  constructor(private readonly db: Queryable) {}

  async insertRule(input: AutomationRuleInput): Promise<AutomationRule> {
    const result = await this.db.query<AutomationRule>(
      `INSERT INTO automation_rules (board_id, trigger_type, webhook_url, enabled)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.board_id, input.trigger_type, input.webhook_url, input.enabled ?? true],
    );
    return result.rows[0];
  }

  async findRulesByBoard(boardId: string): Promise<AutomationRule[]> {
    const result = await this.db.query<AutomationRule>(
      `SELECT * FROM automation_rules WHERE board_id = $1 ORDER BY created_at ASC`,
      [boardId],
    );
    return result.rows;
  }

  async findEnabledRulesByBoardAndTrigger(boardId: string, triggerType: string): Promise<AutomationRule[]> {
    const result = await this.db.query<AutomationRule>(
      `SELECT * FROM automation_rules
       WHERE board_id = $1 AND trigger_type = $2 AND enabled = true`,
      [boardId, triggerType],
    );
    return result.rows;
  }

  async updateRuleEnabled(ruleId: string, enabled: boolean): Promise<AutomationRule | null> {
    const result = await this.db.query<AutomationRule>(
      `UPDATE automation_rules SET enabled = $2 WHERE id = $1 RETURNING *`,
      [ruleId, enabled],
    );
    return result.rows[0] ?? null;
  }

  async deleteRule(ruleId: string): Promise<number> {
    const result = await this.db.query(
      `DELETE FROM automation_rules WHERE id = $1`,
      [ruleId],
    );
    return result.rowCount ?? 0;
  }

  async insertTriggerExecution(input: TriggerExecutionInput): Promise<TriggerExecution> {
    const result = await this.db.query<TriggerExecution>(
      `INSERT INTO trigger_executions (automation_rule_id, board_id, card_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.automation_rule_id, input.board_id, input.card_id ?? null],
    );
    return result.rows[0];
  }

  async insertWebhookDelivery(input: WebhookDeliveryInput): Promise<WebhookDelivery> {
    const result = await this.db.query<WebhookDelivery>(
      `INSERT INTO webhook_deliveries (trigger_execution_id, automation_rule_id, board_id, status, attempt_count)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.trigger_execution_id,
        input.automation_rule_id,
        input.board_id,
        input.status ?? 'pending',
        input.attempt_count ?? 0,
      ],
    );
    return result.rows[0];
  }

  async updateDeliveryAttempt(deliveryId: string, update: DeliveryAttemptUpdate): Promise<void> {
    await this.db.query(
      `UPDATE webhook_deliveries
       SET status = $1, attempt_count = $2, http_response_code = $3, error = $4, updated_at = now()
       WHERE id = $5`,
      [update.status, update.attempt_count, update.http_response_code, update.error, deliveryId],
    );
  }

  async findDeliveriesByBoard(boardId: string, limit = 20, cursor?: string): Promise<DeliveryPage> {
    const fetchLimit = limit + 1;
    const rows = cursor
      ? (await this.db.query<WebhookDelivery>(
          `SELECT * FROM webhook_deliveries
           WHERE board_id = $1 AND id < $2
           ORDER BY id DESC
           LIMIT $3`,
          [boardId, cursor, fetchLimit],
        )).rows
      : (await this.db.query<WebhookDelivery>(
          `SELECT * FROM webhook_deliveries
           WHERE board_id = $1
           ORDER BY id DESC
           LIMIT $2`,
          [boardId, fetchLimit],
        )).rows;

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    return { data, hasMore, nextCursor: hasMore ? data[data.length - 1]?.id : undefined };
  }
}
