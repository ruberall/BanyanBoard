import type { Logger } from 'pino';
import type { AutomationRepository, AutomationRule, TriggerExecution } from '../repositories/automation.repository';
import type { WebhookTransport } from './webhook.transport';
import { logger as defaultLogger } from '../logger';

export interface WebhookPayload {
  version: string;
  event: string;
  rule_id: string;
  board_id: string;
  trigger_execution_id: string;
  occurred_at: string;
  data: {
    card_id: string;
    card_title: string;
    from_column: string | null;
    to_column: string;
  };
}

interface DispatcherOptions {
  maxAttempts: number;
  backoffMs: number;
  timeoutMs: number;
  blockPrivateRanges: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isPrivateHost(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const hostname = parsed.hostname;

  if (hostname === 'localhost') return true;
  if (hostname === '::1') return true;
  if (hostname === '[::1]') return true;

  // IPv4 checks
  if (hostname.startsWith('127.')) return true;
  if (hostname.startsWith('10.')) return true;
  if (hostname.startsWith('192.168.')) return true;
  if (hostname.startsWith('169.254.')) return true;

  // 172.16.0.0 – 172.31.255.255
  const match = hostname.match(/^172\.(\d+)\./);
  if (match) {
    const octet = parseInt(match[1], 10);
    if (octet >= 16 && octet <= 31) return true;
  }

  return false;
}

export class WebhookDispatcher {
  private readonly log: Logger;

  constructor(
    private readonly repo: AutomationRepository,
    private readonly transport: WebhookTransport,
    private readonly opts: DispatcherOptions,
    log?: Logger,
  ) {
    this.log = log ?? defaultLogger;
  }

  async dispatch(rule: AutomationRule, execution: TriggerExecution, payload: WebhookPayload): Promise<void> {
    try {
      const host = new URL(rule.webhook_url).host;

      // SSRF guard
      if (this.opts.blockPrivateRanges && isPrivateHost(rule.webhook_url)) {
        const delivery = await this.repo.insertWebhookDelivery({
          trigger_execution_id: execution.id,
          automation_rule_id: rule.id,
          board_id: rule.board_id,
          status: 'pending',
          attempt_count: 0,
        });
        await this.repo.updateDeliveryAttempt(delivery.id, {
          attempt_count: 0,
          status: 'exhausted',
          http_response_code: null,
          error: [{ field: 'webhook_url', error: 'Blocked: private/loopback address' }],
        });
        this.log.warn({ deliveryId: delivery.id, ruleId: rule.id, host }, 'webhook.dispatch.blocked');
        return;
      }

      // Insert pending delivery row
      const delivery = await this.repo.insertWebhookDelivery({
        trigger_execution_id: execution.id,
        automation_rule_id: rule.id,
        board_id: rule.board_id,
        status: 'pending',
        attempt_count: 0,
      });

      // Manual retry loop
      for (let attempt = 1; attempt <= this.opts.maxAttempts; attempt++) {
        this.log.debug(
          { ruleId: rule.id, host, attempt, maxAttempts: this.opts.maxAttempts },
          'webhook.dispatch.attempt',
        );

        const result = await this.transport.post(rule.webhook_url, payload, this.opts.timeoutMs);
        const isLast = attempt === this.opts.maxAttempts;

        if (result.ok) {
          await this.repo.updateDeliveryAttempt(delivery.id, {
            attempt_count: attempt,
            status: 'delivered',
            http_response_code: result.status,
            error: null,
          });
          this.log.debug({ ruleId: rule.id, host, attempt }, 'webhook.dispatch.delivered');
          return;
        }

        // Build error detail
        let errorMessage: string;
        if (result.errorKind === 'timeout') {
          errorMessage = 'Request timed out';
        } else if (result.errorKind === 'connection') {
          errorMessage = 'Connection error';
        } else {
          errorMessage = `HTTP ${result.status}`;
        }
        const errorDetail = [{ field: 'http', error: errorMessage }];
        const newStatus = isLast ? 'exhausted' : 'failed';

        await this.repo.updateDeliveryAttempt(delivery.id, {
          attempt_count: attempt,
          status: newStatus,
          http_response_code: result.status ?? null,
          error: errorDetail,
        });

        const logEvent = isLast ? 'webhook.dispatch.exhausted' : 'webhook.dispatch.failed';
        this.log.warn(
          { ruleId: rule.id, host, attempt, status: result.status, errorKind: result.errorKind },
          logEvent,
        );

        if (!isLast) {
          await sleep(this.opts.backoffMs);
        }
      }
    } catch (err) {
      this.log.warn({ err }, 'webhook.dispatch.error');
    }
  }
}
