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
 * Tests will FAIL until the Coding Agent implements:
 *   src/services/board.service.ts     — BoardService
 *   src/routes/boards.ts              — boards router
 *   src/routes/index.ts               — mounts boards router
 */

import request from 'supertest';
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
// Fixtures
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
  it('AC-ENTRY-1 + AC-HAPPY-1: returns 201 with board JSON and auto-seeded columns', async () => {
    // Arrange — stub pool for: INSERT boards, 3x INSERT columns
    const stubPool = {
      query: jest.fn()
        // First call: INSERT INTO boards → returns the new board row
        .mockResolvedValueOnce({ rows: [fixBoard], rowCount: 1 })
        // Next 3 calls: INSERT INTO columns → each returns nothing (rowCount = 1)
        .mockResolvedValue({ rows: [], rowCount: 1 }),
    } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    // Act
    const response = await request(app)
      .post('/boards')
      .send({ name: BOARD_NAME });

    // Assert
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ id: BOARD_ID, name: BOARD_NAME });
    expect(response.body.created_at).toBeDefined();
  });

  it('AC-ERROR-1: returns 400 with { error, message } when name is missing', async () => {
    // Arrange — pool is never reached for invalid input
    const stubPool = { query: jest.fn() } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    // Act
    const response = await request(app)
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

/** Stub pool that returns valid paginated data for GET /boards */
function makeListPool(boards = [fixBoard], total = 1) {
  return {
    query: jest.fn()
      .mockResolvedValueOnce({ rows: [{ count: String(total) }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: boards, rowCount: boards.length }),
  } as any;
}

describe('GET /boards', () => {
  it('AC-HAPPY-1: no query params → defaults page=1 limit=20, returns envelope', async () => {
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: makeListPool() });

    const response = await request(app).get('/boards');

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
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: makeListPool([], 10) });

    const response = await request(app).get('/boards?page=2&limit=5');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ page: 2, limit: 5 });
  });

  it('AC-ERROR-1: ?page=0 → 400 VALIDATION_ERROR', async () => {
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: makeListPool() });

    const response = await request(app).get('/boards?page=0');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-ERROR-1: ?limit=0 → 400 VALIDATION_ERROR', async () => {
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: makeListPool() });

    const response = await request(app).get('/boards?limit=0');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-ERROR-1: ?limit=101 → 400 VALIDATION_ERROR (max is 100)', async () => {
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: makeListPool() });

    const response = await request(app).get('/boards?limit=101');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-ERROR-2: ?page=abc → 400 VALIDATION_ERROR (non-numeric)', async () => {
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: makeListPool() });

    const response = await request(app).get('/boards?page=abc');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-ERROR-2: ?limit=foo → 400 VALIDATION_ERROR (non-numeric)', async () => {
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: makeListPool() });

    const response = await request(app).get('/boards?limit=foo');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// GET /boards/:id
// ---------------------------------------------------------------------------

describe('GET /boards/:id', () => {
  it('AC-HAPPY-3: returns 200 with board and its columns array', async () => {
    // Arrange — stub pool for: SELECT board, SELECT columns
    const stubPool = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [fixBoard],   rowCount: 1 })   // board lookup
        .mockResolvedValueOnce({ rows: fixColumns,   rowCount: 3 }),   // columns lookup
    } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    // Act
    const response = await request(app).get(`/boards/${BOARD_ID}`);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: BOARD_ID, name: BOARD_NAME });
    expect(Array.isArray(response.body.columns)).toBe(true);
    expect(response.body.columns).toHaveLength(3);
    expect(response.body.columns[0]).toMatchObject({ name: 'To Do', position: 1 });
  });

  it('AC-ERROR-2: returns 404 with { error, message } for unknown board id', async () => {
    // Arrange — board lookup returns zero rows → repository throws NotFoundError
    const stubPool = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    // Act
    const response = await request(app).get('/boards/non-existent-id');

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
  it('AC-HAPPY-4: returns 204 with no body when board is deleted', async () => {
    // Arrange — DELETE query affects 1 row
    const stubPool = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
    } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    // Act
    const response = await request(app).delete(`/boards/${BOARD_ID}`);

    // Assert
    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
  });
});
