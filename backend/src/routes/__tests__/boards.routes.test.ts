/**
 * boards.routes.test.ts
 *
 * Integration tests for the boards router:
 *   POST   /boards
 *   GET    /boards
 *   GET    /boards/:id
 *   DELETE /boards/:id
 *
 * Pattern: real Express app via createApp(), stub pool injected so no Postgres
 * connection is required. The stub pool's query mock is shaped to satisfy
 * BoardRepository's SQL calls for each scenario.
 *
 * Authentication: requireAuth middleware requires a session. Each describe block
 * uses supertest.agent() + beforeAll login so all requests carry a session cookie.
 */

import supertest from 'supertest';
import { createApp } from '../../app';
import type { Config } from '../../config';
import type { Logger } from 'pino';

// ---------------------------------------------------------------------------
// Shared stubs (reused from health.test.ts pattern)
// ---------------------------------------------------------------------------

const stubConfig: Config = {
  PORT: 3000,
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://unused-in-boards-tests',
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
// Auth fixtures (shared for beforeAll login)
// ---------------------------------------------------------------------------

const USER_EMAIL    = 'test@example.com';
const USER_PASSWORD = 'securepassword1';
// Pre-computed bcrypt hash for USER_PASSWORD (cost 12):
const USER_HASH     = '$2b$12$iza4wLD3eGM4F/q5nb.cHuLSVMRuZYcie.a3V6b6LwFdYO.LqLPie';
const USER_ID       = 'user-uuid-aaaa-bbbb-cccc';

const fixUserRow = {
  id: USER_ID,
  email: USER_EMAIL,
  password_hash: USER_HASH,
  created_at: '2026-06-17T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Domain fixtures
// ---------------------------------------------------------------------------

const BOARD_ID   = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const BOARD_NAME = 'Sprint Board';
const CREATED_AT = '2026-01-01T00:00:00.000Z';

const fixBoard = { id: BOARD_ID, name: BOARD_NAME, created_at: CREATED_AT };

const fixColumns = [
  { id: 'col-1', board_id: BOARD_ID, name: 'To Do',       position: 1 },
  { id: 'col-2', board_id: BOARD_ID, name: 'In Progress',  position: 2 },
  { id: 'col-3', board_id: BOARD_ID, name: 'Done',         position: 3 },
];

// ---------------------------------------------------------------------------
// POST /boards
// ---------------------------------------------------------------------------

describe('POST /boards', () => {
  const stubPool = { query: jest.fn() } as any;
  const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });
  const agent = supertest.agent(app);

  beforeAll(async () => {
    stubPool.query
      .mockResolvedValueOnce({ rows: [fixUserRow], rowCount: 1 }); // AuthService.login: findByEmail
    const loginRes = await agent.post('/auth/login').send({ email: USER_EMAIL, password: USER_PASSWORD });
    if (loginRes.status !== 200) {
      throw new Error(`Login failed in beforeAll: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
    }
    stubPool.query.mockReset();
  });

  afterEach(() => {
    stubPool.query.mockReset();
  });

  it('AC-ENTRY-1 + AC-HAPPY-1: returns 201 with board JSON and auto-seeded columns', async () => {
    // Arrange — stub pool for: INSERT boards, 3x INSERT columns
    stubPool.query
      // First call: INSERT INTO boards → returns the new board row
      .mockResolvedValueOnce({ rows: [fixBoard], rowCount: 1 })
      // Next 3 calls: INSERT INTO columns → each returns nothing (rowCount = 1)
      .mockResolvedValue({ rows: [], rowCount: 1 });

    // Act
    const response = await agent
      .post('/boards')
      .send({ name: BOARD_NAME });

    // Assert
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ id: BOARD_ID, name: BOARD_NAME });
    expect(response.body.created_at).toBeDefined();
  });

  it('AC-ERROR-1: returns 400 with { error, message } when name is missing', async () => {
    // Act
    const response = await agent
      .post('/boards')
      .send({});

    // Assert
    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
    expect(response.body.message).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// GET /boards
// ---------------------------------------------------------------------------

describe('GET /boards', () => {
  const stubPool = { query: jest.fn() } as any;
  const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });
  const agent = supertest.agent(app);

  beforeAll(async () => {
    stubPool.query
      .mockResolvedValueOnce({ rows: [fixUserRow], rowCount: 1 }); // AuthService.login: findByEmail
    const loginRes = await agent.post('/auth/login').send({ email: USER_EMAIL, password: USER_PASSWORD });
    if (loginRes.status !== 200) {
      throw new Error(`Login failed in beforeAll: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
    }
    stubPool.query.mockReset();
  });

  afterEach(() => {
    stubPool.query.mockReset();
  });

  it('AC-HAPPY-1: no query params → defaults page=1 limit=20, returns envelope', async () => {
    stubPool.query
      .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [fixBoard], rowCount: 1 });

    const response = await agent.get('/boards');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: [{ id: BOARD_ID, name: BOARD_NAME }],
      total: 1,
      page: 1,
      limit: 20,
    });
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it('AC-HAPPY-2: explicit ?page=2&limit=5 → forwarded to service', async () => {
    stubPool.query
      .mockResolvedValueOnce({ rows: [{ count: '10' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const response = await agent.get('/boards?page=2&limit=5');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ page: 2, limit: 5 });
  });

  it('AC-ERROR-1: ?page=0 → 400 VALIDATION_ERROR', async () => {
    const response = await agent.get('/boards?page=0');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-ERROR-1: ?limit=0 → 400 VALIDATION_ERROR', async () => {
    const response = await agent.get('/boards?limit=0');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-ERROR-1: ?limit=101 → 400 VALIDATION_ERROR (max is 100)', async () => {
    const response = await agent.get('/boards?limit=101');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-ERROR-2: ?page=abc → 400 VALIDATION_ERROR (non-numeric)', async () => {
    const response = await agent.get('/boards?page=abc');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-ERROR-2: ?limit=foo → 400 VALIDATION_ERROR (non-numeric)', async () => {
    const response = await agent.get('/boards?limit=foo');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// GET /boards/:id
// ---------------------------------------------------------------------------

describe('GET /boards/:id', () => {
  const stubPool = { query: jest.fn() } as any;
  const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });
  const agent = supertest.agent(app);

  beforeAll(async () => {
    stubPool.query
      .mockResolvedValueOnce({ rows: [fixUserRow], rowCount: 1 }); // AuthService.login: findByEmail
    const loginRes = await agent.post('/auth/login').send({ email: USER_EMAIL, password: USER_PASSWORD });
    if (loginRes.status !== 200) {
      throw new Error(`Login failed in beforeAll: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
    }
    stubPool.query.mockReset();
  });

  afterEach(() => {
    stubPool.query.mockReset();
  });

  it('AC-HAPPY-3: returns 200 with board and its columns array', async () => {
    // Arrange — stub pool for: SELECT board, SELECT columns
    stubPool.query
      .mockResolvedValueOnce({ rows: [fixBoard],   rowCount: 1 })   // board lookup
      .mockResolvedValueOnce({ rows: fixColumns,   rowCount: 3 });   // columns lookup

    // Act
    const response = await agent.get(`/boards/${BOARD_ID}`);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: BOARD_ID, name: BOARD_NAME });
    expect(Array.isArray(response.body.columns)).toBe(true);
    expect(response.body.columns).toHaveLength(3);
    expect(response.body.columns[0]).toMatchObject({ name: 'To Do', position: 1 });
  });

  it('AC-ERROR-2: returns 404 with { error, message } for unknown board id', async () => {
    // Arrange — board lookup returns zero rows → repository throws NotFoundError
    stubPool.query
      .mockResolvedValue({ rows: [], rowCount: 0 });

    // Act
    const response = await agent.get('/boards/non-existent-id');

    // Assert
    expect(response.status).toBe(404);
    expect(response.body.error).toBeDefined();
    expect(response.body.message).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// DELETE /boards/:id
// ---------------------------------------------------------------------------

describe('DELETE /boards/:id', () => {
  const stubPool = { query: jest.fn() } as any;
  const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });
  const agent = supertest.agent(app);

  beforeAll(async () => {
    stubPool.query
      .mockResolvedValueOnce({ rows: [fixUserRow], rowCount: 1 }); // AuthService.login: findByEmail
    const loginRes = await agent.post('/auth/login').send({ email: USER_EMAIL, password: USER_PASSWORD });
    if (loginRes.status !== 200) {
      throw new Error(`Login failed in beforeAll: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
    }
    stubPool.query.mockReset();
  });

  afterEach(() => {
    stubPool.query.mockReset();
  });

  it('AC-HAPPY-4: returns 204 with no body when board is deleted', async () => {
    // Arrange — DELETE query affects 1 row
    stubPool.query
      .mockResolvedValue({ rows: [], rowCount: 1 });

    // Act
    const response = await agent.delete(`/boards/${BOARD_ID}`);

    // Assert
    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
  });
});
