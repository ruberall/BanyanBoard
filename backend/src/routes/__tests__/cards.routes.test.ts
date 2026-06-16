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
 */

import request from 'supertest';
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
// Fixtures
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
// POST /columns/:columnId/cards
// ---------------------------------------------------------------------------

describe('POST /columns/:columnId/cards', () => {
  it('AC-HAPPY-1: returns 201 with card JSON for title-only create', async () => {
    const stubPool = {
      query: jest.fn().mockResolvedValueOnce({ rows: [fixCard], rowCount: 1 }),
    } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const res = await request(app)
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

  it('AC-HAPPY-2: returns 201 with all optional fields persisted', async () => {
    const fullCard = {
      ...fixCard,
      title: 'Ship v1',
      description: 'Tag and push',
      due_date: '2026-07-01T00:00:00.000Z',
      labels: ['backend', 'urgent'],
    };
    const stubPool = {
      query: jest.fn().mockResolvedValueOnce({ rows: [fullCard], rowCount: 1 }),
    } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const res = await request(app)
      .post(`/columns/${COL_ID}/cards`)
      .send({ title: 'Ship v1', description: 'Tag and push', due_date: '2026-07-01T00:00:00Z', labels: ['backend', 'urgent'] });

    expect(res.status).toBe(201);
    expect(res.body.labels).toEqual(['backend', 'urgent']);
    expect(res.body.description).toBe('Tag and push');
  });

  it('AC-ERROR-1: returns 400 when title is missing', async () => {
    const stubPool = { query: jest.fn() } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const res = await request(app)
      .post(`/columns/${COL_ID}/cards`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-ERROR-1: returns 400 when title is empty string', async () => {
    const stubPool = { query: jest.fn() } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const res = await request(app)
      .post(`/columns/${COL_ID}/cards`)
      .send({ title: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-ERROR-2: returns 400 when title exceeds 255 characters', async () => {
    const stubPool = { query: jest.fn() } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const res = await request(app)
      .post(`/columns/${COL_ID}/cards`)
      .send({ title: 'x'.repeat(256) });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-ERROR-7: returns 400 when due_date is not a valid ISO date', async () => {
    const stubPool = { query: jest.fn() } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const res = await request(app)
      .post(`/columns/${COL_ID}/cards`)
      .send({ title: 'X', due_date: 'not-a-date' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-ERROR-8: returns 400 when labels is not an array', async () => {
    const stubPool = { query: jest.fn() } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const res = await request(app)
      .post(`/columns/${COL_ID}/cards`)
      .send({ title: 'X', labels: 'urgent' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-ERROR-3: returns 404 when column does not exist (FK violation)', async () => {
    const fkError = Object.assign(new Error('FK violation'), { code: '23503' });
    const stubPool = {
      query: jest.fn().mockRejectedValueOnce(fkError),
    } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const res = await request(app)
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
  it('AC-HAPPY-3: returns 200 with array of cards', async () => {
    const cards = [fixCard, { ...fixCard, id: 'card-2', title: 'Second card' }];
    const stubPool = {
      query: jest.fn().mockResolvedValueOnce({ rows: cards, rowCount: 2 }),
    } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const res = await request(app).get(`/columns/${COL_ID}/cards`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ id: CARD_ID, title: 'Write tests' });
  });

  it('returns 200 with empty array when column has no cards', async () => {
    const stubPool = {
      query: jest.fn().mockResolvedValueOnce({ rows: [], rowCount: 0 }),
    } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const res = await request(app).get(`/columns/${COL_ID}/cards`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GET /cards/:id
// ---------------------------------------------------------------------------

describe('GET /cards/:id', () => {
  it('AC-HAPPY-4: returns 200 with full card object', async () => {
    const stubPool = {
      query: jest.fn().mockResolvedValueOnce({ rows: [fixCard], rowCount: 1 }),
    } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const res = await request(app).get(`/cards/${CARD_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: CARD_ID, title: 'Write tests' });
    expect(res.body.updated_at).toBeDefined();
  });

  it('AC-ERROR-4: returns 404 when card does not exist', async () => {
    const stubPool = {
      query: jest.fn().mockResolvedValueOnce({ rows: [], rowCount: 0 }),
    } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const res = await request(app).get('/cards/nonexistent-id');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// PATCH /cards/:id
// ---------------------------------------------------------------------------

describe('PATCH /cards/:id', () => {
  it('AC-HAPPY-5: returns 200 with updated card', async () => {
    const updated = { ...fixCard, title: 'Updated title', updated_at: '2026-06-16T01:00:00.000Z' };
    const stubPool = {
      query: jest.fn().mockResolvedValueOnce({ rows: [updated], rowCount: 1 }),
    } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const res = await request(app)
      .patch(`/cards/${CARD_ID}`)
      .send({ title: 'Updated title' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated title');
    expect(res.body.updated_at).toBeDefined();
  });

  it('AC-ERROR-5: returns 400 when title is empty string', async () => {
    const stubPool = { query: jest.fn() } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const res = await request(app)
      .patch(`/cards/${CARD_ID}`)
      .send({ title: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-ERROR-6: returns 400 when no valid fields provided', async () => {
    const stubPool = { query: jest.fn() } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const res = await request(app)
      .patch(`/cards/${CARD_ID}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-ERROR-4: returns 404 when card does not exist', async () => {
    const stubPool = {
      query: jest.fn().mockResolvedValueOnce({ rows: [], rowCount: 0 }),
    } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const res = await request(app)
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

  function makeMovedCard(position: number) {
    return { ...fixCard, column_id: COL_ID_2, position };
  }

  it('AC-MOVE-1: returns 200 with card JSON — no after_card_id (insert at top)', async () => {
    const movedCard = makeMovedCard(0.5);
    // findCardById → column check → findCardsByColumnId → moveCard
    const stubPool = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [fixCard], rowCount: 1 })       // findCardById
        .mockResolvedValueOnce({ rows: [{ id: COL_ID_2 }], rowCount: 1 }) // column check
        .mockResolvedValueOnce({ rows: [{ ...fixCard, position: 1.0 }], rowCount: 1 }) // findCardsByColumnId
        .mockResolvedValueOnce({ rows: [movedCard], rowCount: 1 }),     // moveCard UPDATE
    } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const res = await request(app)
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
    const stubPool = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [fixCard], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: COL_ID_2 }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [lastCard], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [movedCard], rowCount: 1 }),
    } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const res = await request(app)
      .patch(`/cards/${CARD_ID}/move`)
      .send({ column_id: COL_ID_2, after_card_id: LAST_CARD_ID });

    expect(res.status).toBe(200);
    expect(res.body.position).toBe(3.0);
  });

  it('AC-MOVE-7: returns 400 when column_id is missing', async () => {
    const stubPool = { query: jest.fn() } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const res = await request(app)
      .patch(`/cards/${CARD_ID}/move`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-MOVE-7: returns 400 when column_id is empty string', async () => {
    const stubPool = { query: jest.fn() } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const res = await request(app)
      .patch(`/cards/${CARD_ID}/move`)
      .send({ column_id: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC-MOVE-5: returns 404 when card does not exist', async () => {
    const stubPool = {
      query: jest.fn().mockResolvedValueOnce({ rows: [], rowCount: 0 }), // findCardById → NotFoundError
    } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const res = await request(app)
      .patch('/cards/nonexistent-card-id/move')
      .send({ column_id: COL_ID_2 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('AC-MOVE-6: returns 404 when destination column does not exist', async () => {
    const stubPool = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [fixCard], rowCount: 1 })  // findCardById
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }),         // column check → NotFoundError
    } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const res = await request(app)
      .patch(`/cards/${CARD_ID}/move`)
      .send({ column_id: 'nonexistent-col' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('AC-MOVE-9: PATCH /cards/:id (title update) still works after move route added', async () => {
    const updated = { ...fixCard, title: 'Non-regression title' };
    const stubPool = {
      query: jest.fn().mockResolvedValueOnce({ rows: [updated], rowCount: 1 }),
    } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const res = await request(app)
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
  it('AC-HAPPY-8: returns 204 with no body', async () => {
    const stubPool = {
      query: jest.fn().mockResolvedValueOnce({ rows: [], rowCount: 1 }),
    } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const res = await request(app).delete(`/cards/${CARD_ID}`);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it('AC-ERROR-4: returns 404 when card does not exist', async () => {
    const stubPool = {
      query: jest.fn().mockResolvedValueOnce({ rows: [], rowCount: 0 }),
    } as any;
    const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });

    const res = await request(app).delete('/cards/nonexistent-id');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});
