/**
 * db.test.ts
 *
 * Phase 3 coverage: DB pool creation and migration execution
 *
 * These are TRUE integration tests — they require a live Postgres instance.
 * Set DATABASE_URL in your environment (or docker-compose sets it) before
 * running. Tests are skipped gracefully if DATABASE_URL is absent.
 *
 * Tests will FAIL until the Coding Agent implements:
 *   src/db/pool.ts    — createPool(config): pg.Pool
 *   src/db/migrate.ts — runMigrations(pool, config)
 *   src/config.ts     — Config type
 *   migrations/       — at least one migration file
 */

import { Pool } from 'pg';
import { createPool } from '../db/pool';
import { runMigrations } from '../db/migrate';
import type { Config } from '../config';

// ---------------------------------------------------------------------------
// Guard — skip entire suite if no DATABASE_URL is present so CI stays green
// on environments without Postgres (unit-only runs).
// ---------------------------------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL;

const describeIfDb = DATABASE_URL ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Minimal config for DB tests
// ---------------------------------------------------------------------------
const dbConfig: Config = {
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
// Tests
// ---------------------------------------------------------------------------

describeIfDb('DB pool (integration — requires live Postgres)', () => {
  let pool: Pool;

  beforeAll(() => {
    // Arrange — create pool once for the suite
    pool = createPool(dbConfig);
  });

  afterAll(async () => {
    // Teardown — release all connections
    await pool.end();
  });

  it('pool connects and can run SELECT 1', async () => {
    // Act
    const result = await pool.query<{ value: number }>('SELECT 1 AS value');
    // Assert
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].value).toBe(1);
  });

  it('pgmigrations table exists after runMigrations()', async () => {
    // Arrange — run migrations (idempotent, safe to re-run)
    await runMigrations(pool, dbConfig);

    // Act — query information_schema
    const result = await pool.query<{ table_name: string }>(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'pgmigrations'`
    );

    // Assert
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].table_name).toBe('pgmigrations');
  });

  it('at least one migration entry is recorded in pgmigrations', async () => {
    // Arrange — migrations already ran in previous test; pool is still open
    // Act
    const result = await pool.query<{ id: number; name: string; run_on: Date }>(
      'SELECT id, name, run_on FROM pgmigrations ORDER BY run_on ASC'
    );

    // Assert
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
    // Each entry must have a name and a timestamp
    for (const row of result.rows) {
      expect(typeof row.name).toBe('string');
      expect(row.name.length).toBeGreaterThan(0);
      expect(row.run_on).toBeInstanceOf(Date);
    }
  });
});
