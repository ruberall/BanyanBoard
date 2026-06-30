import { WorkflowError, NotFoundError } from '../errors';
import type { AutomationRepository, AutomationRule, DeliveryPage } from '../repositories/automation.repository';

function validateWebhookUrl(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new WorkflowError('Webhook URL must use http or https scheme', [
        { field: 'webhook_url', error: 'Must be a valid http or https URL' },
      ]);
    }
  } catch (err) {
    if (err instanceof WorkflowError) throw err;
    throw new WorkflowError('Invalid webhook URL', [
      { field: 'webhook_url', error: 'Must be a valid URL' },
    ]);
  }
}

const ALLOWED_TRIGGER_TYPES = ['card.moved.done'] as const;

export class AutomationService {
  constructor(private readonly repo: AutomationRepository) {}

  async createRule(boardId: string, input: { trigger_type: string; webhook_url: string; enabled?: boolean }): Promise<AutomationRule> {
    validateWebhookUrl(input.webhook_url);
    if (!(ALLOWED_TRIGGER_TYPES as readonly string[]).includes(input.trigger_type)) {
      throw new WorkflowError('Invalid trigger type', [
        { field: 'trigger_type', error: `Must be one of: ${ALLOWED_TRIGGER_TYPES.join(', ')}` },
      ]);
    }
    return this.repo.insertRule({ board_id: boardId, ...input });
  }

  async listRules(boardId: string): Promise<AutomationRule[]> {
    return this.repo.findRulesByBoard(boardId);
  }

  async updateRuleEnabled(ruleId: string, enabled: boolean): Promise<AutomationRule> {
    const rule = await this.repo.updateRuleEnabled(ruleId, enabled);
    if (!rule) throw new NotFoundError(`Automation rule ${ruleId} not found`);
    return rule;
  }

  async deleteRule(ruleId: string): Promise<void> {
    const deleted = await this.repo.deleteRule(ruleId);
    if (deleted === 0) throw new NotFoundError(`Automation rule ${ruleId} not found`);
  }

  async listDeliveries(boardId: string, limit?: number, cursor?: string): Promise<DeliveryPage> {
    return this.repo.findDeliveriesByBoard(boardId, limit, cursor);
  }
}
