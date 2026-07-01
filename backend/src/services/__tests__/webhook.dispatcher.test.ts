/**
 * webhook.dispatcher.test.ts
 *
 * Phase 3 coverage: WebhookDispatcher (TASK-019)
 *
 * Tests FAIL until WebhookDispatcher is implemented in src/services/webhook.dispatcher.ts:
 *   - dispatch(rule, execution, payload): Promise<void> — NEVER throws
 *   - Manual retry loop with per-attempt DB writes
 *   - Status lifecycle: pending → delivered | failed → exhausted
 *   - SSRF guard: blockPrivateRanges=true immediately exhausts private-IP destinations
 *   - Logs via pino (not console.log); logs host only, not full URL
 *
 * Test opts always use backoffMs: 0 to avoid fake timers.
 */

import pino from 'pino';
import type { DestinationStream } from 'pino';
import { Writable } from 'stream';

// ---------------------------------------------------------------------------
// Logger capture helper
// ---------------------------------------------------------------------------

interface CapturedLog {
  msg: string;
  [key: string]: unknown;
}

function makeCaptureLogger(): { logger: pino.Logger; logs: CapturedLog[] } {
  const logs: CapturedLog[] = [];
  const sink = new Writable({
    write(chunk, _enc, cb) {
      try {
        logs.push(JSON.parse(chunk.toString()) as CapturedLog);
      } catch {
        // ignore non-JSON
      }
      cb();
    },
  }) as DestinationStream;
  const logger = pino({ level: 'trace' }, sink);
  return { logger, logs };
}

// ---------------------------------------------------------------------------
// Imports — fail until implemented
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-require-imports */
const { WebhookDispatcher } = require('../webhook.dispatcher') as typeof import('../webhook.dispatcher');
const { WebhookTransport } = require('../webhook.transport') as typeof import('../webhook.transport');
/* eslint-enable @typescript-eslint/no-require-imports */

import type { AutomationRepository, AutomationRule, TriggerExecution, WebhookDelivery } from '../../repositories/automation.repository';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_RULE: AutomationRule = {
  id: 'rule-uuid-1',
  board_id: 'board-uuid-1',
  trigger_type: 'card.moved.done',
  webhook_url: 'https://hooks.example.com/receiver',
  enabled: true,
  created_at: new Date('2026-06-16T00:00:00Z'),
};

const BASE_EXECUTION: TriggerExecution = {
  id: 'te-uuid-1',
  automation_rule_id: 'rule-uuid-1',
  board_id: 'board-uuid-1',
  card_id: 'card-uuid-1',
  occurred_at: new Date('2026-06-16T10:00:00Z'),
};

const BASE_DELIVERY: WebhookDelivery = {
  id: 'wd-uuid-1',
  trigger_execution_id: 'te-uuid-1',
  automation_rule_id: 'rule-uuid-1',
  board_id: 'board-uuid-1',
  attempt_count: 0,
  status: 'pending',
  http_response_code: null,
  error: null,
  created_at: new Date('2026-06-16T10:00:00Z'),
  updated_at: new Date('2026-06-16T10:00:00Z'),
};

const BASE_PAYLOAD = {
  version: '1' as const,
  event: 'card.moved.done' as const,
  rule_id: 'rule-uuid-1',
  board_id: 'board-uuid-1',
  trigger_execution_id: 'te-uuid-1',
  occurred_at: '2026-06-16T10:00:00.000Z',
  data: {
    card_id: 'card-uuid-1',
    card_title: 'Write tests',
    from_column: null as string | null,
    to_column: 'Done',
  },
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
    insertWebhookDelivery: jest.fn().mockResolvedValue(BASE_DELIVERY),
    updateDeliveryAttempt: jest.fn().mockResolvedValue(undefined),
    findDeliveriesByBoard: jest.fn(),
  } as unknown as jest.Mocked<AutomationRepository>;
}

function makeMockTransport(): jest.Mocked<InstanceType<typeof WebhookTransport>> {
  return {
    post: jest.fn(),
  } as unknown as jest.Mocked<InstanceType<typeof WebhookTransport>>;
}

const BASE_OPTS = {
  maxAttempts: 3,
  backoffMs: 0,
  timeoutMs: 5000,
  blockPrivateRanges: false,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebhookDispatcher.dispatch', () => {
  let repo: jest.Mocked<AutomationRepository>;
  let transport: jest.Mocked<InstanceType<typeof WebhookTransport>>;
  let capture: ReturnType<typeof makeCaptureLogger>;
  let dispatcher: InstanceType<typeof WebhookDispatcher>;

  beforeEach(() => {
    repo = makeMockRepo();
    transport = makeMockTransport();
    capture = makeCaptureLogger();
    dispatcher = new WebhookDispatcher(repo, transport, BASE_OPTS, capture.logger);
  });

  // =========================================================================
  // AC-HAPPY-1: Success on first attempt
  // =========================================================================

  describe('AC-HAPPY-1: success on first attempt', () => {
    beforeEach(() => {
      transport.post.mockResolvedValue({ ok: true, status: 200 });
    });

    it('creates a webhook_deliveries row with status pending before the first attempt', async () => {
      await dispatcher.dispatch(BASE_RULE, BASE_EXECUTION, BASE_PAYLOAD);

      expect(repo.insertWebhookDelivery).toHaveBeenCalledTimes(1);
      expect(repo.insertWebhookDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger_execution_id: BASE_EXECUTION.id,
          automation_rule_id: BASE_RULE.id,
          board_id: BASE_RULE.board_id,
          status: 'pending',
        }),
      );
    });

    it('updates delivery to delivered after 200 response', async () => {
      await dispatcher.dispatch(BASE_RULE, BASE_EXECUTION, BASE_PAYLOAD);

      expect(repo.updateDeliveryAttempt).toHaveBeenCalledTimes(1);
      expect(repo.updateDeliveryAttempt).toHaveBeenCalledWith(
        BASE_DELIVERY.id,
        expect.objectContaining({
          status: 'delivered',
          attempt_count: 1,
          http_response_code: 200,
          error: null,
        }),
      );
    });

    it('sends the exact payload envelope to the webhook URL (stub detection)', async () => {
      await dispatcher.dispatch(BASE_RULE, BASE_EXECUTION, BASE_PAYLOAD);

      expect(transport.post).toHaveBeenCalledTimes(1);
      const [url, sentPayload] = transport.post.mock.calls[0] as [string, unknown, number];
      expect(url).toBe(BASE_RULE.webhook_url);
      expect(sentPayload).toEqual(BASE_PAYLOAD);
    });

    it('calls transport.post with the configured timeoutMs', async () => {
      await dispatcher.dispatch(BASE_RULE, BASE_EXECUTION, BASE_PAYLOAD);

      const [_url, _payload, timeoutMs] = transport.post.mock.calls[0] as [string, unknown, number];
      expect(timeoutMs).toBe(BASE_OPTS.timeoutMs);
    });
  });

  // =========================================================================
  // AC-ERROR-1: Non-2xx response
  // =========================================================================

  describe('AC-ERROR-1: non-2xx response', () => {
    it('records attempt with http_response_code=500 and non-null error when transport returns 500', async () => {
      transport.post.mockResolvedValue({ ok: false, status: 500 });

      await dispatcher.dispatch(BASE_RULE, BASE_EXECUTION, BASE_PAYLOAD);

      // The final updateDeliveryAttempt call for this exhausted delivery
      const lastCall = repo.updateDeliveryAttempt.mock.calls[repo.updateDeliveryAttempt.mock.calls.length - 1];
      const update = lastCall[1] as { status: string; attempt_count: number; http_response_code: number | null; error: unknown };
      expect(update.http_response_code).toBe(500);
      expect(update.error).not.toBeNull();
    });

    it('sets status to exhausted after all 3 attempts fail with 500', async () => {
      transport.post.mockResolvedValue({ ok: false, status: 500 });

      await dispatcher.dispatch(BASE_RULE, BASE_EXECUTION, BASE_PAYLOAD);

      expect(transport.post).toHaveBeenCalledTimes(3);
      const lastCall = repo.updateDeliveryAttempt.mock.calls[repo.updateDeliveryAttempt.mock.calls.length - 1];
      const update = lastCall[1] as { status: string; attempt_count: number };
      expect(update.status).toBe('exhausted');
      expect(update.attempt_count).toBe(3);
    });
  });

  // =========================================================================
  // AC-ERROR-1: Timeout
  // =========================================================================

  describe('AC-ERROR-1: timeout', () => {
    it('records http_response_code=null and errorKind=timeout detail when transport times out', async () => {
      transport.post.mockResolvedValue({ ok: false, status: null, errorKind: 'timeout' });

      await dispatcher.dispatch(BASE_RULE, BASE_EXECUTION, BASE_PAYLOAD);

      const calls = repo.updateDeliveryAttempt.mock.calls;
      // First attempt update should record null status code and timeout info
      const firstUpdate = calls[0][1] as { http_response_code: number | null; error: unknown };
      expect(firstUpdate.http_response_code).toBeNull();
      expect(firstUpdate.error).not.toBeNull();
    });
  });

  // =========================================================================
  // AC-ASYNC-1: Full lifecycle — all 3 attempts fail → exhausted
  // =========================================================================

  describe('AC-ASYNC-1: full lifecycle — all 3 failures → exhausted', () => {
    it('drives pending → failed → failed → exhausted with attempt_count incrementing each time', async () => {
      transport.post.mockResolvedValue({ ok: false, status: 503 });

      await dispatcher.dispatch(BASE_RULE, BASE_EXECUTION, BASE_PAYLOAD);

      // 3 attempts, 3 updateDeliveryAttempt calls
      expect(transport.post).toHaveBeenCalledTimes(3);
      expect(repo.updateDeliveryAttempt).toHaveBeenCalledTimes(3);

      const updates = repo.updateDeliveryAttempt.mock.calls.map((c) => c[1] as { status: string; attempt_count: number });
      expect(updates[0].attempt_count).toBe(1);
      expect(updates[0].status).toBe('failed');

      expect(updates[1].attempt_count).toBe(2);
      expect(updates[1].status).toBe('failed');

      expect(updates[2].attempt_count).toBe(3);
      expect(updates[2].status).toBe('exhausted');
    });

    it('terminal status is exhausted, attempt_count is 3', async () => {
      transport.post.mockResolvedValue({ ok: false, status: 500 });

      await dispatcher.dispatch(BASE_RULE, BASE_EXECUTION, BASE_PAYLOAD);

      const lastUpdate = repo.updateDeliveryAttempt.mock.calls[2][1] as { status: string; attempt_count: number };
      expect(lastUpdate.status).toBe('exhausted');
      expect(lastUpdate.attempt_count).toBe(3);
    });
  });

  // =========================================================================
  // AC-ASYNC-1: Full lifecycle — fails twice then succeeds
  // =========================================================================

  describe('AC-ASYNC-1: full lifecycle — 2 failures then success → delivered', () => {
    it('drives 2 failures + 1 success → terminal status=delivered, attempt_count=3', async () => {
      transport.post
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: true, status: 200 });

      await dispatcher.dispatch(BASE_RULE, BASE_EXECUTION, BASE_PAYLOAD);

      expect(transport.post).toHaveBeenCalledTimes(3);
      expect(repo.updateDeliveryAttempt).toHaveBeenCalledTimes(3);

      const updates = repo.updateDeliveryAttempt.mock.calls.map((c) => c[1] as { status: string; attempt_count: number });
      expect(updates[0].status).toBe('failed');
      expect(updates[0].attempt_count).toBe(1);

      expect(updates[1].status).toBe('failed');
      expect(updates[1].attempt_count).toBe(2);

      expect(updates[2].status).toBe('delivered');
      expect(updates[2].attempt_count).toBe(3);
    });

    it('stops retrying immediately after a success (does not attempt a 4th time)', async () => {
      // Success on attempt 1 — dispatcher must stop there
      transport.post.mockResolvedValueOnce({ ok: true, status: 200 });

      await dispatcher.dispatch(BASE_RULE, BASE_EXECUTION, BASE_PAYLOAD);

      expect(transport.post).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // No-throw guarantee
  // =========================================================================

  describe('no-throw guarantee', () => {
    it('never rejects to its caller even when transport throws synchronously', async () => {
      transport.post.mockRejectedValue(new Error('Unexpected transport failure'));

      await expect(
        dispatcher.dispatch(BASE_RULE, BASE_EXECUTION, BASE_PAYLOAD),
      ).resolves.toBeUndefined();
    });

    it('never rejects to its caller even when repo.insertWebhookDelivery throws', async () => {
      repo.insertWebhookDelivery.mockRejectedValueOnce(new Error('DB write failed'));

      await expect(
        dispatcher.dispatch(BASE_RULE, BASE_EXECUTION, BASE_PAYLOAD),
      ).resolves.toBeUndefined();
    });

    it('never rejects to its caller even when repo.updateDeliveryAttempt throws', async () => {
      transport.post.mockResolvedValue({ ok: true, status: 200 });
      repo.updateDeliveryAttempt.mockRejectedValue(new Error('DB update failed'));

      await expect(
        dispatcher.dispatch(BASE_RULE, BASE_EXECUTION, BASE_PAYLOAD),
      ).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // SSRF guard
  // =========================================================================

  describe('SSRF guard (blockPrivateRanges: true)', () => {
    let ssrfDispatcher: InstanceType<typeof WebhookDispatcher>;

    beforeEach(() => {
      ssrfDispatcher = new WebhookDispatcher(
        repo,
        transport,
        { ...BASE_OPTS, blockPrivateRanges: true },
        capture.logger,
      );
    });

    it('immediately exhausts delivery to a private RFC-1918 IP without making an HTTP call', async () => {
      const privateRule = { ...BASE_RULE, webhook_url: 'http://192.168.1.1/hook' };

      await ssrfDispatcher.dispatch(privateRule, BASE_EXECUTION, BASE_PAYLOAD);

      expect(transport.post).not.toHaveBeenCalled();

      // Delivery row must still be created and immediately exhausted
      expect(repo.insertWebhookDelivery).toHaveBeenCalledTimes(1);
      const lastUpdate = repo.updateDeliveryAttempt.mock.calls[repo.updateDeliveryAttempt.mock.calls.length - 1];
      const update = lastUpdate[1] as { status: string };
      expect(update.status).toBe('exhausted');
    });

    it('immediately exhausts delivery to loopback address (127.0.0.1) without HTTP call', async () => {
      const loopbackRule = { ...BASE_RULE, webhook_url: 'http://127.0.0.1/webhook' };

      await ssrfDispatcher.dispatch(loopbackRule, BASE_EXECUTION, BASE_PAYLOAD);

      expect(transport.post).not.toHaveBeenCalled();
    });

    it('immediately exhausts delivery to "localhost" hostname without HTTP call', async () => {
      const localhostRule = { ...BASE_RULE, webhook_url: 'http://localhost/webhook' };

      await ssrfDispatcher.dispatch(localhostRule, BASE_EXECUTION, BASE_PAYLOAD);

      expect(transport.post).not.toHaveBeenCalled();
    });

    it('allows delivery to a public IP when blockPrivateRanges is true', async () => {
      transport.post.mockResolvedValue({ ok: true, status: 200 });
      const publicRule = { ...BASE_RULE, webhook_url: 'https://8.8.8.8/hook' };

      await ssrfDispatcher.dispatch(publicRule, BASE_EXECUTION, BASE_PAYLOAD);

      expect(transport.post).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Observability
  // =========================================================================

  describe('observability', () => {
    it('emits webhook.dispatch.attempt log event on each attempt', async () => {
      transport.post.mockResolvedValue({ ok: true, status: 200 });

      await dispatcher.dispatch(BASE_RULE, BASE_EXECUTION, BASE_PAYLOAD);

      const attemptLogs = capture.logs.filter((l) => l['msg'] === 'webhook.dispatch.attempt');
      expect(attemptLogs.length).toBeGreaterThanOrEqual(1);
    });

    it('emits webhook.dispatch.delivered log event on success', async () => {
      transport.post.mockResolvedValue({ ok: true, status: 200 });

      await dispatcher.dispatch(BASE_RULE, BASE_EXECUTION, BASE_PAYLOAD);

      const deliveredLogs = capture.logs.filter((l) => l['msg'] === 'webhook.dispatch.delivered');
      expect(deliveredLogs.length).toBe(1);
    });

    it('emits webhook.dispatch.failed log event on non-final failure', async () => {
      transport.post
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: true, status: 200 });

      await dispatcher.dispatch(BASE_RULE, BASE_EXECUTION, BASE_PAYLOAD);

      const failedLogs = capture.logs.filter((l) => l['msg'] === 'webhook.dispatch.failed');
      expect(failedLogs.length).toBe(1);
    });

    it('emits webhook.dispatch.exhausted log event when all attempts fail', async () => {
      transport.post.mockResolvedValue({ ok: false, status: 500 });

      await dispatcher.dispatch(BASE_RULE, BASE_EXECUTION, BASE_PAYLOAD);

      const exhaustedLogs = capture.logs.filter((l) => l['msg'] === 'webhook.dispatch.exhausted');
      expect(exhaustedLogs.length).toBe(1);
    });

    it('does NOT log the full webhook URL in any log entry (Guiding Principle #9)', async () => {
      const urlWithCreds = 'https://secret-token@hooks.example.com/receiver?key=abc123';
      const ruleWithCreds = { ...BASE_RULE, webhook_url: urlWithCreds };
      transport.post.mockResolvedValue({ ok: true, status: 200 });

      await dispatcher.dispatch(ruleWithCreds, BASE_EXECUTION, BASE_PAYLOAD);

      const allLogText = JSON.stringify(capture.logs);
      expect(allLogText).not.toContain(urlWithCreds);
      // Path and query must not appear
      expect(allLogText).not.toContain('/receiver?key=abc123');
    });

    it('only logs the host portion of the webhook URL, not the path or query', async () => {
      transport.post.mockResolvedValue({ ok: true, status: 200 });

      await dispatcher.dispatch(BASE_RULE, BASE_EXECUTION, BASE_PAYLOAD);

      const allLogText = JSON.stringify(capture.logs);
      // host (without path) should appear in logs
      expect(allLogText).toContain('hooks.example.com');
      // full URL path should not appear
      expect(allLogText).not.toContain('/receiver');
    });
  });
});
