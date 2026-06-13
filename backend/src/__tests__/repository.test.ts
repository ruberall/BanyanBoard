/**
 * repository.test.ts
 *
 * Phase 4 coverage: HealthRepository
 *
 * Two tests:
 *  1. Integration — HealthRepository.ping() returns true against a real DB
 *     (skipped when DATABASE_URL is absent, same pattern as db.test.ts)
 *  2. Unit — HealthRepository accepts a Queryable interface, not a concrete
 *     Pool, verified via a Jest mock that satisfies the interface
 *
 * Tests will FAIL until the Coding Agent implements:
 *   src/repositories/health.repository.ts — HealthRepository class
 *   src/db/queryable.ts (or similar)       — Queryable interface
 */

import { Pool } from 'pg';

// ---------------------------------------------------------------------------
// Guard — skip integration test when no DATABASE_URL is present
// ---------------------------------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL;
const describeIfDb = DATABASE_URL ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HealthRepository', () => {
  // -------------------------------------------------------------------------
  // Unit test — no DB required
  // -------------------------------------------------------------------------
  describe('unit (mock Queryable)', () => {
    it('accepts a Queryable interface — does not require a concrete pg.Pool', async () => {
      // Arrange — build a minimal object that satisfies the Queryable interface.
      // If HealthRepository were coupled to pg.Pool directly, passing this stub
      // would cause a TypeScript compile error, which would surface as a ts-jest
      // transform failure — an acceptable "test fails before implementation" signal.
      const mockQueryable = {
        query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
      };

      // Dynamic import so TypeScript checks the actual compiled types at test time
      const { HealthRepository } = await import('../repositories/health.repository');
      const repo = new HealthRepository(mockQueryable);

      // Act
      const result = await repo.ping();

      // Assert — ping returned truthy and the mock was called
      expect(result).toBe(true);
      expect(mockQueryable.query).toHaveBeenCalledTimes(1);
      // The exact query isn't important — but it should be a SELECT
      const calledWith = mockQueryable.query.mock.calls[0][0] as string;
      expect(calledWith.toUpperCase()).toContain('SELECT');
    });
  });

  // -------------------------------------------------------------------------
  // Integration test — requires live Postgres
  // -------------------------------------------------------------------------
  describeIfDb('integration (requires live Postgres)', () => {
    let pool: Pool;

    beforeAll(() => {
      pool = new Pool({ connectionString: DATABASE_URL });
    });

    afterAll(async () => {
      await pool.end();
    });

    it('ping() returns true when DB is reachable', async () => {
      // Arrange
      const { HealthRepository } = await import('../repositories/health.repository');
      const repo = new HealthRepository(pool);

      // Act
      const result = await repo.ping();

      // Assert
      expect(result).toBe(true);
    });
  });
});
