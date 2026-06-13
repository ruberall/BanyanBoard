/**
 * health.test.ts
 *
 * Phase 2 coverage: GET /health endpoint
 *
 * These tests use supertest against the createApp factory — no port binding,
 * no real DB connection required. A mock pool is injected so the health route
 * can be tested in complete isolation from Postgres.
 *
 * Tests will FAIL until the Coding Agent implements:
 *   src/app.ts        — createApp factory
 *   src/routes/health.ts — GET /health handler
 */

import request from 'supertest';
import { createApp } from '../app';
import type { Config } from '../config';
import type { Logger } from 'pino';

// ---------------------------------------------------------------------------
// Minimal stubs — real types live in src/; these satisfy createApp's
// signature without needing a live DB or real logger during these tests.
// ---------------------------------------------------------------------------

/** Minimal config stub — only the fields createApp actually reads */
const stubConfig: Config = {
  PORT: 3000,
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://unused-in-health-tests',
  LOG_LEVEL: 'silent',
  LOG_FORMAT: 'json',
  DB_POOL_MAX: 5,
  DB_POOL_IDLE_TIMEOUT_MS: 10000,
  DB_POOL_CONNECTION_TIMEOUT_MS: 3000,
};

/** Silent pino-compatible logger stub */
const stubLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  trace: () => {},
  fatal: () => {},
  child: () => stubLogger,
} as unknown as Logger;

/** Pool stub — health route calls pool.query('SELECT 1'); resolve it */
const stubPool = {
  query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
} as any;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /health', () => {
  const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

  it('returns HTTP 200', async () => {
    // Arrange — app already created above
    // Act
    const response = await request(app).get('/health');
    // Assert
    expect(response.status).toBe(200);
  });

  it('returns body {"status":"ok"}', async () => {
    // Arrange
    // Act
    const response = await request(app).get('/health');
    // Assert
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('sets Content-Type application/json', async () => {
    // Arrange
    // Act
    const response = await request(app).get('/health');
    // Assert
    expect(response.headers['content-type']).toMatch(/application\/json/);
  });
});
