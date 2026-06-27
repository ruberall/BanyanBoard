/**
 * cards.routes.test.ts
 *
 * Phase 2 coverage: cards HTTP endpoints via supertest + mock pool
 *
 * URL patterns:
 *   POST   /columns/:columnId/cards  — create card in column
 *   GET    /columns/:columnId/cards  — list cards in column
 *   GET    /cards/:id               — get single card
 *   PATCH  /cards/:id               — partial update
 *   DELETE /cards/:id               — delete
 *
 * Acceptance Criteria covered:
 *   AC-HAPPY-1 — 201 with card shape on create (title only)
 *   AC-HAPPY-2 — 201 with all optional fields
 *   AC-HAPPY-3 — 200 array response for list
 *   AC-HAPPY-4 — 200 single card GET
 *   AC-HAPPY-5 — 200 PATCH returns updated card
 *   AC-HAPPY-8 — 204 DELETE no body
 *   AC-ERROR-1 — 400 missing title on create
 *   AC-ERROR-2 — 400 title >255 chars
 *   AC-ERROR-3 — 404 column not found
 *   AC-ERROR-4 — 404 card not found (GET/PATCH/DELETE)
 *   AC-ERROR-5 — 400 empty title on PATCH
 *   AC-ERROR-6 — 400 no valid fields on PATCH
 *   AC-ERROR-7 — 400 invalid due_date
 *   AC-ERROR-8 — 400 labels not an array
 *
 * Authentication: requireAuth middleware requires a session. Each describe block
 * uses supertest.agent() + beforeAll login so all requests carry a session cookie.
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
  DATABASE_URL: 'postgres://unused-in-cards-tests',
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

const COL_ID  = 'col-uuid-aaaa-bbbb-cccc-dddddddddddd';
const CARD_ID = 'card-uuid-1111-2222-3333-444444444444';
const NOW = '2026-06-16T00:00:00.000Z';

const fixCard = {
  id: CARD_ID,
  column_id: COL_ID,
  title: 'Write tests',
  description: null,
  due_date: null,
  labels: [],
  position: 0,
  created_at: NOW,
  updated_at: NOW,
};

// ---------------------------------------------------------------------------
// Helper: create a describe-level agent that is already logged in
// ---------------------------------------------------------------------------

function makeAuthenticatedAgent(stubPool: { query: jest.Mock }) {
  const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool as any });
  return supertest.agent(app);
}

// ---------------------------------------------------------------------------
// POST /columns/:columnId/cards
// ---------------------------------------------------------------------------

describe('POST /columns/:columnId/cards', () => {
  const stubPool = { query: jest.fn() } as any;
  const agent = makeAuthenticatedAgent(stubPool);

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

  it('AC-HAPPY-1: returns 201 with card JSON for title-only create', async () => {
    stubPool.query
      .mockResolvedValueOnce({ rows: [fixCard], rowCount: 1 });

    const res = await agent
      .post(`/columns/${COL_ID}/cards`)
      .send({ title: 'Write tests' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: CARD_ID,
      column_id: COL_ID,
      title: 'Write tests',
      description: null,
      labels: [],
      position: 0,
    });
    expect(res.body.created_at).toBeDefined();
  });

  it('AC-HAPPY-2: returns 201 with all optional fields persisted (Label[] shape)', async () => {
    const labelArr = [{ name: 'backend', color: '#e0e7ff' }, { name: 'urgent', color: '#fce7f3' }];
    const fullCard = {
      ...fixCard,
      title: 'Ship v1',
      description: 'Tag and push',
      due_date: '2026-07-01T00:00:00.000Z',
      labels: labelArr,
    };
    stubPool.query
      .mockResolvedValueOnce({ rows: [fullCard], rowCount: 1 });

    const res = await agent
      .post(`/columns/${COL_ID}/cards`)
      .send({ title: 'Ship v1', description: 'Tag and push', due_date: '2026-07-01T00:00:00Z', labels: labelArr });

    expect(res.status).toBe(201);
    expect(res.body.labels).toEqual(labelArr);
    expect(res.body.description).toBe('Tag and push');
  });

  it('AC-ERROR-1: returns 400 when title is missing', async () => {
    const res = await agent
      .post(`/columns/${COL_ID}/cards`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-ERROR-1: returns 400 when title is empty string', async () => {
    const res = await agent
      .post(`/columns/${COL_ID}/cards`)
      .send({ title: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-ERROR-2: returns 400 when title exceeds 255 characters', async () => {
    const res = await agent
      .post(`/columns/${COL_ID}/cards`)
      .send({ title: 'x'.repeat(256) });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-ERROR-7: returns 400 when due_date is not a valid ISO date', async () => {
    const res = await agent
      .post(`/columns/${COL_ID}/cards`)
      .send({ title: 'X', due_date: 'not-a-date' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-ERROR-8: returns 400 when labels is not an array', async () => {
    const res = await agent
      .post(`/columns/${COL_ID}/cards`)
      .send({ title: 'X', labels: 'urgent' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-ERROR-3: returns 404 when column does not exist (FK violation)', async () => {
    const fkError = Object.assign(new Error('FK violation'), { code: '23503' });
    stubPool.query
      .mockRejectedValueOnce(fkError);

    const res = await agent
      .post(`/columns/nonexistent-col-id/cards`)
      .send({ title: 'X' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// GET /columns/:columnId/cards
// ---------------------------------------------------------------------------

describe('GET /columns/:columnId/cards', () => {
  const stubPool = { query: jest.fn() } as any;
  const agent = makeAuthenticatedAgent(stubPool);

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

  it('AC-HAPPY-3: returns 200 with array of cards', async () => {
    const cards = [fixCard, { ...fixCard, id: 'card-2', title: 'Second card' }];
    stubPool.query
      .mockResolvedValueOnce({ rows: cards, rowCount: 2 });

    const res = await agent.get(`/columns/${COL_ID}/cards`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ id: CARD_ID, title: 'Write tests' });
  });

  it('returns 200 with empty array when column has no cards', async () => {
    stubPool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await agent.get(`/columns/${COL_ID}/cards`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GET /cards/:id
// ---------------------------------------------------------------------------

describe('GET /cards/:id', () => {
  const stubPool = { query: jest.fn() } as any;
  const agent = makeAuthenticatedAgent(stubPool);

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

  it('AC-HAPPY-4: returns 200 with full card object', async () => {
    stubPool.query
      .mockResolvedValueOnce({ rows: [fixCard], rowCount: 1 });

    const res = await agent.get(`/cards/${CARD_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: CARD_ID, title: 'Write tests' });
    expect(res.body.updated_at).toBeDefined();
  });

  it('AC-ERROR-4: returns 404 when card does not exist', async () => {
    stubPool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await agent.get('/cards/nonexistent-id');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// PATCH /cards/:id
// ---------------------------------------------------------------------------

describe('PATCH /cards/:id', () => {
  const stubPool = { query: jest.fn() } as any;
  const agent = makeAuthenticatedAgent(stubPool);

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

  it('AC-HAPPY-5: returns 200 with updated card', async () => {
    const updated = { ...fixCard, title: 'Updated title', updated_at: '2026-06-16T01:00:00.000Z' };
    stubPool.query
      .mockResolvedValueOnce({ rows: [updated], rowCount: 1 });

    const res = await agent
      .patch(`/cards/${CARD_ID}`)
      .send({ title: 'Updated title' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated title');
    expect(res.body.updated_at).toBeDefined();
  });

  it('AC-ERROR-5: returns 400 when title is empty string', async () => {
    const res = await agent
      .patch(`/cards/${CARD_ID}`)
      .send({ title: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-ERROR-6: returns 400 when no valid fields provided', async () => {
    const res = await agent
      .patch(`/cards/${CARD_ID}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-ERROR-4: returns 404 when card does not exist', async () => {
    stubPool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await agent
      .patch('/cards/nonexistent-id')
      .send({ title: 'X' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// PATCH /cards/:id/move
// ---------------------------------------------------------------------------

describe('PATCH /cards/:id/move', () => {
  const COL_ID_2 = 'col-uuid-2222-3333-4444-555555555555';

  const stubPool = { query: jest.fn() } as any;
  const agent = makeAuthenticatedAgent(stubPool);

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

  function makeMovedCard(position: number) {
    return { ...fixCard, column_id: COL_ID_2, position };
  }

  it('AC-MOVE-1: returns 200 with card JSON — no after_card_id (insert at top)', async () => {
    const movedCard = makeMovedCard(0.5);
    // findCardById → column check → findCardsByColumnId → moveCard
    stubPool.query
      .mockResolvedValueOnce({ rows: [fixCard], rowCount: 1 })       // findCardById
      .mockResolvedValueOnce({ rows: [{ id: COL_ID_2 }], rowCount: 1 }) // column check
      .mockResolvedValueOnce({ rows: [{ ...fixCard, position: 1.0 }], rowCount: 1 }) // findCardsByColumnId
      .mockResolvedValueOnce({ rows: [movedCard], rowCount: 1 });     // moveCard UPDATE

    const res = await agent
      .patch(`/cards/${CARD_ID}/move`)
      .send({ column_id: COL_ID_2 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ column_id: COL_ID_2 });
    expect(typeof res.body.position).toBe('number');
  });

  it('AC-MOVE-2: returns 200 with card JSON when after_card_id provided', async () => {
    const LAST_CARD_ID = 'card-last-1111-2222-3333-444444444444';
    const lastCard = { ...fixCard, id: LAST_CARD_ID, position: 2.0 };
    const movedCard = makeMovedCard(3.0);
    stubPool.query
      .mockResolvedValueOnce({ rows: [fixCard], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: COL_ID_2 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [lastCard], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [movedCard], rowCount: 1 });

    const res = await agent
      .patch(`/cards/${CARD_ID}/move`)
      .send({ column_id: COL_ID_2, after_card_id: LAST_CARD_ID });

    expect(res.status).toBe(200);
    expect(res.body.position).toBe(3.0);
  });

  it('AC-MOVE-7: returns 400 when column_id is missing', async () => {
    const res = await agent
      .patch(`/cards/${CARD_ID}/move`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-MOVE-7: returns 400 when column_id is empty string', async () => {
    const res = await agent
      .patch(`/cards/${CARD_ID}/move`)
      .send({ column_id: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-MOVE-5: returns 404 when card does not exist', async () => {
    stubPool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // findCardById → NotFoundError

    const res = await agent
      .patch('/cards/nonexistent-card-id/move')
      .send({ column_id: COL_ID_2 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('AC-MOVE-6: returns 404 when destination column does not exist', async () => {
    stubPool.query
      .mockResolvedValueOnce({ rows: [fixCard], rowCount: 1 })  // findCardById
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });         // column check → NotFoundError

    const res = await agent
      .patch(`/cards/${CARD_ID}/move`)
      .send({ column_id: 'nonexistent-col' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('AC-MOVE-9: PATCH /cards/:id (title update) still works after move route added', async () => {
    const updated = { ...fixCard, title: 'Non-regression title' };
    stubPool.query
      .mockResolvedValueOnce({ rows: [updated], rowCount: 1 });

    const res = await agent
      .patch(`/cards/${CARD_ID}`)
      .send({ title: 'Non-regression title' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Non-regression title');
  });
});

// ---------------------------------------------------------------------------
// DELETE /cards/:id
// ---------------------------------------------------------------------------

describe('DELETE /cards/:id', () => {
  const stubPool = { query: jest.fn() } as any;
  const agent = makeAuthenticatedAgent(stubPool);

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

  it('AC-HAPPY-8: returns 204 with no body', async () => {
    stubPool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await agent.delete(`/cards/${CARD_ID}`);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it('AC-ERROR-4: returns 404 when card does not exist', async () => {
    stubPool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await agent.delete('/cards/nonexistent-id');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// PATCH /cards/:id — Label[] validation (Phase 2)
// ---------------------------------------------------------------------------

describe('PATCH /cards/:id — Label[] color validation (Phase 2)', () => {
  const stubPool = { query: jest.fn() } as any;
  const agent = makeAuthenticatedAgent(stubPool);

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

  it('AC-LABEL-1: returns 200 when labels contains valid Label[] with hex color', async () => {
    const updatedCard = {
      ...fixCard,
      labels: [{ name: 'bug', color: '#fce7f3' }],
      updated_at: '2026-06-16T01:00:00.000Z',
    };
    stubPool.query
      .mockResolvedValueOnce({ rows: [updatedCard], rowCount: 1 });

    const res = await agent
      .patch(`/cards/${CARD_ID}`)
      .send({ labels: [{ name: 'bug', color: '#fce7f3' }] });

    expect(res.status).toBe(200);
    expect(res.body.labels).toEqual([{ name: 'bug', color: '#fce7f3' }]);
  });

  it('AC-LABEL-2: returns 400 with descriptive message when label color is not a valid hex', async () => {
    const res = await agent
      .patch(`/cards/${CARD_ID}`)
      .send({ labels: [{ name: 'bug', color: 'red' }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body)).toMatch(/hex color/i);
  });

  it('AC-LABEL-3: returns 200 when label color is omitted (color is optional)', async () => {
    const updatedCard = {
      ...fixCard,
      labels: [{ name: 'bug', color: '#95B9C7' }],
      updated_at: '2026-06-16T01:00:00.000Z',
    };
    stubPool.query
      .mockResolvedValueOnce({ rows: [updatedCard], rowCount: 1 });

    const res = await agent
      .patch(`/cards/${CARD_ID}`)
      .send({ labels: [{ name: 'bug' }] });

    expect(res.status).toBe(200);
  });

  it('AC-LABEL-4: returns 400 when labels is not an array (string instead of Label[])', async () => {
    const res = await agent
      .patch(`/cards/${CARD_ID}`)
      .send({ labels: 'bug' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// PATCH /cards/:id/move — EventService integration (Phase 1)
//
// Verifies that a successful card move causes EventService.emitCardMoved()
// to be called.  The EventService is mocked at the module level so the test
// does not depend on a real event bus or database.
//
// Tests will FAIL until the Coding Agent:
//   1. Implements EventService in src/services/event.service.ts
//   2. Wires EventService into CardService.moveCard() / the move route
// ---------------------------------------------------------------------------

// Module-level mock function for EventService.emitCardMoved — must be at module scope
// so that jest.mock hoisting can close over it before describe blocks execute.
const mockEmitCardMoved = jest.fn().mockResolvedValue(undefined);

jest.mock('../../services/event.service', () => ({
  EventService: jest.fn().mockImplementation(() => ({
    emitCardMoved: mockEmitCardMoved,
  })),
}));

describe('PATCH /cards/:id/move — event emission (Phase 1)', () => {
  const COL_ID_2 = 'col-uuid-2222-3333-4444-555555555555';

  const stubPool = { query: jest.fn() } as any;
  // Pass a mock bus so createRouter constructs EventService (resolved via the jest mock above)
  const mockBus = { publish: jest.fn(), subscribe: jest.fn() };
  const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool as any, bus: mockBus as any });
  const agent = supertest.agent(app);

  beforeAll(async () => {
    stubPool.query
      .mockResolvedValueOnce({ rows: [fixUserRow], rowCount: 1 }); // login
    const loginRes = await agent.post('/auth/login').send({ email: USER_EMAIL, password: USER_PASSWORD });
    if (loginRes.status !== 200) {
      throw new Error(`Login failed in beforeAll: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
    }
    stubPool.query.mockReset();
  });

  afterEach(() => {
    stubPool.query.mockReset();
    mockEmitCardMoved.mockClear();
  });

  it('AC-EVENT-1: successful card move calls EventService.emitCardMoved with correct ids', async () => {
    // Arrange — provide the DB responses the move operation needs
    const movedCard = { ...fixCard, column_id: COL_ID_2, position: 1.0 };
    stubPool.query
      .mockResolvedValueOnce({ rows: [fixCard],              rowCount: 1 }) // findCardById
      .mockResolvedValueOnce({ rows: [{ id: COL_ID_2 }],    rowCount: 1 }) // column existence check
      .mockResolvedValueOnce({ rows: [],                     rowCount: 0 }) // findCardsByColumnId (empty target col)
      .mockResolvedValueOnce({ rows: [movedCard],            rowCount: 1 }); // moveCard UPDATE

    // Act
    const res = await agent
      .patch(`/cards/${CARD_ID}/move`)
      .send({ column_id: COL_ID_2 });

    // Assert HTTP response is still 200
    expect(res.status).toBe(200);

    // Assert EventService.emitCardMoved was called exactly once with the moved card's ids
    expect(mockEmitCardMoved).toHaveBeenCalledTimes(1);
    expect(mockEmitCardMoved).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId:      CARD_ID,
        toColumnId:  COL_ID_2,
      }),
    );
  });
});
