/**
 * auth.routes.test.ts
 *
 * Integration tests for the auth router via supertest.
 * Uses supertest.agent() to preserve session cookies across requests.
 *
 * These tests will FAIL until the Coding Agent implements:
 *   src/routes/auth.ts              — createAuthRouter(db)
 *   src/services/auth.service.ts    — AuthService
 *   src/repositories/user.repository.ts — UserRepository
 *   src/middleware/requireAuth.ts   — requireAuth
 *   src/app.ts (updated)            — express-session wiring, auth routes mounted
 *
 * Pattern follows boards.routes.test.ts: createApp() with stub pool.
 *
 * Session strategy for tests:
 *   - createApp() wires express-session with MemoryStore (no real DB for sessions)
 *   - supertest.agent() carries cookies between requests
 *   - Tests that need an authenticated session call POST /auth/login first
 */

import supertest from 'supertest';
import { createApp } from '../../app';
import type { Config } from '../../config';
import type { Logger } from 'pino';

// ---------------------------------------------------------------------------
// Shared stubs
// ---------------------------------------------------------------------------

const stubConfig: Config = {
  PORT: 3000,
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://unused-in-auth-tests',
  LOG_LEVEL: 'silent',
  LOG_FORMAT: 'json',
  DB_POOL_MAX: 5,
  DB_POOL_IDLE_TIMEOUT_MS: 10000,
  DB_POOL_CONNECTION_TIMEOUT_MS: 3000,
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
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID       = 'user-uuid-bbbb-cccc-dddd';
const USER_EMAIL    = 'bob@example.com';
const USER_PASSWORD = 'securepassword1';
// Pre-computed bcrypt hash for USER_PASSWORD (cost 12):
// Generated via: bcrypt.hashSync('securepassword1', 12)
const USER_HASH     = '$2b$12$iza4wLD3eGM4F/q5nb.cHuLSVMRuZYcie.a3V6b6LwFdYO.LqLPie';
const CREATED_AT    = '2026-06-17T00:00:00.000Z';

const fixUserRow = {
  id: USER_ID,
  email: USER_EMAIL,
  password_hash: USER_HASH,
  created_at: CREATED_AT,
};

const fixPublicUserRow = {
  id: USER_ID,
  email: USER_EMAIL,
  created_at: CREATED_AT,
};

// ---------------------------------------------------------------------------
// POST /auth/register
// ---------------------------------------------------------------------------

describe('POST /auth/register', () => {
  it('AC-REG-1: returns 201 with PublicUser (no password_hash) for valid body', async () => {
    // Arrange — stub pool: findByEmail returns null (no duplicate), createUser returns row
    const stubPool = {
      query: jest.fn()
        // findByEmail check → no existing user
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        // createUser INSERT → new user row
        .mockResolvedValueOnce({ rows: [fixUserRow], rowCount: 1 }),
    } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    // Act
    const response = await supertest(app)
      .post('/auth/register')
      .send({ email: USER_EMAIL, password: USER_PASSWORD });

    // Assert
    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    expect(response.body.email).toBe(USER_EMAIL);
    expect(response.body.created_at).toBeDefined();
    expect(response.body.password_hash).toBeUndefined();
  });

  it('AC-REG-2: returns 409 CONFLICT for duplicate email', async () => {
    // Arrange — stub pool: findByEmail returns existing user → service throws ConflictError
    const stubPool = {
      query: jest.fn()
        // findByEmail finds existing user
        .mockResolvedValueOnce({ rows: [fixUserRow], rowCount: 1 }),
    } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    // Act
    const response = await supertest(app)
      .post('/auth/register')
      .send({ email: USER_EMAIL, password: USER_PASSWORD });

    // Assert
    expect(response.status).toBe(409);
    expect(response.body.error).toBe('CONFLICT');
  });

  it('AC-REG-3: returns 400 VALIDATION_ERROR when email is missing', async () => {
    // Arrange — pool never reached for invalid input
    const stubPool = { query: jest.fn() } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    // Act
    const response = await supertest(app)
      .post('/auth/register')
      .send({ password: USER_PASSWORD });

    // Assert
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-REG-4: returns 400 VALIDATION_ERROR for invalid email format', async () => {
    const stubPool = { query: jest.fn() } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const response = await supertest(app)
      .post('/auth/register')
      .send({ email: 'not-an-email', password: USER_PASSWORD });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-REG-5: returns 400 VALIDATION_ERROR when password is shorter than 8 characters', async () => {
    const stubPool = { query: jest.fn() } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const response = await supertest(app)
      .post('/auth/register')
      .send({ email: USER_EMAIL, password: 'short' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-REG-6: returns 400 VALIDATION_ERROR when password is missing', async () => {
    const stubPool = { query: jest.fn() } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const response = await supertest(app)
      .post('/auth/register')
      .send({ email: USER_EMAIL });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------

describe('POST /auth/login', () => {
  it('AC-LOGIN-1: returns 200 with PublicUser and Set-Cookie header for valid credentials', async () => {
    // Arrange — stub pool: findByEmail returns user with real hash for bcrypt.compare
    // NOTE: The hash must actually match USER_PASSWORD for bcrypt.compare to succeed.
    // We use a real bcrypt hash of USER_PASSWORD so the integration path works end-to-end.
    const stubPool = {
      query: jest.fn()
        // findByEmail → user with hash
        .mockResolvedValueOnce({ rows: [fixUserRow], rowCount: 1 }),
    } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    // Act
    const response = await supertest(app)
      .post('/auth/login')
      .send({ email: USER_EMAIL, password: USER_PASSWORD });

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.id).toBeDefined();
    expect(response.body.email).toBe(USER_EMAIL);
    expect(response.body.created_at).toBeDefined();
    expect(response.body.password_hash).toBeUndefined();
    // Session cookie must be set
    const setCookieHeader = response.headers['set-cookie'];
    expect(setCookieHeader).toBeDefined();
  });

  it('AC-LOGIN-2: returns 401 "Invalid email or password" for wrong password', async () => {
    // Arrange — findByEmail returns user but bcrypt.compare will return false
    const stubPool = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [fixUserRow], rowCount: 1 }),
    } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    // Act
    const response = await supertest(app)
      .post('/auth/login')
      .send({ email: USER_EMAIL, password: 'wrongpassword1' });

    // Assert
    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid email or password');
  });

  it('AC-LOGIN-3: returns 401 "Invalid email or password" for non-existent email (no enumeration)', async () => {
    // Arrange — findByEmail returns nothing
    const stubPool = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }),
    } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    // Act
    const response = await supertest(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: USER_PASSWORD });

    // Assert — SAME message as wrong-password (anti-enumeration)
    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid email or password');
  });
});

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------

describe('POST /auth/logout', () => {
  it('AC-LOGOUT-1: returns 200 with empty body', async () => {
    const stubPool = { query: jest.fn() } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const response = await supertest(app).post('/auth/logout');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// GET /auth/me
// ---------------------------------------------------------------------------

describe('GET /auth/me', () => {
  it('AC-ME-1: returns 401 without a session cookie', async () => {
    const stubPool = { query: jest.fn() } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const response = await supertest(app).get('/auth/me');

    expect(response.status).toBe(401);
  });

  it('AC-ME-2: returns 200 with PublicUser after a successful login', async () => {
    // Arrange — agent preserves cookies between requests
    const stubPool = {
      query: jest.fn()
        // 1. POST /auth/login: findByEmail
        .mockResolvedValueOnce({ rows: [fixUserRow], rowCount: 1 })
        // 2. GET /auth/me: findById (called by getMe)
        .mockResolvedValueOnce({ rows: [fixPublicUserRow], rowCount: 1 }),
    } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });
    const agent = supertest.agent(app);

    // Login first to establish session
    await agent
      .post('/auth/login')
      .send({ email: USER_EMAIL, password: USER_PASSWORD });

    // Act
    const response = await agent.get('/auth/me');

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(USER_ID);
    expect(response.body.email).toBe(USER_EMAIL);
    expect(response.body.password_hash).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Route protection integration: GET /boards requires session
// ---------------------------------------------------------------------------

describe('Route protection: GET /boards', () => {
  it('AC-PROTECT-1: returns 401 when no session cookie is present', async () => {
    // Arrange — boards list query would succeed if reached, but requireAuth should block first
    const stubPool = {
      query: jest.fn()
        .mockResolvedValue({ rows: [{ count: '0' }], rowCount: 1 }),
    } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    // Act — no cookie on plain request()
    const response = await supertest(app).get('/boards');

    // Assert — blocked at auth gate, not at boards route
    expect(response.status).toBe(401);
  });

  it('AC-PROTECT-2: returns 200 (not 401) with a valid session after login', async () => {
    // Arrange — stub pool handles: login findByEmail, then boards COUNT + SELECT
    const stubPool = {
      query: jest.fn()
        // 1. POST /auth/login: findByEmail
        .mockResolvedValueOnce({ rows: [fixUserRow], rowCount: 1 })
        // 2. GET /boards: COUNT query
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        // 3. GET /boards: SELECT boards query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }),
    } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });
    const agent = supertest.agent(app);

    // Login to establish session
    await agent
      .post('/auth/login')
      .send({ email: USER_EMAIL, password: USER_PASSWORD });

    // Act
    const response = await agent.get('/boards');

    // Assert — auth passed, boards handler responded
    expect(response.status).toBe(200);
  });
});
