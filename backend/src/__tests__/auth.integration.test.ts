/**
 * auth.integration.test.ts
 *
 * Real-DB smoke test for the full auth lifecycle:
 *   register → auto-login → access boards → logout → re-login → /me
 *
 * Requires a live Postgres instance. Tests are skipped gracefully when
 * DATABASE_URL is absent so unit-only CI runs stay green.
 *
 * connect-pg-simple creates the `sessions` table automatically via
 * `createTableIfMissing: true` (wired in app.ts).
 */

import { Pool } from 'pg';
import supertest from 'supertest';
import { createApp } from '../app';
import { runMigrations } from '../db/migrate';
import type { Config } from '../config';
import type { Logger } from 'pino';

// ---------------------------------------------------------------------------
// Guard — skip entire suite when no real DB is available
// ---------------------------------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL;
const describeIfDb = DATABASE_URL ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Shared config and logger for the smoke app
// ---------------------------------------------------------------------------
const smokeConfig: Config = {
  PORT: 3000,
  NODE_ENV: 'integration',
  DATABASE_URL: DATABASE_URL ?? 'postgres://missing',
  LOG_LEVEL: 'silent',
  LOG_FORMAT: 'json',
  DB_POOL_MAX: 2,
  DB_POOL_IDLE_TIMEOUT_MS: 5000,
  DB_POOL_CONNECTION_TIMEOUT_MS: 3000,
  SESSION_SECRET: 'smoke_test_secret_at_least_32_chars_long',
  SESSION_COOKIE_MAX_AGE_MS: 3600000,
  SESSION_SECURE: false,
};

const stubLogger = {
  info:  () => {},
  warn:  () => {},
  error: () => {},
  debug: () => {},
  trace: () => {},
  fatal: () => {},
  child: () => stubLogger,
} as unknown as Logger;

// ---------------------------------------------------------------------------
// Smoke tests — full auth lifecycle against real Postgres
// ---------------------------------------------------------------------------
describeIfDb('Auth lifecycle smoke tests (real DB)', () => {
  let pool: Pool;
  // Unique email per run so parallel test runs don't conflict
  const SMOKE_EMAIL = `smoke-${Date.now()}@example.com`;
  const SMOKE_PASSWORD = 'SmokePassword1';

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    await runMigrations(pool, smokeConfig);
  });

  afterAll(async () => {
    // Clean up smoke user and their sessions
    await pool.query('DELETE FROM users WHERE email = $1', [SMOKE_EMAIL]);
    await pool.end();
  });

  it('AC-SMOKE-1: POST /auth/register returns 201 with user (no password_hash) and sets session cookie', async () => {
    const app = createApp({ config: smokeConfig, logger: stubLogger, pool });
    const agent = supertest.agent(app);

    const response = await agent
      .post('/auth/register')
      .send({ email: SMOKE_EMAIL, password: SMOKE_PASSWORD });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    expect(response.body.email).toBe(SMOKE_EMAIL);
    expect(response.body.created_at).toBeDefined();
    expect(response.body.password_hash).toBeUndefined();
    const setCookie = response.headers['set-cookie'];
    expect(setCookie).toBeDefined();
  });

  it('AC-SMOKE-2: GET /boards returns 200 immediately after registration (auto-login session active)', async () => {
    const app = createApp({ config: smokeConfig, logger: stubLogger, pool });
    const agent = supertest.agent(app);

    // Register — sets session via auto-login
    const regRes = await agent
      .post('/auth/register')
      .send({ email: `smoke2-${Date.now()}@example.com`, password: SMOKE_PASSWORD });

    const boardsResponse = await agent.get('/boards');
    expect(boardsResponse.status).toBe(200);

    // Cleanup by primary key to avoid clobbering concurrent runs
    await pool.query('DELETE FROM users WHERE id = $1', [regRes.body.id]);
  });

  it('AC-SMOKE-3: POST /auth/logout after login returns 200 {}', async () => {
    const app = createApp({ config: smokeConfig, logger: stubLogger, pool });
    const agent = supertest.agent(app);

    await agent.post('/auth/login').send({ email: SMOKE_EMAIL, password: SMOKE_PASSWORD });

    const response = await agent.post('/auth/logout');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({});
  });

  it('AC-SMOKE-4: GET /boards returns 401 after logout (session destroyed)', async () => {
    const app = createApp({ config: smokeConfig, logger: stubLogger, pool });
    const agent = supertest.agent(app);

    await agent.post('/auth/login').send({ email: SMOKE_EMAIL, password: SMOKE_PASSWORD });
    await agent.post('/auth/logout');

    const response = await agent.get('/boards');
    expect(response.status).toBe(401);
  });

  it('AC-SMOKE-5: POST /auth/login with registered credentials returns 200 with user + session cookie', async () => {
    const app = createApp({ config: smokeConfig, logger: stubLogger, pool });

    const response = await supertest(app)
      .post('/auth/login')
      .send({ email: SMOKE_EMAIL, password: SMOKE_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.email).toBe(SMOKE_EMAIL);
    expect(response.body.password_hash).toBeUndefined();
    expect(response.headers['set-cookie']).toBeDefined();
  });

  it('AC-SMOKE-6: GET /auth/me after fresh login returns user profile', async () => {
    const app = createApp({ config: smokeConfig, logger: stubLogger, pool });
    const agent = supertest.agent(app);

    await agent.post('/auth/login').send({ email: SMOKE_EMAIL, password: SMOKE_PASSWORD });

    const response = await agent.get('/auth/me');
    expect(response.status).toBe(200);
    expect(response.body.email).toBe(SMOKE_EMAIL);
    expect(response.body.id).toBeDefined();
    expect(response.body.password_hash).toBeUndefined();
  });
});
