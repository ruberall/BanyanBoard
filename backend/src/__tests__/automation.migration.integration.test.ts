/**
 * automation.migration.integration.test.ts
 *
 * DB integration tests for Phase 1: Webhook Delivery for Workflow Rules (TASK-019).
 *
 * These tests require a live Postgres instance with migrations applied.
 * They are skipped gracefully when DATABASE_URL is absent (unit-only CI runs).
 *
 * Coverage:
 *   - All 3 new tables exist with expected columns
 *   - webhook_deliveries.status CHECK constraint: accepts valid values, rejects invalid
 *   - automation_rules.trigger_type CHECK constraint: accepts 'card.moved.done', rejects invalid
 *   - FK CASCADE: board DELETE cascades to automation_rules
 *   - FK CASCADE: automation_rule DELETE cascades to trigger_executions and webhook_deliveries
 *   - Partial index on automation_rules (board_id, trigger_type) WHERE enabled = true exists
 *
 * Tests will FAIL until the Coding Agent implements:
 *   backend/migrations/20260630120000_add-automation-webhooks.js
 */

import { Pool } from 'pg';
import { runMigrations } from '../db/migrate';
import type { Config } from '../config';

// ---------------------------------------------------------------------------
// Guard — skip entire suite when no real DB is available
// ---------------------------------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL;
const describeIfDb = DATABASE_URL ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Minimal config for integration tests
// ---------------------------------------------------------------------------
const testConfig: Config = {
  PORT: 3000,
  NODE_ENV: 'test',
  DATABASE_URL: DATABASE_URL ?? 'postgres://missing',
  LOG_LEVEL: 'silent',
  LOG_FORMAT: 'json',
  DB_POOL_MAX: 2,
  DB_POOL_IDLE_TIMEOUT_MS: 5000,
  DB_POOL_CONNECTION_TIMEOUT_MS: 3000,
};

// ---------------------------------------------------------------------------
// Integration tests — require live Postgres with migrations applied
// ---------------------------------------------------------------------------

describeIfDb('Automation Webhooks Migration — DB integration (requires live Postgres)', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    await runMigrations(pool, testConfig);
  });

  afterAll(async () => {
    await pool.end();
  });

  // -------------------------------------------------------------------------
  // automation_rules table
  // -------------------------------------------------------------------------
  describe('automation_rules table exists with correct schema', () => {
    it('table has all required columns with expected types', async () => {
      const result = await pool.query<{ column_name: string; data_type: string; is_nullable: string; column_default: string }>(
        `SELECT column_name, data_type, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = 'automation_rules'
          ORDER BY ordinal_position`,
      );

      const columns = result.rows.map((r) => r.column_name);
      expect(columns).toContain('id');
      expect(columns).toContain('board_id');
      expect(columns).toContain('trigger_type');
      expect(columns).toContain('webhook_url');
      expect(columns).toContain('enabled');
      expect(columns).toContain('created_at');

      // enabled defaults to true and is NOT NULL
      const enabledCol = result.rows.find((r) => r.column_name === 'enabled');
      expect(enabledCol).toBeDefined();
      expect(enabledCol!.is_nullable).toBe('NO');
      expect(enabledCol!.column_default).toMatch(/true/i);

      // webhook_url is NOT NULL
      const urlCol = result.rows.find((r) => r.column_name === 'webhook_url');
      expect(urlCol!.is_nullable).toBe('NO');
    });

    it('trigger_type CHECK constraint accepts card.moved.done and rejects invalid.type', async () => {
      const boardResult = await pool.query<{ id: string }>(
        'INSERT INTO boards (name) VALUES ($1) RETURNING id',
        ['Automation Rule Constraint Test Board'],
      );
      const testBoardId = boardResult.rows[0].id;

      try {
        // Valid trigger_type should succeed
        const ruleResult = await pool.query<{ id: string }>(
          `INSERT INTO automation_rules (board_id, trigger_type, webhook_url)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [testBoardId, 'card.moved.done', 'https://example.com/hook'],
        );
        expect(ruleResult.rows[0].id).toBeDefined();

        // Invalid trigger_type should violate CHECK constraint
        await expect(
          pool.query(
            `INSERT INTO automation_rules (board_id, trigger_type, webhook_url)
             VALUES ($1, $2, $3)`,
            [testBoardId, 'invalid.type', 'https://example.com/hook'],
          ),
        ).rejects.toThrow();
      } finally {
        await pool.query('DELETE FROM boards WHERE id = $1', [testBoardId]);
      }
    });

    it('board_id FK CASCADE: deleting a board cascades to automation_rules', async () => {
      const boardResult = await pool.query<{ id: string }>(
        'INSERT INTO boards (name) VALUES ($1) RETURNING id',
        ['Cascade Delete Board'],
      );
      const testBoardId = boardResult.rows[0].id;

      const ruleResult = await pool.query<{ id: string }>(
        `INSERT INTO automation_rules (board_id, trigger_type, webhook_url)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [testBoardId, 'card.moved.done', 'https://example.com/cascade-hook'],
      );
      const ruleId = ruleResult.rows[0].id;

      // Delete board — automation_rules should cascade-delete
      await pool.query('DELETE FROM boards WHERE id = $1', [testBoardId]);

      const orphans = await pool.query(
        'SELECT id FROM automation_rules WHERE id = $1',
        [ruleId],
      );
      expect(orphans.rows).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // trigger_executions table
  // -------------------------------------------------------------------------
  describe('trigger_executions table exists with correct schema', () => {
    it('table has all required columns', async () => {
      const result = await pool.query<{ column_name: string }>(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = 'trigger_executions'
          ORDER BY ordinal_position`,
      );

      const columns = result.rows.map((r) => r.column_name);
      expect(columns).toContain('id');
      expect(columns).toContain('automation_rule_id');
      expect(columns).toContain('board_id');
      expect(columns).toContain('card_id');
      expect(columns).toContain('occurred_at');
    });

    it('automation_rule_id FK CASCADE: deleting an automation_rule cascades to trigger_executions', async () => {
      const boardResult = await pool.query<{ id: string }>(
        'INSERT INTO boards (name) VALUES ($1) RETURNING id',
        ['Execution Cascade Test Board'],
      );
      const testBoardId = boardResult.rows[0].id;

      try {
        const ruleResult = await pool.query<{ id: string }>(
          `INSERT INTO automation_rules (board_id, trigger_type, webhook_url)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [testBoardId, 'card.moved.done', 'https://example.com/exec-hook'],
        );
        const ruleId = ruleResult.rows[0].id;

        await pool.query(
          `INSERT INTO trigger_executions (automation_rule_id, board_id)
           VALUES ($1, $2)`,
          [ruleId, testBoardId],
        );

        // Delete rule — trigger_executions should cascade-delete
        await pool.query('DELETE FROM automation_rules WHERE id = $1', [ruleId]);

        const orphans = await pool.query(
          'SELECT id FROM trigger_executions WHERE automation_rule_id = $1',
          [ruleId],
        );
        expect(orphans.rows).toHaveLength(0);
      } finally {
        await pool.query('DELETE FROM boards WHERE id = $1', [testBoardId]);
      }
    });
  });

  // -------------------------------------------------------------------------
  // webhook_deliveries table
  // -------------------------------------------------------------------------
  describe('webhook_deliveries table exists with correct schema', () => {
    it('table has all required columns with correct defaults', async () => {
      const result = await pool.query<{ column_name: string; is_nullable: string; column_default: string }>(
        `SELECT column_name, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = 'webhook_deliveries'
          ORDER BY ordinal_position`,
      );

      const columns = result.rows.map((r) => r.column_name);
      expect(columns).toContain('id');
      expect(columns).toContain('trigger_execution_id');
      expect(columns).toContain('automation_rule_id');
      expect(columns).toContain('board_id');
      expect(columns).toContain('attempt_count');
      expect(columns).toContain('status');
      expect(columns).toContain('http_response_code');
      expect(columns).toContain('error');
      expect(columns).toContain('created_at');
      expect(columns).toContain('updated_at');

      // status defaults to 'pending' and is NOT NULL
      const statusCol = result.rows.find((r) => r.column_name === 'status');
      expect(statusCol).toBeDefined();
      expect(statusCol!.is_nullable).toBe('NO');
      expect(statusCol!.column_default).toMatch(/pending/);

      // attempt_count defaults to 0 and is NOT NULL
      const attemptCol = result.rows.find((r) => r.column_name === 'attempt_count');
      expect(attemptCol!.is_nullable).toBe('NO');
      expect(attemptCol!.column_default).toContain('0');

      // http_response_code is nullable
      const httpCodeCol = result.rows.find((r) => r.column_name === 'http_response_code');
      expect(httpCodeCol!.is_nullable).toBe('YES');

      // error is nullable
      const errorCol = result.rows.find((r) => r.column_name === 'error');
      expect(errorCol!.is_nullable).toBe('YES');
    });

    it('status CHECK constraint accepts pending, delivered, failed, exhausted and rejects invalid_status', async () => {
      const boardResult = await pool.query<{ id: string }>(
        'INSERT INTO boards (name) VALUES ($1) RETURNING id',
        ['Delivery Status Constraint Board'],
      );
      const testBoardId = boardResult.rows[0].id;

      try {
        const ruleResult = await pool.query<{ id: string }>(
          `INSERT INTO automation_rules (board_id, trigger_type, webhook_url)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [testBoardId, 'card.moved.done', 'https://example.com/status-hook'],
        );
        const ruleId = ruleResult.rows[0].id;

        const execResult = await pool.query<{ id: string }>(
          `INSERT INTO trigger_executions (automation_rule_id, board_id)
           VALUES ($1, $2)
           RETURNING id`,
          [ruleId, testBoardId],
        );
        const execId = execResult.rows[0].id;

        // All valid statuses should succeed
        for (const status of ['pending', 'delivered', 'failed', 'exhausted']) {
          const deliveryResult = await pool.query<{ id: string }>(
            `INSERT INTO webhook_deliveries (trigger_execution_id, automation_rule_id, board_id, status)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [execId, ruleId, testBoardId, status],
          );
          expect(deliveryResult.rows[0].id).toBeDefined();
        }

        // Invalid status should violate CHECK constraint
        await expect(
          pool.query(
            `INSERT INTO webhook_deliveries (trigger_execution_id, automation_rule_id, board_id, status)
             VALUES ($1, $2, $3, $4)`,
            [execId, ruleId, testBoardId, 'invalid_status'],
          ),
        ).rejects.toThrow();
      } finally {
        await pool.query('DELETE FROM boards WHERE id = $1', [testBoardId]);
      }
    });

    it('automation_rule_id FK CASCADE: deleting an automation_rule cascades to webhook_deliveries', async () => {
      const boardResult = await pool.query<{ id: string }>(
        'INSERT INTO boards (name) VALUES ($1) RETURNING id',
        ['Delivery Cascade Test Board'],
      );
      const testBoardId = boardResult.rows[0].id;

      try {
        const ruleResult = await pool.query<{ id: string }>(
          `INSERT INTO automation_rules (board_id, trigger_type, webhook_url)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [testBoardId, 'card.moved.done', 'https://example.com/del-cascade'],
        );
        const ruleId = ruleResult.rows[0].id;

        const execResult = await pool.query<{ id: string }>(
          `INSERT INTO trigger_executions (automation_rule_id, board_id)
           VALUES ($1, $2)
           RETURNING id`,
          [ruleId, testBoardId],
        );
        const execId = execResult.rows[0].id;

        await pool.query(
          `INSERT INTO webhook_deliveries (trigger_execution_id, automation_rule_id, board_id, status)
           VALUES ($1, $2, $3, $4)`,
          [execId, ruleId, testBoardId, 'pending'],
        );

        // Delete rule — webhook_deliveries should cascade-delete
        await pool.query('DELETE FROM automation_rules WHERE id = $1', [ruleId]);

        const orphans = await pool.query(
          'SELECT id FROM webhook_deliveries WHERE automation_rule_id = $1',
          [ruleId],
        );
        expect(orphans.rows).toHaveLength(0);
      } finally {
        await pool.query('DELETE FROM boards WHERE id = $1', [testBoardId]);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Partial index on automation_rules
  // -------------------------------------------------------------------------
  describe('automation_rules partial index exists', () => {
    it('pg_indexes shows a partial index on (board_id, trigger_type) WHERE enabled = true', async () => {
      const result = await pool.query<{ indexname: string; indexdef: string }>(
        `SELECT indexname, indexdef
           FROM pg_indexes
          WHERE tablename = 'automation_rules'
            AND indexdef ILIKE '%enabled%'`,
      );

      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      // The index definition should cover board_id and trigger_type
      const indexDef = result.rows[0].indexdef.toLowerCase();
      expect(indexDef).toContain('board_id');
      expect(indexDef).toContain('trigger_type');
      expect(indexDef).toContain('enabled');
    });
  });
});
